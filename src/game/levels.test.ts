import { describe, expect, it } from 'vitest';
import { Board } from './Board';
import {
  getLevel,
  gravityFor,
  HARD_GRAVITIES,
  HARD_START,
  HARD_STONES_MAX,
  LEVELS,
  LOOP_MIN_TIME,
  LOOP_TIME_STEP,
  type LevelConfig,
} from './levels';

/** Tự chơi một màn tới hết bàn, áp đúng hướng dồn (kể cả Xoay vòng) như trong game. */
function autoPlay(lv: LevelConfig): Board {
  const b = new Board(lv.rows, lv.cols);
  b.generate(lv.types, lv.stones ?? 0);
  let guard = 0;
  let matches = 0;
  while (!b.isCleared() && guard++ < 500) {
    const m = b.findAnyMove();
    if (!m) {
      b.shuffle();
      continue;
    }
    b.remove(m[0], m[1], gravityFor(lv.gravity, matches++));
  }
  return b;
}

describe('LEVELS', () => {
  it('bàn có số ô chẵn, rộng hơn cao (game chỉ chơi màn ngang), tối đa 7 x 20', () => {
    for (const lv of LEVELS) {
      expect((lv.rows * lv.cols) % 2).toBe(0);
      expect(lv.cols).toBeGreaterThan(lv.rows);
      expect(lv.rows).toBeLessThanOrEqual(7);
      expect(lv.cols).toBeLessThanOrEqual(20);
    }
  });

  it('số loại không vượt quá 40 (số hình vẽ sẵn có)', () => {
    for (const lv of LEVELS) expect(lv.types).toBeLessThanOrEqual(40);
  });

  it('chơi tự động tới hết bàn của mọi màn, một vòng lặp và hai vòng của giai đoạn khó', () => {
    const indices = [
      ...Array.from({ length: LEVELS.length * 2 }, (_, i) => i),
      ...Array.from({ length: HARD_GRAVITIES.length * 2 }, (_, i) => HARD_START + i),
    ];
    for (const i of indices) expect(autoPlay(getLevel(i)).isCleared()).toBe(true);
  });
});

describe('getLevel – vòng lặp sau màn cuối', () => {
  const n = LEVELS.length;
  const last = LEVELS[n - 1];

  it('các màn thiết kế sẵn giữ nguyên cấu hình', () => {
    LEVELS.forEach((lv, i) => expect(getLevel(i)).toEqual(lv));
  });

  it('giữ bàn và số loại của màn cuối, kiểu dồn lặp lại theo thứ tự, chưa có đá', () => {
    for (let i = n; i < HARD_START; i++) {
      const lv = getLevel(i);
      expect([lv.rows, lv.cols, lv.types]).toEqual([last.rows, last.cols, last.types]);
      expect(lv.gravity).toBe(LEVELS[i % n].gravity);
      expect(lv.stones ?? 0).toBe(0);
    }
  });

  it('thời gian tính từ màn cuối, giảm dần mỗi vòng, không dưới mức sàn', () => {
    expect(getLevel(n).time).toBe(last.time - LOOP_TIME_STEP); // màn 8
    expect(getLevel(n * 2 - 1).time).toBe(last.time - LOOP_TIME_STEP); // màn 14: cùng vòng
    expect(getLevel(n * 2).time).toBe(last.time - LOOP_TIME_STEP * 2); // màn 15
    expect(getLevel(n * 50).time).toBe(LOOP_MIN_TIME);
  });
});

describe('getLevel – giai đoạn khó', () => {
  it('bắt đầu ở màn 43, vòng đầu tiên có thời gian chạm mức sàn', () => {
    expect(HARD_START).toBe(42);
    expect(getLevel(HARD_START - 1).time).toBeGreaterThan(LOOP_MIN_TIME);
    expect(getLevel(HARD_START).time).toBe(LOOP_MIN_TIME);
  });

  it('kiểu dồn mới lần lượt, đá tăng 2 viên mỗi vòng tới tối đa', () => {
    const k = HARD_GRAVITIES.length;
    for (let i = 0; i < k * 2; i++) expect(getLevel(HARD_START + i).gravity).toBe(HARD_GRAVITIES[i % k]);
    expect(getLevel(HARD_START).stones).toBe(4); // màn 43
    expect(getLevel(HARD_START + k - 1).stones).toBe(4); // màn 49
    expect(getLevel(HARD_START + k).stones).toBe(6); // màn 50
    expect(getLevel(HARD_START + k * 100).stones).toBe(HARD_STONES_MAX);
  });

  it('số ô hình (trừ đá) luôn chẵn', () => {
    for (let i = HARD_START; i < HARD_START + HARD_GRAVITIES.length * 5; i++) {
      const lv = getLevel(i);
      expect((lv.rows * lv.cols - (lv.stones ?? 0)) % 2).toBe(0);
    }
  });

  it('Xoay vòng đổi hướng sau mỗi lần ăn cặp: ↓ ← ↑ →', () => {
    expect([0, 1, 2, 3, 4].map((m) => gravityFor('rotate', m))).toEqual(['down', 'left', 'up', 'right', 'down']);
    expect(gravityFor('down-left', 3)).toBe('down-left');
  });
});
