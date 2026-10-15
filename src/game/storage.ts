/**
 * Lưu bảng xếp hạng vào localStorage. Kỷ lục là điểm cao nhất trên bảng.
 * Không phụ thuộc Phaser. Mọi lỗi lưu trữ (trình duyệt chặn, chế độ ẩn danh...) đều được bỏ qua.
 */

const LEADERBOARD_KEY = 'pairfect-leaderboard';

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
  try {
    const list: unknown = JSON.parse(read(LEADERBOARD_KEY) ?? '[]');
    if (!Array.isArray(list)) return [];
    return list.filter(isEntry).sort(compareEntries).slice(0, LEADERBOARD_SIZE);
  } catch {
    return [];
  }
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
