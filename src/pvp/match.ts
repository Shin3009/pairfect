import { Board, type Move, type Point } from '../game/Board';
import { gravityFor, type GravityMode, type LevelConfig } from '../game/levels';
import { seededRng } from '../game/rng';
import { applyAttack, attackFor, COMBO_MS, type AttackKind, type HitEffect } from './attacks';
import type { BoardEvent, EndReason, Msg, Role } from './protocol';

/**
 * Luật một trận đấu online (đua dọn bàn), không phụ thuộc Phaser hay mạng để test được.
 *
 * Hai máy sinh cùng một bàn từ hạt giống của trận (rng.ts). Mỗi máy giữ bàn của mình và một bản sao bàn đối thủ:
 * mỗi thay đổi trên bàn mình (ăn cặp, đảo bàn, nhận đòn) được gửi đi như một sự kiện đánh số, máy kia áp lại
 * đúng sự kiện đó lên bản sao. Mọi thứ ngẫu nhiên trên bàn đều đi qua rng có hạt giống, nên bản sao luôn khớp
 * bàn thật, và:
 * - bàn thu nhỏ của đối thủ trên HUD chính là bản sao, không cần gửi cả bàn;
 * - nước đi không hợp lệ (đường nối không có thật, sai thứ tự...) bị phát hiện: đối thủ bị xử thua.
 *
 * Đòn tấn công (attacks.ts) cũng suy ra từ chuỗi sự kiện, không gửi riêng: thời điểm các lần ăn cặp cho biết chuỗi,
 * nên máy bị đánh tự tính ra đòn khi áp lần ăn cặp của đối thủ lên bản sao, rồi áp đòn đó lên bàn mình ngay
 * và ghi lại thành sự kiện `hit` (để bản sao bàn mình ở máy kia nhận đòn đúng lúc đó).
 * Kẻ tấn công kiểm tra các sự kiện `hit` khớp đúng các đòn mình đã đánh, theo thứ tự.
 *
 * Ai dọn sạch bàn trước thì thắng. Hết giờ thì ai còn ít cặp hơn thắng; bằng nhau là hòa.
 * Chủ phòng phân xử và gửi kết quả; khách chỉ tự phân xử khi chờ mãi không thấy kết quả.
 * Thời điểm của các sự kiện tính từ lúc trận bắt đầu, theo đồng hồ đã đồng bộ (clock.ts), nên so được giữa hai máy.
 */

/** Thời gian một trận, tính bằng giây. Không cộng giờ khi ăn cặp: hai bên hết giờ cùng lúc. */
export const PVP_TIME = 240;
/** Lượt Gợi ý / Đảo bàn mỗi trận. Bàn bế tắc thì tự đảo, không tốn lượt (không ai thua vì xui). */
export const PVP_HINTS = 3;
export const PVP_SHUFFLES = 3;
/** Kiểu dồn của trận, chọn theo hạt giống. */
export const PVP_GRAVITIES: GravityMode[] = ['none', 'down', 'left', 'up', 'right'];
/**
 * Chủ phòng dọn xong (hoặc hết giờ) thì chờ thêm chừng này trước khi phân xử,
 * để sự kiện của khách đang trên đường tới (có thể dọn xong sớm hơn) kịp đến.
 */
export const GRACE_MS = 1000;
/** Khách tự phân xử nếu quá thời điểm có kết quả chừng này mà chủ phòng chưa gửi. */
export const RESULT_TIMEOUT_MS = 5000;
/** Đồng hồ hai máy lệch nhau một chút: nước đi trễ hơn lúc hết giờ chừng này vẫn được tính. */
export const LATE_MS = 500;

/** Bàn của trận: cỡ màn 3 (6 x 14, mỗi loại 4 ô), kiểu dồn theo hạt giống. */
export function pvpLevel(seed: number): LevelConfig {
  return { rows: 6, cols: 14, types: 21, gravity: PVP_GRAVITIES[seed % PVP_GRAVITIES.length], time: PVP_TIME };
}

/** Kết quả theo góc nhìn của máy này. */
export interface Outcome {
  result: 'win' | 'lose' | 'draw';
  why: EndReason;
}

/** Một lần ăn cặp: các ô bị dồn, độ dài chuỗi hiện tại, và đòn được gửi cho đối thủ (nếu có). */
export interface Played {
  moves: Move[];
  combo: number;
  attack: AttackKind | null;
}

/**
 * Bàn của một bên cùng các lượt đã dùng. Bàn mình và bản sao bàn đối thủ đi qua đúng các hàm này,
 * nên hai bên luôn áp một sự kiện theo cùng một cách (cùng hướng dồn, cùng chuỗi, cùng kết quả đảo bàn và nhận đòn).
 */
export class Side {
  readonly board: Board;
  /** Số cặp đã ăn: quyết định hướng dồn của kiểu Xoay vòng. */
  matches = 0;
  shuffles = PVP_SHUFFLES;
  /** Số sự kiện đã áp; sự kiện kế tiếp mang số n + 1. */
  n = 0;
  /** Lúc dọn sạch bàn, tính bằng ms từ khi trận bắt đầu; null nếu chưa. */
  clearedAt: number | null = null;
  /** Độ dài chuỗi hiện tại và lúc ăn cặp gần nhất (ms từ khi trận bắt đầu). */
  combo = 0;
  private lastMatchAt: number | null = null;
  /** Số đòn đã nhận. */
  hits = 0;

  constructor(
    private readonly cfg: LevelConfig,
    seed: number,
  ) {
    this.board = new Board(cfg.rows, cfg.cols, seededRng(seed));
    this.board.generate(cfg.types, cfg.stones ?? 0);
  }

  /** Ăn cặp a, b lúc `t`. Trả về kết quả (xem Played), hoặc null nếu không nối được. */
  match(a: Point, b: Point, t: number): Played | null {
    if (!this.board.isInside(a) || !this.board.isInside(b) || !this.board.findPath(a, b)) return null;
    this.n++;
    const moves = this.board.remove(a, b, gravityFor(this.cfg.gravity, this.matches++));
    this.combo = this.lastMatchAt !== null && t - this.lastMatchAt <= COMBO_MS ? this.combo + 1 : 1;
    this.lastMatchAt = t;
    return { moves, combo: this.combo, attack: attackFor(this.combo) };
  }

  /**
   * Đảo bàn: tự đảo chỉ được khi bế tắc và không tốn lượt, tự bấm thì tốn một lượt.
   * Trả về các viên đá bị phá (xem Board.shuffle), hoặc null nếu không được đảo.
   */
  shuffle(auto: boolean): Point[] | null {
    if (this.board.isCleared() || (auto ? this.board.hasMove() : this.shuffles <= 0)) return null;
    if (!auto) this.shuffles--;
    this.n++;
    return this.board.shuffle();
  }

  /** Nhận một đòn tấn công. */
  hit(kind: AttackKind): HitEffect {
    this.n++;
    return applyAttack(this.board, kind, this.cfg.gravity, this.hits++);
  }

  pairsLeft(): number {
    return this.board.remaining() / 2;
  }
}

export interface MatchOptions {
  role: Role;
  seed: number;
  /** Lúc trận bắt đầu theo đồng hồ máy này (ms, cùng gốc với `now`). */
  startAt: number;
  send: (msg: Msg) => void;
  now: () => number;
}

export class Match {
  readonly cfg: LevelConfig;
  /** Bàn của người chơi trên máy này (GameScene vẽ bàn này) và bản sao bàn đối thủ. */
  readonly me: Side;
  readonly opp: Side;
  outcome: Outcome | null = null;
  /** Các đòn mình đã đánh đối thủ, theo thứ tự: sự kiện `hit` của họ phải khớp đúng danh sách này. */
  private attacks: AttackKind[] = [];
  /** Bản sao bàn đối thủ vừa đổi. */
  onOpponent: (() => void) | null = null;
  /** Bàn mình vừa nhận một đòn của đối thủ (bàn đã đổi xong, GameScene chỉ cần vẽ lại). */
  onHit: ((effect: HitEffect) => void) | null = null;
  onEnd: ((outcome: Outcome) => void) | null = null;

  constructor(private readonly o: MatchOptions) {
    this.cfg = pvpLevel(o.seed);
    this.me = new Side(this.cfg, o.seed);
    this.opp = new Side(this.cfg, o.seed);
  }

  get role(): Role {
    return this.o.role;
  }

  /** Thời gian từ lúc trận bắt đầu (ms); âm trong lúc đếm ngược. */
  elapsed(): number {
    return this.o.now() - this.o.startAt;
  }

  /** Số giây còn lại của trận. */
  timeLeft(): number {
    return Math.min(this.cfg.time, Math.max(0, this.cfg.time - this.elapsed() / 1000));
  }

  /** Người chơi trên máy này còn được thao tác: đã hết đếm ngược, chưa hết giờ, chưa dọn xong, trận chưa kết thúc. */
  canPlay(): boolean {
    const t = this.elapsed();
    return !this.outcome && this.me.clearedAt === null && t >= 0 && t < this.cfg.time * 1000;
  }

  /** Ăn cặp a, b trên bàn mình và báo cho đối thủ. Trả về kết quả (xem Played), hoặc null nếu không được. */
  play(a: Point, b: Point): Played | null {
    if (!this.canPlay()) return null;
    const t = Math.round(this.elapsed());
    const played = this.me.match(a, b, t);
    if (!played) return null;
    if (played.attack) this.attacks.push(played.attack);
    this.sent({ type: 'match', a, b }, t);
    return played;
  }

  /** Đảo bàn mình (xem Side.shuffle) và báo cho đối thủ. Trả về các viên đá bị phá, hoặc null nếu không được. */
  shuffle(auto: boolean): Point[] | null {
    if (!this.canPlay()) return null;
    const broken = this.me.shuffle(auto);
    if (broken) this.sent({ type: 'shuffle', auto }, Math.round(this.elapsed()));
    return broken;
  }

  private sent(ev: BoardEvent, t: number): void {
    this.o.send({ k: 'ev', n: this.me.n, t, ev });
    if (this.me.board.isCleared()) this.me.clearedAt = t;
    this.decide();
  }

  surrender(): void {
    if (this.outcome) return;
    this.o.send({ k: 'bye', why: 'surrender' });
    this.finish({ result: 'lose', why: 'surrender' });
  }

  /** Mất liên lạc với đối thủ (rời phòng, mất mạng quá lâu): thắng, nếu trận chưa kết thúc. */
  opponentLeft(): void {
    if (!this.outcome) this.finish({ result: 'win', why: 'left' });
  }

  receive(msg: Msg): void {
    if (this.outcome) return;
    switch (msg.k) {
      case 'ev':
        this.receiveEvent(msg.n, msg.t, msg.ev);
        break;
      case 'result':
        if (this.o.role === 'guest') this.finish({ result: this.fromWinner(msg.winner), why: msg.why });
        break;
      case 'bye':
        if (msg.why === 'surrender') this.finish({ result: 'win', why: 'surrender' });
        else if (msg.why === 'cheat') this.finish({ result: 'lose', why: 'cheat' });
        else this.opponentLeft();
        break;
    }
  }

  private receiveEvent(n: number, t: number, ev: BoardEvent): void {
    // Nước đi sau khi hết giờ (theo đồng hồ của đối thủ) không được tính
    if (t > this.cfg.time * 1000 + LATE_MS) return;
    let attack: AttackKind | null = null;
    let valid = n === this.opp.n + 1 && t >= 0 && this.opp.clearedAt === null;
    if (valid) {
      if (ev.type === 'match') {
        const played = this.opp.match(ev.a, ev.b, t);
        valid = played !== null;
        attack = played?.attack ?? null;
      } else if (ev.type === 'shuffle') {
        valid = this.opp.shuffle(ev.auto) !== null;
      } else {
        // Chỉ nhận được đòn mình đã đánh, đúng thứ tự (không ai tự cho mình một lần đảo bàn miễn phí)
        valid = this.attacks[this.opp.hits] === ev.kind;
        if (valid) this.opp.hit(ev.kind);
      }
    }
    if (!valid) {
      // Bản sao không khớp bàn của đối thủ nữa: họ gian lận (hoặc hai máy khác phiên bản)
      this.o.send({ k: 'bye', why: 'cheat' });
      this.finish({ result: 'win', why: 'cheat' });
      return;
    }
    if (this.opp.board.isCleared()) this.opp.clearedAt = t;
    this.onOpponent?.();
    // Cặp cuối cùng của đối thủ cũng có thể là một đòn, nhưng họ đã thắng nên không cần nhận nữa
    if (attack && this.opp.clearedAt === null) this.takeHit(attack);
    this.decide();
  }

  /**
   * Đối thủ vừa đánh mình: áp đòn lên bàn mình ngay và ghi lại thành sự kiện. Đã dọn xong hay hết giờ thì
   * đòn không còn tác dụng, bỏ qua (không có sự kiện nào sau đó nên máy kia không chờ sự kiện `hit` này).
   */
  private takeHit(kind: AttackKind): void {
    if (!this.canPlay()) return;
    const effect = this.me.hit(kind);
    this.sent({ type: 'hit', kind }, Math.round(this.elapsed()));
    this.onHit?.(effect);
  }

  /** Gọi đều đặn (GameScene gọi mỗi 100 ms) để phân xử khi đã chờ đủ lâu. */
  tick(): void {
    this.decide();
  }

  /**
   * Kết quả trận theo những gì đã biết, theo góc nhìn máy này, kèm thời điểm (ms từ lúc bắt đầu) từ đó
   * chủ phòng được phân xử:
   * - hai bên đều dọn xong: ai xong trước thắng, có kết quả ngay;
   * - chỉ đối thủ dọn xong: đối thủ thắng ngay;
   * - chỉ mình dọn xong: thắng, nhưng chờ GRACE_MS phòng khi đối thủ xong sớm hơn mà tin chưa tới;
   * - chưa ai xong: hết giờ (thêm GRACE_MS) thì so số cặp còn lại.
   */
  private verdict(): Outcome & { at: number } {
    const mine = this.me.clearedAt;
    const theirs = this.opp.clearedAt;
    if (mine !== null && theirs !== null) {
      const result = mine < theirs ? 'win' : theirs < mine ? 'lose' : 'draw';
      return { result, why: 'clear', at: Math.max(mine, theirs) };
    }
    if (theirs !== null) return { result: 'lose', why: 'clear', at: theirs };
    if (mine !== null) return { result: 'win', why: 'clear', at: mine + GRACE_MS };
    const a = this.me.pairsLeft();
    const b = this.opp.pairsLeft();
    return { result: a < b ? 'win' : b < a ? 'lose' : 'draw', why: 'time', at: this.cfg.time * 1000 + GRACE_MS };
  }

  private decide(): void {
    if (this.outcome) return;
    const v = this.verdict();
    const now = this.elapsed();
    if (this.o.role === 'host') {
      if (now < v.at) return;
      const winner = v.result === 'draw' ? 'draw' : v.result === 'win' ? 'host' : 'guest';
      this.o.send({ k: 'result', winner, why: v.why });
    } else if (now < v.at + RESULT_TIMEOUT_MS) return;
    this.finish({ result: v.result, why: v.why });
  }

  /** Người thắng ghi trong tin của chủ phòng, đổi sang góc nhìn máy này. */
  private fromWinner(winner: Role | 'draw'): Outcome['result'] {
    return winner === 'draw' ? 'draw' : winner === this.o.role ? 'win' : 'lose';
  }

  private finish(outcome: Outcome): void {
    this.outcome = outcome;
    this.onEnd?.(outcome);
  }
}
