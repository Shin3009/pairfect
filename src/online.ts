import type { Auth } from 'firebase/auth';
import type { DocumentData, Firestore } from 'firebase/firestore/lite';
import {
  cleanName,
  compareEntries,
  loadLeaderboard,
  loadPlayerName,
  loadSyncedBest,
  saveSyncedBest,
  type OnlineBest,
} from './game/storage';

/**
 * Đồng bộ kỷ lục của người chơi lên Cloud Firestore (Firebase).
 * - Cấu hình lấy từ biến môi trường VITE_FIREBASE_* lúc build (xem .env.example); thiếu thì tắt hẳn phần này.
 * - Mỗi người chơi một document `highscores/<uid>`: tên hiện tại, kỷ lục trên máy (điểm cao nhất trên
 *   bảng xếp hạng) và màn lúc đạt kỷ lục.
 * - Người chơi được đăng nhập ẩn danh (Firebase Auth, không cần nhập gì) để firestore.rules chỉ cho
 *   chính họ ghi document của mình, và kỷ lục chỉ được tăng.
 * - So bản cần có trên mạng với bản đã gửi thành công lần trước; khác thì gửi. Gửi lỗi (mất mạng...) thì để đó,
 *   lần đồng bộ sau gửi lại: khi có mạng trở lại, khi mở app, sau mỗi lượt thua và khi đổi tên.
 * - Bảng xếp hạng online (fetchOnlineBoard) đọc lại collection đó, sắp theo điểm; ai cũng đọc được.
 * - Thư viện Firebase chỉ được tải ở lần gửi (hoặc lần đọc bảng) đầu tiên, để không làm chậm lúc mở game.
 */
const COLLECTION = 'highscores';

interface FirebaseConfig {
  apiKey: string;
  projectId: string;
}

function firebaseConfig(): FirebaseConfig | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  return apiKey && projectId ? { apiKey, projectId } : null;
}

let services: Promise<{ auth: Auth; db: Firestore }> | null = null;

function connect(config: FirebaseConfig): Promise<{ auth: Auth; db: Firestore }> {
  services ??= Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore/lite')]).then(
    ([{ initializeApp }, { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence }, { getFirestore }]) => {
      const app = initializeApp(config);
      // Không dùng getAuth(): nó nạp thêm phần đăng nhập qua cửa sổ bật lên / chuyển trang, đăng nhập ẩn danh không cần.
      // Phiên đăng nhập lưu trong IndexedDB nên lần sau mở app vẫn là người chơi cũ (cùng uid).
      const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
      return { auth, db: getFirestore(app) };
    },
    (e: unknown) => {
      services = null; // tải thư viện lỗi: lần sau thử tải lại
      throw e;
    },
  );
  return services;
}

/** Bản build có cấu hình Firebase hay không; không có thì không có bảng xếp hạng online. */
export function onlineEnabled(): boolean {
  return firebaseConfig() !== null;
}

/** Gọi một lần khi mở app: đồng bộ ngay, và đồng bộ lại mỗi khi có mạng trở lại. */
export function initOnline(): void {
  if (!firebaseConfig()) return;
  window.addEventListener('online', () => void syncBest());
  void syncBest();
}

/** Bản cần có trên mạng: tên hiện tại kèm kỷ lục trên máy. Chưa có tên hoặc chưa có điểm thì chưa gửi. */
function wanted(): OnlineBest | null {
  const name = loadPlayerName();
  const best = loadLeaderboard()[0];
  return name && best && best.score > 0 ? { name, score: best.score, stage: best.stage } : null;
}

function same(a: OnlineBest, b: OnlineBest | null): boolean {
  return !!b && a.name === b.name && a.score === b.score && a.stage === b.stage;
}

/**
 * Kết quả một lần gửi, để báo cho người chơi (main.ts hiện thông báo nhỏ).
 * Thành công thì kèm bản đã gửi trước đó, để biết lần này là kỷ lục mới hay chỉ đổi tên.
 */
export type SyncResult = { ok: true; best: OnlineBest; previous: OnlineBest | null } | { ok: false; best: OnlineBest };

const listeners = new Set<(result: SyncResult) => void>();

/** Nghe kết quả mỗi lần gửi (không gửi gì vì không có gì mới thì không báo). Trả về hàm gỡ. */
export function onSyncResult(listener: (result: SyncResult) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let syncing = false;

/**
 * Gửi kỷ lục lên mạng nếu nó khác bản đã gửi (kỷ lục mới, đổi tên, lần trước gửi lỗi). Không cần đợi: lỗi chỉ ghi
 * ra console và báo qua onSyncResult. Đang gửi dở thì thôi: lần gửi đó xong sẽ tự kiểm tra lại và gửi tiếp nếu có gì mới.
 */
export async function syncBest(): Promise<void> {
  const config = firebaseConfig();
  if (!config || syncing) return;
  syncing = true;
  try {
    for (let want = wanted(); want && !same(want, loadSyncedBest()); want = wanted()) {
      const best = want;
      const previous = loadSyncedBest();
      if (!(await upload(config, best))) {
        listeners.forEach((fn) => fn({ ok: false, best }));
        return;
      }
      saveSyncedBest(best);
      listeners.forEach((fn) => fn({ ok: true, best, previous }));
    }
  } finally {
    syncing = false;
  }
}

/** Ghi kỷ lục vào document của người chơi. Trả về false nếu lỗi. */
async function upload(config: FirebaseConfig, best: OnlineBest): Promise<boolean> {
  try {
    const { auth, db } = await connect(config);
    const [{ signInAnonymously }, { doc, setDoc, serverTimestamp }] = await Promise.all([
      import('firebase/auth'),
      import('firebase/firestore/lite'),
    ]);
    // Chờ đọc xong phiên đăng nhập đã lưu; chưa có thì tạo người chơi ẩn danh mới
    await auth.authStateReady();
    const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
    await setDoc(doc(db, COLLECTION, user.uid), {
      name: best.name,
      score: best.score,
      stage: best.stage,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (e) {
    console.warn('Gửi kỷ lục lên Firebase lỗi, sẽ thử lại sau:', e);
    return false;
  }
}

// ---------------- Bảng xếp hạng online ----------------

/** Một người chơi trên bảng xếp hạng online. */
export interface OnlineEntry {
  uid: string;
  name: string;
  score: number;
  stage: number;
  /** Lúc gửi kỷ lục, tính bằng mili giây; chỉ dùng để xếp các người chơi bằng điểm và bằng màn. */
  date: number;
}

export interface OnlineBoard {
  /** Những người chơi điểm cao nhất, hạng 1 trước. */
  top: OnlineEntry[];
  /** Người chơi trên máy này: thứ hạng (từ 1) và dòng của họ; null nếu họ chưa có trên bảng. */
  me: { rank: number; entry: OnlineEntry } | null;
}

/** Đợi lâu hơn thì coi như lỗi, để màn hình không quay "Đang tải" mãi khi mạng chập chờn. */
const LOAD_TIMEOUT_MS = 15000;

/**
 * Document của người chơi khác thành một dòng trên bảng. Ai cũng gửi được dữ liệu bất kỳ (trong giới hạn của
 * firestore.rules), nên tên được làm sạch như tên nhập trên máy, và dòng sai định dạng bị bỏ qua.
 */
function toEntry(uid: string, d: DocumentData): OnlineEntry | null {
  const { name, score, stage, updatedAt } = d;
  if (typeof name !== 'string' || !Number.isFinite(score) || !Number.isFinite(stage)) return null;
  const date = typeof updatedAt?.toMillis === 'function' ? (updatedAt.toMillis() as number) : 0;
  return { uid, name: cleanName(name) || '?', score, stage, date };
}

/**
 * Tải bảng xếp hạng online: `size` người chơi điểm cao nhất, kèm thứ hạng của người chơi trên máy này.
 * Gửi kỷ lục còn chờ (nếu có) trước, để bảng có luôn điểm mới nhất của họ. Lỗi hoặc quá lâu thì báo lỗi.
 * Ai cũng đọc được bảng nên không cần đăng nhập; chỉ dùng phiên đăng nhập sẵn có để tìm dòng của người chơi.
 */
export function fetchOnlineBoard(size: number): Promise<OnlineBoard> {
  const config = firebaseConfig();
  if (!config) return Promise.reject(new Error('Chưa cấu hình Firebase'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Tải bảng xếp hạng quá lâu')), LOAD_TIMEOUT_MS);
    loadBoard(config, size).then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

async function loadBoard(config: FirebaseConfig, size: number): Promise<OnlineBoard> {
  await syncBest();
  const { auth, db } = await connect(config);
  const { collection, doc, getCount, getDoc, getDocs, limit, orderBy, query, where } = await import(
    'firebase/firestore/lite'
  );
  await auth.authStateReady();
  const uid = auth.currentUser?.uid ?? null;
  const col = collection(db, COLLECTION);
  // Chỉ sắp theo điểm: sắp thêm theo màn thì Firestore đòi tạo chỉ mục ghép. Bằng điểm thì sắp lại ngay dưới đây.
  const [snap, mine] = await Promise.all([
    getDocs(query(col, orderBy('score', 'desc'), limit(size))),
    uid ? getDoc(doc(db, COLLECTION, uid)) : null,
  ]);
  const top = snap.docs
    .map((d) => toEntry(d.id, d.data()))
    .filter((e): e is OnlineEntry => e !== null)
    .sort(compareEntries);

  const i = top.findIndex((e) => e.uid === uid);
  if (i >= 0) return { top, me: { rank: i + 1, entry: top[i] } };
  const entry = uid && mine?.exists() ? toEntry(uid, mine.data()) : null;
  if (!entry) return { top, me: null };
  // Ngoài nhóm đầu: hạng = số người điểm cao hơn + 1. Không lọt nhóm đầu nghĩa là đứng sau cả nhóm đó
  // (có thể vì bằng điểm người cuối nhóm nhưng xếp sau).
  const above = await getCount(query(col, where('score', '>', entry.score)));
  return { top, me: { rank: Math.max(above.data().count, top.length) + 1, entry } };
}
