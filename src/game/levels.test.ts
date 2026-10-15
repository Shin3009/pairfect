import { describe, expect, it } from 'vitest';
import { Board } from './Board';
import { LEVELS, orient } from './levels';

describe('LEVELS', () => {
  it('bàn màn ngang rộng hơn cao, cùng số ô (chẵn) với màn dọc', () => {
    for (const lv of LEVELS) {
      const portrait = orient(lv, false);
      const landscape = orient(lv, true);
      expect((portrait.rows * portrait.cols) % 2).toBe(0);
      expect(landscape.rows * landscape.cols).toBe(portrait.rows * portrait.cols);
      expect(landscape.cols).toBeGreaterThan(landscape.rows);
    }
  });

  it('chơi tự động tới hết bàn của mọi màn ở cả hai hướng màn hình', () => {
    for (const lv of LEVELS)
      for (const landscape of [false, true]) {
        const { rows, cols } = orient(lv, landscape);
        const b = new Board(rows, cols);
        b.generate(lv.types);
        let guard = 0;
        while (!b.isCleared() && guard++ < 500) {
          const m = b.findAnyMove();
          if (!m) {
            b.shuffle();
            continue;
          }
          b.remove(m[0], m[1], lv.gravity);
        }
        expect(b.isCleared()).toBe(true);
      }
  });
});
