/**
 * Lưu kỷ lục điểm và tiến độ mở khóa màn vào localStorage.
 * Không phụ thuộc Phaser. Mọi lỗi lưu trữ (trình duyệt chặn, chế độ ẩn danh...) đều được bỏ qua.
 */

const BEST_KEY = 'pairfect-best';
const UNLOCKED_KEY = 'pairfect-unlocked';

function readNumber(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* bỏ qua nếu trình duyệt chặn lưu trữ */
  }
}

export function loadBest(): number {
  return readNumber(BEST_KEY);
}

export function saveBest(score: number): void {
  if (score > loadBest()) writeNumber(BEST_KEY, score);
}

/** Chỉ số (từ 0) của màn cao nhất đã mở khóa. Màn đầu tiên luôn mở. */
export function loadUnlocked(): number {
  return readNumber(UNLOCKED_KEY);
}

export function unlockLevel(index: number): void {
  if (index > loadUnlocked()) writeNumber(UNLOCKED_KEY, index);
}
