import type { Gravity } from './Board';

export interface LevelConfig {
  rows: number;
  cols: number;
  /** Số loại hình khác nhau trên bàn (càng nhiều càng khó). */
  types: number;
  /** Kiểu dồn ô sau mỗi lần ăn cặp. */
  gravity: Gravity;
  /** Thời gian của màn, tính bằng giây. */
  time: number;
}

/**
 * Danh sách màn chơi. Sửa ở đây để cân bằng độ khó. Số ô (rows * cols) phải là số chẵn.
 * Bàn thấp và rộng, chọn cho tỉ lệ khoảng 2:1 của vùng chơi dưới thanh HUD trên tablet 16:10.
 */
export const LEVELS: LevelConfig[] = [
  { rows: 4, cols: 12, types: 12, gravity: 'none', time: 180 },
  { rows: 5, cols: 12, types: 15, gravity: 'down', time: 200 },
  { rows: 5, cols: 16, types: 20, gravity: 'left', time: 240 },
  { rows: 6, cols: 16, types: 24, gravity: 'up', time: 270 },
  { rows: 6, cols: 16, types: 24, gravity: 'right', time: 260 },
  { rows: 6, cols: 16, types: 28, gravity: 'center-h', time: 260 },
  { rows: 6, cols: 16, types: 30, gravity: 'center-v', time: 250 },
];

export const GRAVITY_LABEL: Record<Gravity, string> = {
  none: 'Cổ điển',
  down: 'Dồn xuống',
  up: 'Dồn lên',
  left: 'Dồn trái',
  right: 'Dồn phải',
  'center-h': 'Dồn vào giữa (ngang)',
  'center-v': 'Dồn vào giữa (dọc)',
};

/** Vòng lặp sau màn cuối: mỗi vòng bớt LOOP_TIME_STEP giây, không dưới LOOP_MIN_TIME giây. */
export const LOOP_TIME_STEP = 30;
export const LOOP_MIN_TIME = 90;

/**
 * Cấu hình màn theo chỉ số (từ 0). Sau màn cuối là vòng lặp vô tận:
 * bàn và số loại giữ như màn cuối (khó nhất), kiểu dồn lặp lại theo thứ tự các màn,
 * thời gian tính từ thời gian màn cuối và giảm dần theo từng vòng.
 */
export function getLevel(index: number): LevelConfig {
  if (index < LEVELS.length) return { ...LEVELS[index] };
  const last = LEVELS[LEVELS.length - 1];
  const loop = Math.floor(index / LEVELS.length); // 1 ở vòng 2 (màn 8–14), 2 ở vòng 3...
  return {
    ...last,
    gravity: LEVELS[index % LEVELS.length].gravity,
    time: Math.max(LOOP_MIN_TIME, last.time - loop * LOOP_TIME_STEP),
  };
}
