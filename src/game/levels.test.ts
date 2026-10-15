import { describe, expect, it } from 'vitest';
import { Board } from './Board';
import { getLevel, LEVELS } from './levels';

describe('LEVELS', () => {
  it('bàn có số ô chẵn và rộng hơn cao (game chỉ chơi màn ngang)', () => {
    for (const lv of LEVELS) {
      expect((lv.rows * lv.cols) % 2).toBe(0);
      expect(lv.cols).toBeGreaterThan(lv.rows);
    }
  });

  it('chơi tự động tới hết bàn của mọi màn và một vòng lặp', () => {
    for (let i = 0; i < LEVELS.length * 2; i++) {
      const lv = getLevel(i);
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

describe('getLevel – vòng lặp sau màn cuối', () => {
  const n = LEVELS.length;
  const last = LEVELS[n - 1];

  it('các màn thiết kế sẵn giữ nguyên cấu hình', () => {
    LEVELS.forEach((lv, i) => expect(getLevel(i)).toEqual(lv));
  });

  it('giữ bàn và số loại của màn cuối, kiểu dồn lặp lại theo thứ tự', () => {
    for (let i = n; i < n * 3; i++) {
      const lv = getLevel(i);
      expect([lv.rows, lv.cols, lv.types]).toEqual([last.rows, last.cols, last.types]);
      expect(lv.gravity).toBe(LEVELS[i % n].gravity);
    }
  });

  it('thời gian tính từ màn cuối, giảm 30 giây mỗi vòng, không dưới 90 giây', () => {
    expect(getLevel(n).time).toBe(last.time - 30); // màn 8
    expect(getLevel(n * 2 - 1).time).toBe(last.time - 30); // màn 14: cùng vòng
    expect(getLevel(n * 2).time).toBe(last.time - 60); // màn 15
    expect(getLevel(n * 50).time).toBe(90);
  });
});
