import type { Board, Gravity, Move, Point } from '../game/Board';

/**
 * Đòn tấn công khi đấu online: ăn nhiều cặp liên tiếp thật nhanh (chuỗi) để phá bàn của đối thủ.
 * - Thả đá: thêm một viên đá vào một ô trống trên bàn đối thủ (Board.dropStone).
 * - Nghiêng bàn: dồn hết các ô của đối thủ về một phía, ngay lập tức.
 * - Che mắt: che bàn của đối thủ trong FOG_MS (họ vẫn chạm được, nhưng không thấy hình).
 * - Đảo bàn: xáo lại các ô của đối thủ (không tốn lượt Đảo bàn của họ).
 * Mọi thứ ngẫu nhiên đi qua rng của bàn bị đánh, nên bản sao bàn ở máy kẻ tấn công ra đúng kết quả đó (xem match.ts).
 */
export type AttackKind = 'stone' | 'tilt' | 'fog' | 'shuffle';

export const ATTACK_KINDS: readonly AttackKind[] = ['stone', 'tilt', 'fog', 'shuffle'];

/** Hai lần ăn cặp cách nhau tối đa chừng này (ms) thì tính là một chuỗi. */
export const COMBO_MS = 2000;
/**
 * Cứ mỗi chừng này cặp trong chuỗi thì đánh một đòn: người chơi giữ được nhịp nhanh mãi cũng chỉ đánh
 * mỗi 3 cặp một lần, không phải mỗi cặp.
 */
export const COMBO_STEP = 3;
/** Đòn mạnh dần theo độ dài chuỗi: cặp thứ 3, 6, 9, 12 của chuỗi; chuỗi dài hơn thì lặp lại từ đầu. */
export const COMBO_ATTACKS: readonly AttackKind[] = ['stone', 'tilt', 'fog', 'shuffle'];
/** Thời gian bị che mắt (ms). */
export const FOG_MS = 3000;
/** Hướng nghiêng bàn, lần lượt theo số đòn đã nhận (bỏ hướng dồn sẵn có của trận, vì nghiêng theo hướng đó không đổi gì nhiều). */
const TILT_DIRECTIONS: Gravity[] = ['down', 'left', 'up', 'right'];

/** Đòn được gửi khi chuỗi vừa dài tới `combo` cặp, hoặc null nếu lần này không có đòn. */
export function attackFor(combo: number): AttackKind | null {
  if (combo <= 0 || combo % COMBO_STEP !== 0) return null;
  return COMBO_ATTACKS[(combo / COMBO_STEP - 1) % COMBO_ATTACKS.length];
}

/** Kết quả một đòn trên bàn bị đánh, để GameScene vẽ lại đúng thay đổi. */
export type HitEffect =
  | { kind: 'stone'; at: Point | null }
  | { kind: 'tilt'; dir: Gravity; moves: Move[] }
  | { kind: 'fog' }
  | { kind: 'shuffle'; broken: Point[] };

/**
 * Áp đòn `kind` lên `board`. `gravity` là hướng dồn của trận, `hits` là số đòn bàn này đã nhận trước đó
 * (chọn hướng nghiêng). Hai máy gọi hàm này cùng thứ tự trên cùng một bàn thì ra cùng kết quả.
 */
export function applyAttack(board: Board, kind: AttackKind, gravity: Gravity | 'rotate', hits: number): HitEffect {
  switch (kind) {
    case 'stone':
      return { kind, at: board.dropStone() };
    case 'tilt': {
      const dirs = TILT_DIRECTIONS.filter((d) => d !== gravity);
      const dir = dirs[hits % dirs.length];
      return { kind, dir, moves: board.applyGravity(dir) };
    }
    case 'fog':
      return { kind };
    case 'shuffle':
      return { kind, broken: board.isCleared() ? [] : board.shuffle() };
  }
}
