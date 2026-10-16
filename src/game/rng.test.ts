import { describe, expect, it } from 'vitest';
import { Board } from './Board';
import { randomSeed, seededRng } from './rng';

const take = (rng: () => number, n: number) => Array.from({ length: n }, rng);

describe('seededRng', () => {
  it('cùng hạt giống cho cùng dãy số, khác hạt giống thì khác', () => {
    expect(take(seededRng(42), 20)).toEqual(take(seededRng(42), 20));
    expect(take(seededRng(42), 20)).not.toEqual(take(seededRng(43), 20));
  });

  it('số nằm trong [0, 1) và phân bố khá đều', () => {
    const values = take(seededRng(7), 10000);
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });

  it('hạt giống lớn (tới 2^32) vẫn cho dãy lặp lại được', () => {
    const seed = 2 ** 32 - 1;
    expect(take(seededRng(seed), 5)).toEqual(take(seededRng(seed), 5));
  });

  it('hai bàn cùng hạt giống giống hệt nhau, kể cả sau khi đảo bàn', () => {
    const seed = randomSeed();
    const a = new Board(6, 14, seededRng(seed));
    const b = new Board(6, 14, seededRng(seed));
    a.generate(21, 4);
    b.generate(21, 4);
    expect(a.grid).toEqual(b.grid);
    a.shuffle();
    b.shuffle();
    expect(a.grid).toEqual(b.grid);
  });
});

describe('randomSeed', () => {
  it('là số nguyên không âm dưới 2^32', () => {
    for (let i = 0; i < 100; i++) {
      const s = randomSeed();
      expect(Number.isInteger(s) && s >= 0 && s < 2 ** 32).toBe(true);
    }
  });
});
