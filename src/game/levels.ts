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

/** Danh sách màn chơi. Sửa ở đây để cân bằng độ khó. rows * cols phải là số chẵn. */
export const LEVELS: LevelConfig[] = [
  { rows: 8, cols: 6, types: 12, gravity: 'none', time: 180 },
  { rows: 10, cols: 6, types: 15, gravity: 'down', time: 200 },
  { rows: 10, cols: 8, types: 20, gravity: 'left', time: 240 },
  { rows: 12, cols: 8, types: 24, gravity: 'up', time: 270 },
  { rows: 12, cols: 8, types: 24, gravity: 'right', time: 260 },
  { rows: 12, cols: 8, types: 28, gravity: 'center-h', time: 260 },
  { rows: 12, cols: 8, types: 30, gravity: 'center-v', time: 250 },
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

/** Sau màn cuối, lặp lại các màn với thời gian giảm dần. */
export function getLevel(index: number): LevelConfig {
  const base = LEVELS[index % LEVELS.length];
  const loop = Math.floor(index / LEVELS.length);
  return { ...base, time: Math.max(90, base.time - loop * 30) };
}
