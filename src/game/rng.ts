import type { Rng } from './Board';

/**
 * Bộ sinh số ngẫu nhiên có hạt giống (mulberry32): cùng hạt giống thì ra cùng dãy số trên mọi máy.
 * Đấu online dùng nó để hai máy sinh cùng một bàn chơi, và cùng kết quả mỗi lần đảo bàn,
 * mà không phải gửi bàn cho nhau (xem pvp/match.ts).
 */
export function seededRng(seed: number): Rng {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hạt giống ngẫu nhiên cho một trận mới: số nguyên không âm dưới 2^32. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}
