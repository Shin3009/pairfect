import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore/lite';
import { loadLeaderboard, loadPlayerName, loadSyncedBest, saveSyncedBest, type OnlineBest } from './game/storage';

/**
 * Đồng bộ kỷ lục của người chơi lên Cloud Firestore (Firebase).
 * - Cấu hình lấy từ biến môi trường VITE_FIREBASE_* lúc build (xem .env.example); thiếu thì tắt hẳn phần này.
 * - Mỗi người chơi một document `highscores/<uid>`: tên hiện tại, kỷ lục trên máy (điểm cao nhất trên
 *   bảng xếp hạng) và màn lúc đạt kỷ lục.
 * - Người chơi được đăng nhập ẩn danh (Firebase Auth, không cần nhập gì) để firestore.rules chỉ cho
 *   chính họ ghi document của mình, và kỷ lục chỉ được tăng.
 * - So bản cần có trên mạng với bản đã gửi thành công lần trước; khác thì gửi. Gửi lỗi (mất mạng...) thì để đó,
 *   lần đồng bộ sau gửi lại: khi có mạng trở lại, khi mở app, sau mỗi lượt thua và khi đổi tên.
 * - Thư viện Firebase chỉ được tải ở lần gửi đầu tiên, để không làm chậm lúc mở game.
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

let syncing = false;

/**
 * Gửi kỷ lục lên mạng nếu nó khác bản đã gửi (kỷ lục mới, đổi tên, lần trước gửi lỗi). Không cần đợi: lỗi chỉ ghi ra console.
 * Đang gửi dở thì thôi: lần gửi đó xong sẽ tự kiểm tra lại và gửi tiếp nếu có gì mới.
 */
export async function syncBest(): Promise<void> {
  const config = firebaseConfig();
  if (!config || syncing) return;
  syncing = true;
  try {
    for (let want = wanted(); want && !same(want, loadSyncedBest()); want = wanted()) {
      if (!(await upload(config, want))) return;
      saveSyncedBest(want);
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
