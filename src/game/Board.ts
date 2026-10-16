/**
 * Logic bàn chơi kiểu "nối hình" (Shisen-Sho / Onet).
 * Hoàn toàn tách khỏi Phaser để dễ test và tái sử dụng.
 *
 * Lưới được bao thêm một viền ô trống (padding) quanh bàn chơi,
 * nên đường nối có thể đi vòng ra ngoài mép mà không cần xử lý riêng.
 * Ô thật nằm ở hàng 1..rows, cột 1..cols. Giá trị 0 = ô trống, STONE = đá, số dương = loại hình.
 */

export interface Point {
  r: number;
  c: number;
}

export interface Move {
  from: Point;
  to: Point;
}

/** Đá chắn đường: không chọn, không xóa, không di chuyển; chặn đường nối và chặn ô khi dồn. */
export const STONE = -1;

/** Một lần dồn theo một hướng (giống các màn của Onet). */
type Direction = 'down' | 'up' | 'left' | 'right' | 'center-h' | 'center-v';

/** Kiểu dồn ô sau mỗi lần ăn cặp: không dồn, một hướng, hoặc hai hướng liên tiếp (về góc / về tâm). */
export type Gravity = 'none' | Direction | 'down-left' | 'down-right' | 'up-left' | 'up-right' | 'center';

/** Các bước dồn của từng kiểu, chạy lần lượt. */
const GRAVITY_STEPS: Record<Gravity, Direction[]> = {
  none: [],
  down: ['down'],
  up: ['up'],
  left: ['left'],
  right: ['right'],
  'center-h': ['center-h'],
  'center-v': ['center-v'],
  'down-left': ['down', 'left'],
  'down-right': ['down', 'right'],
  'up-left': ['up', 'left'],
  'up-right': ['up', 'right'],
  center: ['center-v', 'center-h'],
};

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
   * Sinh bàn chơi ngẫu nhiên với `types` loại hình và `stones` viên đá (số chẵn).
   * Mỗi loại xuất hiện số chẵn lần; bảo đảm có ít nhất một nước đi.
   */
  generate(types: number, stones = 0): void {
    for (const row of this.grid) row.fill(0);
    this.placeStones(stones);
    const free = this.allInnerPositions().filter((p) => this.get(p) === 0);
    if (free.length % 2 !== 0) throw new Error('Số ô (trừ đá) phải là số chẵn');
    const tiles: number[] = [];
    for (let i = 0; i < free.length / 2; i++) {
      const t = (i % types) + 1;
      tiles.push(t, t);
    }
    this.fillPositions(free, tiles);
    this.ensurePlayable();
  }

  /**
   * Nạp lại bàn đã lưu (lưới có viền, cùng dạng `grid`). Lưới không hợp lệ thì trả về false và để nguyên bàn:
   * sai kích thước, viền không trống, giá trị không phải ô trống / đá / loại 1..maxType,
   * hoặc có loại hình lẻ số ô (sẽ không bao giờ dọn sạch được).
   */
  load(grid: number[][], maxType: number): boolean {
    if (grid.length !== this.rows + 2) return false;
    const counts = new Map<number, number>();
    for (let r = 0; r < grid.length; r++) {
      if (grid[r].length !== this.cols + 2) return false;
      for (let c = 0; c < grid[r].length; c++) {
        const v = grid[r][c];
        const border = r === 0 || c === 0 || r === this.rows + 1 || c === this.cols + 1;
        if (border ? v !== 0 : !(Number.isInteger(v) && v >= STONE && v <= maxType)) return false;
        if (v > 0) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
    }
    if ([...counts.values()].some((n) => n % 2 !== 0)) return false;
    this.grid = grid.map((row) => [...row]);
    return true;
  }

  get(p: Point): number {
    return this.grid[p.r][p.c];
  }

  isInside(p: Point): boolean {
    return p.r >= 1 && p.r <= this.rows && p.c >= 1 && p.c <= this.cols;
  }

  /** Số ô hình còn lại (không tính đá). */
  remaining(): number {
    return this.tilePositions().length;
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
    if (va <= 0 || va !== this.get(b)) return null;

    // Đá và ô hình khác đều chặn đường
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
    for (const p of this.tilePositions()) {
      const v = this.get(p);
      if (!byType.has(v)) byType.set(v, []);
      byType.get(v)!.push(p);
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
   * Xáo trộn các ô hình còn lại (giữ nguyên vị trí các ô đang có hình, đá đứng yên),
   * bảo đảm sau khi xáo vẫn còn nước đi. Trả về các viên đá bị phá để gỡ bế tắc.
   */
  shuffle(): Point[] {
    const positions = this.tilePositions();
    const values = positions.map((p) => this.get(p));
    this.fillPositions(positions, values);
    return this.ensurePlayable();
  }

  /**
   * Dồn ô theo `gravity`. Kiểu hai hướng chạy lần lượt từng bước, nên một ô có thể đi hai chặng;
   * danh sách trả về đã gộp lại để mỗi ô chỉ có một nước đi từ vị trí cũ tới vị trí mới.
   */
  applyGravity(gravity: Gravity): Move[] {
    const moves: Move[] = [];
    for (const dir of GRAVITY_STEPS[gravity]) this.applyDirection(dir, moves);
    return mergeMoves(moves);
  }

  private applyDirection(dir: Direction, moves: Move[]): void {
    const R = this.rows;
    const C = this.cols;
    const col = (c: number, from: number, to: number) => line(from, to).map((r) => ({ r, c }));
    const row = (r: number, from: number, to: number) => line(from, to).map((c) => ({ r, c }));

    switch (dir) {
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
    }
  }

  /**
   * Dồn các ô có hình về phía đầu danh sách `positions`.
   * Đá đứng yên và chia danh sách thành từng đoạn: ô dồn sát vào đá như dồn sát vào mép bàn.
   */
  private compact(positions: Point[], moves: Move[]): void {
    let target = 0;
    positions.forEach((p, i) => {
      const v = this.get(p);
      if (v === STONE) {
        target = i + 1;
        return;
      }
      if (v === 0) return;
      const t = positions[target++];
      if (!same(p, t)) {
        this.grid[t.r][t.c] = v;
        this.grid[p.r][p.c] = 0;
        moves.push({ from: p, to: t });
      }
    });
  }

  /**
   * Đặt đá ngẫu nhiên. Hai viên đá không được kề nhau (kể cả chéo), nên mỗi ô có tối đa
   * hai cạnh giáp đá và hai cạnh đó đối diện nhau: không ô nào bị đá vây kín.
   */
  private placeStones(count: number): void {
    const chosen: Point[] = [];
    for (const p of shuffled(this.allInnerPositions(), this.rng)) {
      if (chosen.length === count) break;
      if (chosen.some((s) => Math.abs(s.r - p.r) <= 1 && Math.abs(s.c - p.c) <= 1)) continue;
      chosen.push(p);
    }
    if (chosen.length < count) throw new Error('Không đủ chỗ đặt đá');
    for (const p of chosen) this.grid[p.r][p.c] = STONE;
  }

  /**
   * Bảo đảm còn nước đi: xáo lại tối đa 200 lần. Nếu vẫn bế tắc (đá chặn đường mà xáo không gỡ được,
   * ví dụ khi chỉ còn vài ô) thì phá từng viên đá ngẫu nhiên rồi thử lại. Trả về các viên đá bị phá.
   */
  private ensurePlayable(): Point[] {
    const broken: Point[] = [];
    const positions = this.tilePositions();
    if (positions.length === 0) return broken;
    for (;;) {
      for (let attempt = 0; attempt < 200 && !this.hasMove(); attempt++) {
        this.fillPositions(positions, positions.map((p) => this.get(p)));
      }
      if (this.hasMove()) return broken;
      const stones = this.allInnerPositions().filter((p) => this.get(p) === STONE);
      if (stones.length === 0) return broken;
      const s = stones[Math.floor(this.rng() * stones.length)];
      this.grid[s.r][s.c] = 0;
      broken.push(s);
    }
  }

  private fillPositions(positions: Point[], values: number[]): void {
    const vals = shuffled(values, this.rng);
    positions.forEach((p, i) => (this.grid[p.r][p.c] = vals[i]));
  }

  private allInnerPositions(): Point[] {
    const out: Point[] = [];
    for (let r = 1; r <= this.rows; r++) for (let c = 1; c <= this.cols; c++) out.push({ r, c });
    return out;
  }

  /** Vị trí các ô có hình (không tính đá). */
  private tilePositions(): Point[] {
    return this.allInnerPositions().filter((p) => this.get(p) > 0);
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

/** Bản sao đã xáo trộn (Fisher–Yates). */
function shuffled<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Gộp các chặng liên tiếp của cùng một ô (A→B rồi B→C thành A→C), bỏ ô quay về chỗ cũ. */
function mergeMoves(moves: Move[]): Move[] {
  const key = (p: Point) => `${p.r},${p.c}`;
  const byPos = new Map<string, Move>(); // vị trí hiện tại → nước đi gộp
  for (const m of moves) {
    const prev = byPos.get(key(m.from));
    byPos.delete(key(m.from));
    byPos.set(key(m.to), { from: prev ? prev.from : m.from, to: m.to });
  }
  return [...byPos.values()].filter((m) => !same(m.from, m.to));
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
