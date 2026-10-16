import type { Gravity } from './Board';

/** Kiểu dồn của một màn: một kiểu cố định của Board, hoặc 'rotate' (đổi hướng sau mỗi lần ăn cặp). */
export type GravityMode = Gravity | 'rotate';

/** Thứ tự hướng dồn của kiểu 'rotate': ↓ ← ↑ → (xoay theo chiều kim đồng hồ). */
export const ROTATE_ORDER: Gravity[] = ['down', 'left', 'up', 'right'];

/** Hướng dồn dùng cho lần ăn cặp thứ `matchIndex` (từ 0) trong màn. */
export function gravityFor(mode: GravityMode, matchIndex: number): Gravity {
  return mode === 'rotate' ? ROTATE_ORDER[matchIndex % ROTATE_ORDER.length] : mode;
}

export interface LevelConfig {
  rows: number;
  cols: number;
  /** Số loại hình khác nhau trên bàn (càng nhiều càng khó). */
  types: number;
  /** Số viên đá chắn đường (số chẵn, để số ô hình vẫn chẵn). Bỏ trống = không có đá. */
  stones?: number;
  /** Kiểu dồn ô sau mỗi lần ăn cặp. */
  gravity: GravityMode;
  /** Thời gian của màn, tính bằng giây. */
  time: number;
}

/**
 * Danh sách màn chơi. Sửa ở đây để cân bằng độ khó. Số ô (rows * cols) phải là số chẵn.
 * Bàn thấp và rộng, lớn dần tới tối đa 8 x 20 ở màn cuối. Mỗi bàn có khoảng 2,4 cột cho mỗi hàng:
 * với ô cao (xem MAX_TILE_ASPECT trong GameScene) bàn lấp trên 90% màn hình máy tính bảng 5:3
 * (Galaxy Tab A11) mà điện thoại 20:9 vẫn lấp được 78–91%.
 * Màn 1–5 có types = số cặp / 2 nên loại nào cũng đủ 4 ô. Thời gian khoảng 5 giây mỗi cặp,
 * giảm dần theo màn.
 */
export const LEVELS: LevelConfig[] = [
  { rows: 4, cols: 11, types: 11, gravity: 'none', time: 170 },
  { rows: 5, cols: 12, types: 15, gravity: 'down', time: 200 },
  { rows: 6, cols: 14, types: 21, gravity: 'left', time: 250 },
  { rows: 6, cols: 16, types: 24, gravity: 'up', time: 270 },
  { rows: 7, cols: 16, types: 28, gravity: 'right', time: 300 },
  { rows: 7, cols: 18, types: 34, gravity: 'center-h', time: 330 },
  { rows: 8, cols: 20, types: 40, gravity: 'center-v', time: 400 },
];

export const GRAVITY_LABEL: Record<GravityMode, string> = {
  none: 'Cổ điển',
  down: 'Dồn xuống',
  up: 'Dồn lên',
  left: 'Dồn trái',
  right: 'Dồn phải',
  'center-h': 'Dồn vào giữa (ngang)',
  'center-v': 'Dồn vào giữa (dọc)',
  'down-left': 'Dồn góc dưới trái',
  'down-right': 'Dồn góc dưới phải',
  'up-left': 'Dồn góc trên trái',
  'up-right': 'Dồn góc trên phải',
  center: 'Dồn vào tâm',
  rotate: 'Xoay vòng',
};

/**
 * Vòng lặp sau màn cuối: mỗi vòng bớt LOOP_TIME_STEP giây, không dưới LOOP_MIN_TIME giây.
 * Mức sàn 160 giây cho bàn 80 cặp: cộng cả thưởng 1 giây mỗi cặp là khoảng 3 giây mỗi cặp.
 */
export const LOOP_TIME_STEP = 40;
export const LOOP_MIN_TIME = 160;

/**
 * Giai đoạn khó: bắt đầu từ vòng đầu tiên mà thời gian đã chạm mức sàn (màn 43 với số liệu hiện tại),
 * vì từ đó thời gian không giảm được nữa. Mỗi vòng HARD_GRAVITIES.length màn dùng các kiểu dồn mới
 * theo thứ tự, và có thêm đá chắn đường, tăng dần mỗi vòng.
 */
export const HARD_START =
  LEVELS.length * Math.ceil((LEVELS[LEVELS.length - 1].time - LOOP_MIN_TIME) / LOOP_TIME_STEP);
export const HARD_GRAVITIES: GravityMode[] = [
  'down-left',
  'rotate',
  'up-right',
  'center',
  'down-right',
  'rotate',
  'up-left',
];
export const HARD_STONES_START = 4;
export const HARD_STONES_STEP = 2;
export const HARD_STONES_MAX = 10;

/**
 * Cấu hình màn theo chỉ số (từ 0). Sau màn cuối là vòng lặp vô tận:
 * bàn và số loại giữ như màn cuối (khó nhất), kiểu dồn lặp lại theo thứ tự các màn,
 * thời gian tính từ thời gian màn cuối và giảm dần theo từng vòng.
 * Từ HARD_START: kiểu dồn mới và đá chắn đường (xem HARD_GRAVITIES).
 */
export function getLevel(index: number): LevelConfig {
  if (index < LEVELS.length) return { ...LEVELS[index] };
  const last = LEVELS[LEVELS.length - 1];
  const loop = Math.floor(index / LEVELS.length); // 1 ở vòng 2 (màn 8–14), 2 ở vòng 3...
  const time = Math.max(LOOP_MIN_TIME, last.time - loop * LOOP_TIME_STEP);
  if (index < HARD_START) return { ...last, gravity: LEVELS[index % LEVELS.length].gravity, time };

  const hardIndex = index - HARD_START;
  const hardPass = Math.floor(hardIndex / HARD_GRAVITIES.length);
  return {
    ...last,
    gravity: HARD_GRAVITIES[hardIndex % HARD_GRAVITIES.length],
    stones: Math.min(HARD_STONES_MAX, HARD_STONES_START + hardPass * HARD_STONES_STEP),
    time,
  };
}
