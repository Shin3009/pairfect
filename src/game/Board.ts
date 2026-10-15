/**
 * Logic bàn chơi kiểu "nối hình" (Shisen-Sho / Onet).
 * Hoàn toàn tách khỏi Phaser để dễ test và tái sử dụng.
 *
 * Lưới được bao thêm một viền ô trống (padding) quanh bàn chơi,
 * nên đường nối có thể đi vòng ra ngoài mép mà không cần xử lý riêng.
 * Ô thật nằm ở hàng 1..rows, cột 1..cols. Giá trị 0 = ô trống.
 */

export interface Point {
  r: number;
  c: number;
}

export interface Move {
  from: Point;
  to: Point;
}

/** Kiểu dồn ô sau mỗi lần ăn cặp (giống các màn của Onet). */
export type Gravity = 'none' | 'down' | 'up' | 'left' | 'right' | 'center-h' | 'center-v';

export type Rng = () => number;

export class Board {
  readonly rows: number;
  readonly cols: number;
  /** Lưới đã có viền: kích thước (rows + 2) x (cols + 2). */
  grid: number[][];
  private rng: Rng;

  constructor(rows: number, cols: number, rng: Rng = Math.random) {
    if ((rows * cols) % 2 !== 0) throw new Error('Số ô trên bàn phải là số chẵn');
    this.rows = rows;
    this.cols = cols;
    this.rng = rng;
    this.grid = Array.from({ length: rows + 2 }, () => new Array(cols + 2).fill(0));
  }

  /**
   * Sinh bàn chơi ngẫu nhiên với `types` loại hình.
   * Mỗi loại xuất hiện số chẵn lần; bảo đảm có ít nhất một nước đi.
   */
  generate(types: number): void {
    const total = this.rows * this.cols;
    const tiles: number[] = [];
    for (let i = 0; i < total / 2; i++) {
      const t = (i % types) + 1;
      tiles.push(t, t);
    }
    this.fillPositions(this.allInnerPositions(), tiles);
    this.ensurePlayable();
  }

  get(p: Point): number {
    return this.grid[p.r][p.c];
  }

  isInside(p: Point): boolean {
    return p.r >= 1 && p.r <= this.rows && p.c >= 1 && p.c <= this.cols;
  }

  remaining(): number {
    let n = 0;
    for (let r = 1; r <= this.rows; r++)
      for (let c = 1; c <= this.cols; c++) if (this.grid[r][c] !== 0) n++;
    return n;
  }

  isCleared(): boolean {
    return this.remaining() === 0;
  }

  /**
   * Tìm đường nối giữa a và b với tối đa 2 lần rẽ.
   * Trả về danh sách điểm gấp khúc (gồm cả a và b) của đường ngắn nhất, hoặc null.
   *
   * Ý tưởng: mọi đường ≤ 2 lần rẽ đều có dạng a → p → q → b, trong đó
   * đoạn giữa p→q nằm trên một hàng y (p cùng cột a, q cùng cột b)
   * hoặc trên một cột x (p cùng hàng a, q cùng hàng b).
   * Duyệt mọi hàng và mọi cột là đủ, bao gồm cả trường hợp 0 và 1 lần rẽ.
   */
  findPath(a: Point, b: Point): Point[] | null {
    if (same(a, b)) return null;
    const va = this.get(a);
    if (va === 0 || va !== this.get(b)) return null;

    const passable = (p: Point) => this.grid[p.r][p.c] === 0 || same(p, a) || same(p, b);
    const clear = (p1: Point, p2: Point) => segmentCells(p1, p2).every(passable);

    let best: Point[] | null = null;
    let bestLen = Infinity;
    const consider = (p: Point, q: Point) => {
      if (!clear(a, p) || !clear(p, q) || !clear(q, b)) return;
      const len = dist(a, p) + dist(p, q) + dist(q, b);
      if (len < bestLen) {
        bestLen = len;
        best = simplify([a, p, q, b]);
      }
    };

    // Đoạn giữa nằm ngang trên hàng y
    for (let y = 0; y <= this.rows + 1; y++) consider({ r: y, c: a.c }, { r: y, c: b.c });
    // Đoạn giữa nằm dọc trên cột x
    for (let x = 0; x <= this.cols + 1; x++) consider({ r: a.r, c: x }, { r: b.r, c: x });

    return best;
  }

  /** Tìm một cặp nối được bất kỳ (dùng cho Gợi ý và kiểm tra bế tắc). */
  findAnyMove(): [Point, Point] | null {
    const byType = new Map<number, Point[]>();
    for (let r = 1; r <= this.rows; r++)
      for (let c = 1; c <= this.cols; c++) {
        const v = this.grid[r][c];
        if (v === 0) continue;
        if (!byType.has(v)) byType.set(v, []);
        byType.get(v)!.push({ r, c });
      }
    for (const list of byType.values())
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++)
          if (this.findPath(list[i], list[j])) return [list[i], list[j]];
    return null;
  }

  hasMove(): boolean {
    return this.findAnyMove() !== null;
  }

  /** Xóa cặp a, b rồi dồn ô theo `gravity`. Trả về danh sách ô bị dịch chuyển. */
  remove(a: Point, b: Point, gravity: Gravity = 'none'): Move[] {
    this.grid[a.r][a.c] = 0;
    this.grid[b.r][b.c] = 0;
    return this.applyGravity(gravity);
  }

  /**
   * Xáo trộn các ô còn lại (giữ nguyên vị trí các ô đang có hình),
   * bảo đảm sau khi xáo vẫn còn nước đi.
   */
  shuffle(): void {
    const positions = this.occupiedPositions();
    const values = positions.map((p) => this.get(p));
    this.fillPositions(positions, values);
    this.ensurePlayable();
  }

  applyGravity(gravity: Gravity): Move[] {
    const moves: Move[] = [];
    const R = this.rows;
    const C = this.cols;
    const col = (c: number, from: number, to: number) => line(from, to).map((r) => ({ r, c }));
    const row = (r: number, from: number, to: number) => line(from, to).map((c) => ({ r, c }));

    switch (gravity) {
      case 'down':
        for (let c = 1; c <= C; c++) this.compact(col(c, R, 1), moves);
        break;
      case 'up':
        for (let c = 1; c <= C; c++) this.compact(col(c, 1, R), moves);
        break;
      case 'left':
        for (let r = 1; r <= R; r++) this.compact(row(r, 1, C), moves);
        break;
      case 'right':
        for (let r = 1; r <= R; r++) this.compact(row(r, C, 1), moves);
        break;
      case 'center-h': {
        const mid = Math.floor(C / 2);
        for (let r = 1; r <= R; r++) {
          this.compact(row(r, mid, 1), moves);
          this.compact(row(r, mid + 1, C), moves);
        }
        break;
      }
      case 'center-v': {
        const mid = Math.floor(R / 2);
        for (let c = 1; c <= C; c++) {
          this.compact(col(c, mid, 1), moves);
          this.compact(col(c, mid + 1, R), moves);
        }
        break;
      }
      case 'none':
        break;
    }
    return moves;
  }

  /** Dồn các ô có hình về phía đầu danh sách `positions`. */
  private compact(positions: Point[], moves: Move[]): void {
    let target = 0;
    for (const p of positions) {
      const v = this.get(p);
      if (v === 0) continue;
      const t = positions[target++];
      if (!same(p, t)) {
        this.grid[t.r][t.c] = v;
        this.grid[p.r][p.c] = 0;
        moves.push({ from: p, to: t });
      }
    }
  }

  private ensurePlayable(): void {
    const positions = this.occupiedPositions();
    if (positions.length === 0) return;
    for (let attempt = 0; attempt < 200 && !this.hasMove(); attempt++) {
      this.fillPositions(positions, positions.map((p) => this.get(p)));
    }
  }

  private fillPositions(positions: Point[], values: number[]): void {
    const vals = [...values];
    for (let i = vals.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [vals[i], vals[j]] = [vals[j], vals[i]];
    }
    positions.forEach((p, i) => (this.grid[p.r][p.c] = vals[i]));
  }

  private allInnerPositions(): Point[] {
    const out: Point[] = [];
    for (let r = 1; r <= this.rows; r++) for (let c = 1; c <= this.cols; c++) out.push({ r, c });
    return out;
  }

  private occupiedPositions(): Point[] {
    return this.allInnerPositions().filter((p) => this.get(p) !== 0);
  }
}

// ---------- Hàm tiện ích ----------

export function same(a: Point, b: Point): boolean {
  return a.r === b.r && a.c === b.c;
}

function dist(a: Point, b: Point): number {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}

function line(from: number, to: number): number[] {
  const out: number[] = [];
  const step = from <= to ? 1 : -1;
  for (let i = from; i !== to + step; i += step) out.push(i);
  return out;
}

/** Mọi ô trên đoạn thẳng p1–p2 (gồm cả hai đầu). p1, p2 phải cùng hàng hoặc cùng cột. */
function segmentCells(p1: Point, p2: Point): Point[] {
  if (p1.r === p2.r) return line(p1.c, p2.c).map((c) => ({ r: p1.r, c }));
  if (p1.c === p2.c) return line(p1.r, p2.r).map((r) => ({ r, c: p1.c }));
  throw new Error('Đoạn thẳng phải nằm ngang hoặc dọc');
}

/** Bỏ điểm trùng và điểm thẳng hàng để chỉ còn các điểm gấp khúc. */
function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) if (!out.length || !same(out[out.length - 1], p)) out.push(p);
  for (let i = out.length - 2; i >= 1; i--) {
    const a = out[i - 1], b = out[i], c = out[i + 1];
    if ((a.r === b.r && b.r === c.r) || (a.c === b.c && b.c === c.c)) out.splice(i, 1);
  }
  return out;
}
