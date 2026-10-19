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
export const MAX_SCORE_PER_STAGE = 1700;

/**
 * Màn cao nhất firestore.rules nhận cho một kỷ lục online. Game có vô số màn, nhưng một màn ở giai đoạn khó mất vài
 * phút, nên tới được màn này là chơi hàng chục giờ trong một lượt. Giới hạn chỉ để điểm giả không lớn vô lý
 * (điểm tối đa là màn × MAX_SCORE_PER_STAGE); đừng hạ thấp tới mức người chơi thật có thể vượt, vì kỷ lục của họ
 * sẽ không bao giờ gửi lên được. Đổi số này thì sửa cả firestore.rules.
 */
export const MAX_ONLINE_STAGE = 999;

/** Điểm cao nhất có thể có ở một màn: ăn hết bàn (coi như không có đá) rồi qua màn khi đồng hồ vẫn đầy. */
export function maxStageScore(cfg: LevelConfig): number {
  return ((cfg.rows * cfg.cols) / 2) * SCORE_PER_PAIR + cfg.time * POINTS_PER_SECOND_LEFT;
}
