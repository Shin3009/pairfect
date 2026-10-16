import { describe, expect, it } from 'vitest';
import { Board, STONE } from '../game/Board';
import { seededRng } from '../game/rng';
import { applyAttack, attackFor, COMBO_ATTACKS, COMBO_STEP } from './attacks';

/** Bàn 4 x 6 đã ăn mất vài cặp (có chỗ trống), mỗi loại vẫn chẵn số ô. */
function boardWithGaps(): Board {
  const b = new Board(4, 6, seededRng(7));
  b.grid = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 1, 0, 2, 0, 3, 0, 0],
    [0, 4, 5, 0, 6, 0, 1, 0],
    [0, 2, 0, 3, 0, 4, 5, 0],
    [0, 0, 6, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ];
  return b;
}

const tiles = (b: Board) => b.grid.flat().filter((v) => v > 0).sort((x, y) => x - y);

describe('attackFor', () => {
  it('chỉ có đòn ở mỗi COMBO_STEP cặp của chuỗi', () => {
    const got = Array.from({ length: 2 * COMBO_STEP + 1 }, (_, combo) => attackFor(combo));
    expect(got).toEqual([null, null, null, 'stone', null, null, 'tilt']);
  });

  it('đòn mạnh dần theo thứ tự COMBO_ATTACKS rồi lặp lại', () => {
    const got = Array.from({ length: COMBO_ATTACKS.length * 2 }, (_, i) => attackFor(COMBO_STEP * (i + 1)));
    expect(got).toEqual([...COMBO_ATTACKS, ...COMBO_ATTACKS]);
  });
});

describe('applyAttack', () => {
  it('thả đá: thêm đúng một viên vào ô trống, các ô hình giữ nguyên', () => {
    const b = boardWithGaps();
    const before = tiles(b);
    const e = applyAttack(b, 'stone', 'none', 0);
    expect(e.kind).toBe('stone');
    const at = e.kind === 'stone' ? e.at : null;
    expect(at).not.toBeNull();
    expect(b.get(at!)).toBe(STONE);
    expect(b.grid.flat().filter((v) => v === STONE)).toHaveLength(1);
    expect(tiles(b)).toEqual(before);
  });

  it('nghiêng bàn: dồn theo một hướng khác hướng dồn của trận, đổi hướng ở mỗi đòn', () => {
    const b = boardWithGaps();
    const e = applyAttack(b, 'tilt', 'none', 0);
    expect(e).toMatchObject({ kind: 'tilt', dir: 'down' });
    if (e.kind === 'tilt') expect(e.moves.length).toBeGreaterThan(0);
    // Mỗi cột: các ô hình nằm sát đáy
    for (let c = 1; c <= b.cols; c++) {
      const col = [1, 2, 3, 4].map((r) => b.grid[r][c] > 0);
      expect(col.indexOf(true) === -1 || col.slice(col.indexOf(true)).every(Boolean)).toBe(true);
    }
    // Trận dồn xuống thì nghiêng sang hướng khác
    expect(applyAttack(boardWithGaps(), 'tilt', 'down', 0)).toMatchObject({ dir: 'left' });
    expect(applyAttack(boardWithGaps(), 'tilt', 'down', 1)).toMatchObject({ dir: 'up' });
  });

  it('che mắt: bàn không đổi', () => {
    const b = boardWithGaps();
    const before = b.grid.map((row) => [...row]);
    expect(applyAttack(b, 'fog', 'none', 0)).toEqual({ kind: 'fog' });
    expect(b.grid).toEqual(before);
  });

  it('đảo bàn: cùng các ô hình, vẫn còn nước đi', () => {
    const b = boardWithGaps();
    const before = tiles(b);
    expect(applyAttack(b, 'shuffle', 'none', 0).kind).toBe('shuffle');
    expect(tiles(b)).toEqual(before);
    expect(b.hasMove()).toBe(true);
  });
});
