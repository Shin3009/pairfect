import { describe, expect, it } from 'vitest';
import { Board } from './Board';
import { LEVELS } from './levels';

describe('LEVELS', () => {
  it('bàn có số ô chẵn và rộng hơn cao (game chỉ chơi màn ngang)', () => {
    for (const lv of LEVELS) {
      expect((lv.rows * lv.cols) % 2).toBe(0);
      expect(lv.cols).toBeGreaterThan(lv.rows);
    }
  });

  it('chơi tự động tới hết bàn của mọi màn', () => {
    for (const lv of LEVELS) {
      const b = new Board(lv.rows, lv.cols);
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
