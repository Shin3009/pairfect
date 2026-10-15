import { describe, expect, it } from 'vitest';
import { Board, STONE, type Gravity } from './Board';

/** Tạo bàn từ sơ đồ chữ: '.' = trống, '#' = đá, chữ số = loại hình. Tọa độ trả về đã tính viền. */
function boardFrom(rows: string[]): Board {
  const b = new Board(rows.length, rows[0].length);
  rows.forEach((line, r) =>
    [...line].forEach(
      (ch, c) => (b.grid[r + 1][c + 1] = ch === '.' ? 0 : ch === '#' ? STONE : Number(ch)),
    ),
  );
  return b;
}

/** Tự chơi tới hết bàn: luôn ăn cặp đầu tiên tìm được, bế tắc thì đảo bàn. */
function autoPlay(b: Board, gravity: Gravity): void {
  let guard = 0;
  while (!b.isCleared() && guard++ < 500) {
    const m = b.findAnyMove();
    if (!m) {
      b.shuffle();
      continue;
    }
    b.remove(m[0], m[1], gravity);
  }
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

  it('dồn hai hướng gộp thành một nước đi cho mỗi ô', () => {
    const b = boardFrom(['.1', '..']);
    const moves = b.applyGravity('down-left');
    // Xuống (1,2) → (2,2), rồi sang trái (2,2) → (2,1)
    expect(b.grid[2][1]).toBe(1);
    expect(moves).toEqual([{ from: P(1, 2), to: P(2, 1) }]);
  });

  it('dồn vào tâm theo cả hai chiều', () => {
    const b = boardFrom(['1..2', '....', '....', '3..4']);
    b.applyGravity('center');
    expect([b.grid[2][2], b.grid[2][3], b.grid[3][2], b.grid[3][3]]).toEqual([1, 2, 3, 4]);
  });

  it('ô dồn sát vào đá, đá đứng yên', () => {
    const b = boardFrom(['12', '.2', '#.', '..']);
    b.applyGravity('down');
    // Cột 1: ô 1 nằm trên đá, dưới đá vẫn trống. Cột 2: hai ô 2 rơi xuống đáy.
    expect([b.grid[1][1], b.grid[2][1], b.grid[3][1], b.grid[4][1]]).toEqual([0, 1, STONE, 0]);
    expect([b.grid[1][2], b.grid[2][2], b.grid[3][2], b.grid[4][2]]).toEqual([0, 0, 2, 2]);
  });
});

describe('đá', () => {
  it('đá chặn đường nối và không ghép được với nhau', () => {
    const b = boardFrom(['.#..', '#1#.', '.#.1']);
    expect(b.findPath(P(2, 2), P(3, 4))).toBeNull();
    expect(b.findPath(P(1, 2), P(2, 1))).toBeNull();
    expect(b.remaining()).toBe(2);
  });

  it('khi xáo không gỡ được bế tắc thì phá đá cho tới khi có nước đi', () => {
    const b = boardFrom(['.#..', '#1#.', '.#.1']);
    const broken = b.shuffle();
    expect(broken.length).toBeGreaterThan(0);
    for (const p of broken) expect(b.get(p)).toBe(0);
    expect(b.hasMove()).toBe(true);
  });

  it('sinh đúng số đá, không viên nào kề nhau, mỗi loại vẫn chẵn', () => {
    for (let i = 0; i < 20; i++) {
      const b = new Board(6, 16);
      b.generate(30, 10);
      const stones: { r: number; c: number }[] = [];
      const count = new Map<number, number>();
      for (let r = 1; r <= 6; r++)
        for (let c = 1; c <= 16; c++) {
          const v = b.grid[r][c];
          if (v === STONE) stones.push(P(r, c));
          else count.set(v, (count.get(v) ?? 0) + 1);
        }
      expect(stones.length).toBe(10);
      for (const s of stones)
        for (const t of stones)
          if (s !== t) expect(Math.max(Math.abs(s.r - t.r), Math.abs(s.c - t.c))).toBeGreaterThan(1);
      for (const n of count.values()) expect(n % 2).toBe(0);
      expect(b.remaining()).toBe(86);
    }
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

  const modes: Gravity[] = [
    'none', 'down', 'up', 'left', 'right', 'center-h', 'center-v',
    'down-left', 'down-right', 'up-left', 'up-right', 'center',
  ];

  it('chơi tự động tới hết bàn với mọi kiểu dồn', () => {
    for (const g of modes) {
      const b = new Board(8, 12);
      b.generate(20);
      autoPlay(b, g);
      expect(b.isCleared()).toBe(true);
    }
  });

  it('chơi tự động tới hết bàn có đá với mọi kiểu dồn', () => {
    for (const g of modes) {
      const b = new Board(6, 16);
      b.generate(30, 10);
      autoPlay(b, g);
      expect(b.isCleared()).toBe(true);
    }
  });
});
