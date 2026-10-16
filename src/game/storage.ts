/**
 * Lưu vào localStorage: bảng xếp hạng (kỷ lục là điểm cao nhất trên bảng), tên người chơi,
 * bản kỷ lục đã gửi lên mạng (xem online.ts) và bộ hình ô đang chọn.
 * Không phụ thuộc Phaser. Mọi lỗi lưu trữ (trình duyệt chặn, chế độ ẩn danh...) đều được bỏ qua.
 */

const LEADERBOARD_KEY = 'pairfect-leaderboard';
const PLAYER_NAME_KEY = 'pairfect-player-name';
const SYNCED_BEST_KEY = 'pairfect-synced-best';
const TILE_ART_KEY = 'pairfect-tile-art';

/** Số lượt chơi giữ lại trên bảng xếp hạng. */
export const LEADERBOARD_SIZE = 10;

/** Một lượt chơi đã kết thúc vì thua (hết giờ hoặc hết nước đi). */
export interface LeaderboardEntry {
  score: number;
  /** Màn đang chơi lúc thua, đánh số từ 1 như trên HUD. */
  stage: number;
  /** Thời điểm kết thúc, tính bằng mili giây (Date.now()). */
  date: number;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* bỏ qua nếu trình duyệt chặn lưu trữ */
  }
}

/** Đọc JSON đã lưu; không có hoặc hỏng thì trả về null. */
function readJson(key: string): unknown {
  try {
    return JSON.parse(read(key) ?? 'null');
  } catch {
    return null;
  }
}

/** Thứ tự xếp hạng: điểm cao hơn đứng trên; bằng điểm thì màn xa hơn; vẫn bằng thì lượt chơi trước đứng trên. */
export function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  return b.score - a.score || b.stage - a.stage || a.date - b.date;
}

/**
 * Chèn `entry` vào bảng xếp hạng rồi cắt còn LEADERBOARD_SIZE dòng. Không sửa mảng đầu vào.
 * `rank` là thứ hạng của `entry` (từ 1), hoặc null nếu nó không lọt vào bảng.
 */
export function insertEntry(
  list: LeaderboardEntry[],
  entry: LeaderboardEntry,
): { list: LeaderboardEntry[]; rank: number | null } {
  const next = [...list, entry].sort(compareEntries).slice(0, LEADERBOARD_SIZE);
  const i = next.indexOf(entry);
  return { list: next, rank: i < 0 ? null : i + 1 };
}

function isEntry(e: unknown): e is LeaderboardEntry {
  if (typeof e !== 'object' || e === null) return false;
  const { score, stage, date } = e as Record<string, unknown>;
  return [score, stage, date].every((v) => typeof v === 'number' && Number.isFinite(v));
}

/** Bảng xếp hạng, hạng 1 trước. Dữ liệu hỏng hoặc không đọc được thì coi như bảng trống. */
export function loadLeaderboard(): LeaderboardEntry[] {
  const list = readJson(LEADERBOARD_KEY);
  if (!Array.isArray(list)) return [];
  return list.filter(isEntry).sort(compareEntries).slice(0, LEADERBOARD_SIZE);
}

/** Kỷ lục: điểm cao nhất trên bảng xếp hạng, nên bỏ cuộc giữa chừng không tính. Bảng trống thì là 0. */
export function loadBest(): number {
  return loadLeaderboard()[0]?.score ?? 0;
}

/**
 * Ghi một lượt chơi vừa thua vào bảng xếp hạng.
 * Trả về thứ hạng của lượt này (từ 1), hoặc null nếu điểm không đủ lọt vào bảng.
 */
export function addToLeaderboard(score: number, stage: number): number | null {
  const { list, rank } = insertEntry(loadLeaderboard(), { score, stage, date: Date.now() });
  write(LEADERBOARD_KEY, JSON.stringify(list));
  return rank;
}

// ---------------- Tên người chơi ----------------

/** Độ dài tối đa của tên người chơi, tính bằng ký tự. */
export const NAME_MAX = 20;

/**
 * Chuẩn hóa tên nhập vào: bỏ ký tự điều khiển (kể cả ký tự đảo chiều chữ, vốn làm rối tên khi hiện cạnh tên khác),
 * gộp khoảng trắng, cắt còn NAME_MAX ký tự. Không còn gì thì trả về ''.
 */
export function cleanName(raw: string): string {
  const name = raw
    .normalize('NFC')
    .replace(/[\p{Cc}\u202A-\u202E\u2066-\u2069]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(name).slice(0, NAME_MAX).join('').trim();
}

/** Tên người chơi trên máy này, hoặc null nếu chưa nhập (lần đầu mở game). */
export function loadPlayerName(): string | null {
  return cleanName(read(PLAYER_NAME_KEY) ?? '') || null;
}

/** Lưu tên người chơi (không được rỗng sau cleanName), trả về tên đã chuẩn hóa. */
export function savePlayerName(name: string): string {
  const clean = cleanName(name);
  write(PLAYER_NAME_KEY, clean);
  return clean;
}

// ---------------- Kỷ lục trên mạng ----------------

/** Kỷ lục của người chơi như lưu trên mạng (xem online.ts): tên hiện tại kèm điểm cao nhất trên bảng xếp hạng. */
export interface OnlineBest {
  name: string;
  score: number;
  /** Màn đang chơi lúc thua, đánh số từ 1 như trên HUD. */
  stage: number;
}

/** Bản gửi lên mạng thành công lần gần nhất, để biết khi nào cần gửi lại; chưa gửi lần nào thì null. */
export function loadSyncedBest(): OnlineBest | null {
  const r = readJson(SYNCED_BEST_KEY);
  if (typeof r !== 'object' || r === null) return null;
  const { name, score, stage } = r as Record<string, unknown>;
  if (typeof name !== 'string' || typeof score !== 'number' || typeof stage !== 'number') return null;
  return { name, score, stage };
}

export function saveSyncedBest(best: OnlineBest): void {
  write(SYNCED_BEST_KEY, JSON.stringify(best));
}

// ---------------- Bộ hình ô ----------------

/** Mã bộ hình ô người chơi đã chọn, hoặc null nếu chưa chọn. Mã không còn tồn tại thì tileArt.ts tự dùng bộ mặc định. */
export function loadTileArt(): string | null {
  return read(TILE_ART_KEY) || null;
}

export function saveTileArt(id: string): void {
  write(TILE_ART_KEY, id);
}
