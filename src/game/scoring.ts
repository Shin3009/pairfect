import type { LevelConfig } from './levels';

/** Điểm mỗi cặp ăn được. */
export const SCORE_PER_PAIR = 10;
/** Qua màn: điểm thưởng cho mỗi giây còn lại. */
export const POINTS_PER_SECOND_LEFT = 2;

/**
 * Giới hạn trên điểm của một màn. firestore.rules dùng nó để từ chối kỷ lục giả quá vô lý:
 * thua ở màn thứ n (đánh số từ 1) thì điểm không thể vượt n * MAX_SCORE_PER_STAGE.
 * Đổi số này thì sửa cả firestore.rules; scoring.test.ts kiểm tra hai nơi khớp nhau và mọi màn đều nằm dưới giới hạn.
 */
export const MAX_SCORE_PER_STAGE = 1500;

/** Điểm cao nhất có thể có ở một màn: ăn hết bàn (coi như không có đá) rồi qua màn khi đồng hồ vẫn đầy. */
export function maxStageScore(cfg: LevelConfig): number {
  return ((cfg.rows * cfg.cols) / 2) * SCORE_PER_PAIR + cfg.time * POINTS_PER_SECOND_LEFT;
}
