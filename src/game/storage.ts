/**
 * Lưu kỷ lục điểm vào localStorage.
 * Không phụ thuộc Phaser. Mọi lỗi lưu trữ (trình duyệt chặn, chế độ ẩn danh...) đều được bỏ qua.
 */

const BEST_KEY = 'pairfect-best';

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
