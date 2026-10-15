import { describe, expect, it } from 'vitest';
import { Board } from './Board';

/** Tạo bàn từ sơ đồ chữ: '.' = trống, chữ số = loại hình. Tọa độ trả về đã tính viền. */
function boardFrom(rows: string[]): Board {
  const b = new Board(rows.length, rows[0].length);
  rows.forEach((line, r) =>
    [...line].forEach((ch, c) => (b.grid[r + 1][c + 1] = ch === '.' ? 0 : Number(ch))),
  );
  return b;
}

const P = (r: number, c: number) => ({ r, c });

describe('findPath', () => {
  it('nối thẳng khi hai ô kề nhau', () => {
    const b = boardFrom(['11', '22']);
    expect(b.findPath(P(1, 1), P(1, 2))).toEqual([P(1, 1), P(1, 2)]);
  });

  it('không nối hai ô khác loại', () => {
    const b = boardFrom(['12', '21']);
    expect(b.findPath(P(1, 1), P(1, 2))).toBeNull();
  });

  it('nối với 1 lần rẽ qua ô trống', () => {
    const b = boardFrom(['1.', '21', '22']);
    // 1 ở (1,1) và (2,2): đi qua (1,2) rồi xuống
    const path = b.findPath(P(1, 1), P(2, 2));
    expect(path).not.toBeNull();
    expect(path!.length).toBe(3);
  });

  it('nối vòng ra ngoài viền với 2 lần rẽ', () => {
    const b = boardFrom(['1221', '3443']);
    // hai ô 1 ở hai đầu hàng trên, bị chặn ở giữa -> đi lên viền rồi qua
    const path = b.findPath(P(1, 1), P(1, 4));
    expect(path).toEqual([P(1, 1), P(0, 1), P(0, 4), P(1, 4)]);
  });

  it('không nối khi cần 3 lần rẽ', () => {
    const b = boardFrom([
      '2222',
      '21.2',
      '2222',
      '2.12',
      '2222',
    ]);
    // Bị bao kín bởi số 2; đường duy nhất cần nhiều hơn 2 lần rẽ
    expect(b.findPath(P(2, 2), P(4, 3))).toBeNull();
  });
});

describe('gravity', () => {
  it('dồn xuống dưới sau khi xóa', () => {
    const b = boardFrom(['12', '34', '12', '34']);
    const moves = b.remove(P(3, 1), P(1, 1), 'down');
    // Cột 1 còn 3,3 -> phải nằm ở hàng 3, 4; hàng 1-2 trống
    expect([b.grid[1][1], b.grid[2][1], b.grid[3][1], b.grid[4][1]]).toEqual([0, 0, 3, 3]);
    expect(moves).toEqual([{ from: P(2, 1), to: P(3, 1) }]);
  });

  it('dồn về giữa theo chiều ngang', () => {
    const b = boardFrom(['1..2', '....']);
    b.applyGravity('center-h');
    expect(b.grid[1].slice(1, 5)).toEqual([0, 1, 2, 0]);
  });
});

describe('generate & shuffle', () => {
  it('mỗi loại xuất hiện số chẵn lần và luôn có nước đi', () => {
    for (let i = 0; i < 20; i++) {
      const b = new Board(8, 12);
      b.generate(20);
      const count = new Map<number, number>();
      for (let r = 1; r <= 8; r++)
        for (let c = 1; c <= 12; c++) count.set(b.grid[r][c], (count.get(b.grid[r][c]) ?? 0) + 1);
      for (const n of count.values()) expect(n % 2).toBe(0);
      expect(b.hasMove()).toBe(true);
    }
  });

  it('chơi tự động tới hết bàn với mọi kiểu dồn', () => {
    const modes = ['none', 'down', 'up', 'left', 'right', 'center-h', 'center-v'] as const;
    for (const g of modes) {
      const b = new Board(8, 12);
      b.generate(20);
      let guard = 0;
      while (!b.isCleared() && guard++ < 200) {
        const m = b.findAnyMove();
        if (!m) {
          b.shuffle();
          continue;
        }
        b.remove(m[0], m[1], g);
      }
      expect(b.isCleared()).toBe(true);
    }
  });
});
