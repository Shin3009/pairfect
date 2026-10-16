import { describe, expect, it } from 'vitest';
import { STONE } from '../game/Board';
import { seededRng } from '../game/rng';
import { COMBO_ATTACKS, COMBO_MS, COMBO_STEP, type HitEffect } from './attacks';
import {
  GRACE_MS,
  LATE_MS,
  Match,
  PVP_GRAVITIES,
  PVP_SHUFFLES,
  PVP_TIME,
  pvpLevel,
  RESULT_TIMEOUT_MS,
  type Outcome,
  type Played,
} from './match';
import { decode, type Msg } from './protocol';

/**
 * Hai máy đấu với nhau. Tin gửi đi nằm trong hàng đợi tới khi gọi deliver(), như đang trên đường truyền;
 * đồng hồ chung do test điều khiển. Trận bắt đầu sau 1 giây đếm ngược.
 */
function duel(seed = 12345) {
  let now = 1_000_000;
  const startAt = now + 1000;
  const toGuest: Msg[] = [];
  const toHost: Msg[] = [];
  // Gửi qua JSON như thật, để chắc tin nào cũng qua được decode
  const wire = (q: Msg[]) => (m: Msg) => q.push(decode(JSON.stringify(m))!);
  const host = new Match({ role: 'host', seed, startAt, send: wire(toGuest), now: () => now });
  const guest = new Match({ role: 'guest', seed, startAt, send: wire(toHost), now: () => now });
  const ends: Record<'host' | 'guest', Outcome[]> = { host: [], guest: [] };
  host.onEnd = (o) => ends.host.push(o);
  guest.onEnd = (o) => ends.guest.push(o);
  return {
    host,
    guest,
    ends,
    toGuest,
    toHost,
    /** Tới thời điểm `ms` kể từ lúc trận bắt đầu. */
    at(ms: number) {
      now = startAt + ms;
      host.tick();
      guest.tick();
    },
    deliver() {
      while (toGuest.length || toHost.length) {
        toGuest.splice(0).forEach((m) => guest.receive(m));
        toHost.splice(0).forEach((m) => host.receive(m));
      }
    },
  };
}

/** Một nước đi chắc chắn được của bàn mình: ăn cặp đầu tiên tìm được, bế tắc thì tự đảo. */
function step(m: Match): void {
  const move = m.me.board.findAnyMove();
  if (move) expect(m.play(move[0], move[1])).not.toBeNull();
  else expect(m.shuffle(true)).not.toBeNull();
}

function clearBoard(m: Match, after: () => void = () => {}): void {
  for (let guard = 0; !m.me.board.isCleared() && guard < 500; guard++) {
    step(m);
    after();
  }
  expect(m.me.board.isCleared()).toBe(true);
}

/** Hạt giống cho ra kiểu dồn thứ i trong PVP_GRAVITIES. */
const seedFor = (i: number, k = 0) => i + k * PVP_GRAVITIES.length;

describe('pvpLevel', () => {
  it('bàn hợp lệ: số ô chẵn, rộng hơn cao, mỗi loại 4 ô', () => {
    const lv = pvpLevel(0);
    expect((lv.rows * lv.cols) % 2).toBe(0);
    expect(lv.cols).toBeGreaterThan(lv.rows);
    expect(lv.types).toBe((lv.rows * lv.cols) / 4);
    expect(lv.time).toBe(PVP_TIME);
  });

  it('kiểu dồn theo hạt giống, có đủ mọi kiểu', () => {
    const seen = new Set(Array.from({ length: 50 }, (_, s) => pvpLevel(s).gravity));
    expect([...seen].sort()).toEqual([...PVP_GRAVITIES].sort());
  });
});

describe('Match', () => {
  it('hai máy sinh cùng một bàn', () => {
    const d = duel();
    expect(d.guest.me.board.grid).toEqual(d.host.me.board.grid);
    expect(d.host.opp.board.grid).toEqual(d.host.me.board.grid);
  });

  it('bản sao bàn đối thủ luôn khớp bàn thật, với mọi kiểu dồn và cả khi đảo bàn', () => {
    PVP_GRAVITIES.forEach((_, i) => {
      for (let k = 0; k < 3; k++) {
        const d = duel(seedFor(i, k));
        d.at(0);
        let moves = 0;
        clearBoard(d.guest, () => {
          // Thỉnh thoảng tự bấm Đảo bàn
          if (++moves % 7 === 0 && d.guest.me.shuffles > 0) d.guest.shuffle(false);
          d.deliver();
          expect(d.host.opp.board.grid).toEqual(d.guest.me.board.grid);
        });
        expect(d.host.opp.shuffles).toBe(d.guest.me.shuffles);
        expect(d.host.outcome).toEqual({ result: 'lose', why: 'clear' });
      }
    });
  });

  it('không chơi được trong lúc đếm ngược và sau khi hết giờ', () => {
    const d = duel();
    const move = d.host.me.board.findAnyMove()!;
    d.at(-500);
    expect(d.host.canPlay()).toBe(false);
    expect(d.host.play(move[0], move[1])).toBeNull();
    expect(d.host.timeLeft()).toBe(PVP_TIME);
    d.at(0);
    expect(d.host.canPlay()).toBe(true);
    d.at(PVP_TIME * 1000);
    expect(d.host.canPlay()).toBe(false);
    expect(d.host.play(move[0], move[1])).toBeNull();
    expect(d.toGuest).toHaveLength(0);
  });

  it('chủ phòng dọn xong trước: thắng sau GRACE_MS', () => {
    const d = duel();
    d.at(30_000);
    clearBoard(d.host);
    expect(d.host.canPlay()).toBe(false);
    d.deliver();
    expect(d.host.outcome).toBeNull();
    d.at(30_000 + GRACE_MS);
    expect(d.ends.host).toEqual([{ result: 'win', why: 'clear' }]);
    d.deliver();
    expect(d.ends.guest).toEqual([{ result: 'lose', why: 'clear' }]);
  });

  it('khách dọn xong trước: thắng ngay khi tin tới chủ phòng', () => {
    const d = duel();
    d.at(30_000);
    clearBoard(d.guest);
    expect(d.guest.outcome).toBeNull();
    d.deliver();
    expect(d.ends.host).toEqual([{ result: 'lose', why: 'clear' }]);
    expect(d.ends.guest).toEqual([{ result: 'win', why: 'clear' }]);
  });

  it('khách dọn xong sớm hơn mà tin tới sau khi chủ phòng xong: khách vẫn thắng', () => {
    const d = duel();
    d.at(40_000);
    clearBoard(d.guest); // tin còn trên đường
    d.at(40_300);
    clearBoard(d.host);
    d.at(40_300 + GRACE_MS / 2);
    expect(d.host.outcome).toBeNull();
    d.deliver();
    expect(d.ends.host).toEqual([{ result: 'lose', why: 'clear' }]);
    expect(d.ends.guest).toEqual([{ result: 'win', why: 'clear' }]);
  });

  it('hết giờ: ai còn ít cặp hơn thắng', () => {
    const d = duel();
    d.at(1000);
    for (let i = 0; i < 3; i++) step(d.guest);
    step(d.host);
    d.deliver();
    d.at(PVP_TIME * 1000);
    expect(d.host.outcome).toBeNull();
    d.at(PVP_TIME * 1000 + GRACE_MS);
    d.deliver();
    expect(d.ends.host).toEqual([{ result: 'lose', why: 'time' }]);
    expect(d.ends.guest).toEqual([{ result: 'win', why: 'time' }]);
  });

  it('hết giờ mà hai bên còn bằng số cặp: hòa', () => {
    const d = duel();
    d.at(PVP_TIME * 1000 + GRACE_MS);
    d.deliver();
    expect(d.ends.host).toEqual([{ result: 'draw', why: 'time' }]);
    expect(d.ends.guest).toEqual([{ result: 'draw', why: 'time' }]);
  });

  it('khách tự phân xử khi chủ phòng không gửi kết quả', () => {
    const d = duel();
    d.at(20_000);
    clearBoard(d.guest); // tin không bao giờ tới chủ phòng
    d.at(20_000 + GRACE_MS + RESULT_TIMEOUT_MS - 1);
    expect(d.guest.outcome).toBeNull();
    d.at(20_000 + GRACE_MS + RESULT_TIMEOUT_MS);
    expect(d.ends.guest).toEqual([{ result: 'win', why: 'clear' }]);
  });

  it('nước đi không nối được: đối thủ bị xử thua', () => {
    const d = duel();
    d.at(1000);
    d.host.receive({ k: 'ev', n: 1, t: 1000, ev: { type: 'match', a: { r: 1, c: 1 }, b: { r: 1, c: 1 } } });
    expect(d.ends.host).toEqual([{ result: 'win', why: 'cheat' }]);
    d.deliver();
    expect(d.ends.guest).toEqual([{ result: 'lose', why: 'cheat' }]);
  });

  it('nước đi ra ngoài bàn: bị xử thua, không làm hỏng bản sao', () => {
    const d = duel();
    d.at(1000);
    d.host.receive({ k: 'ev', n: 1, t: 1000, ev: { type: 'match', a: { r: 0, c: 0 }, b: { r: 50, c: 50 } } });
    expect(d.host.outcome).toEqual({ result: 'win', why: 'cheat' });
  });

  it('sự kiện sai thứ tự: bị xử thua', () => {
    const d = duel();
    d.at(1000);
    d.host.receive({ k: 'ev', n: 2, t: 1000, ev: { type: 'shuffle', auto: false } });
    expect(d.host.outcome).toEqual({ result: 'win', why: 'cheat' });
  });

  it('tự đảo bàn khi vẫn còn nước đi: bị xử thua', () => {
    const d = duel();
    d.at(1000);
    d.host.receive({ k: 'ev', n: 1, t: 1000, ev: { type: 'shuffle', auto: true } });
    expect(d.host.outcome).toEqual({ result: 'win', why: 'cheat' });
  });

  it('bấm Đảo bàn quá số lượt: bị xử thua', () => {
    const d = duel();
    d.at(1000);
    for (let n = 1; n <= PVP_SHUFFLES; n++) d.host.receive({ k: 'ev', n, t: 1000, ev: { type: 'shuffle', auto: false } });
    expect(d.host.outcome).toBeNull();
    d.host.receive({ k: 'ev', n: PVP_SHUFFLES + 1, t: 1000, ev: { type: 'shuffle', auto: false } });
    expect(d.host.outcome).toEqual({ result: 'win', why: 'cheat' });
  });

  it('nước đi gửi sau khi hết giờ bị bỏ qua', () => {
    const d = duel();
    d.at(PVP_TIME * 1000 + 100);
    const move = d.host.opp.board.findAnyMove()!;
    d.host.receive({ k: 'ev', n: 1, t: PVP_TIME * 1000 + LATE_MS + 1, ev: { type: 'match', a: move[0], b: move[1] } });
    expect(d.host.outcome).toBeNull();
    expect(d.host.opp.n).toBe(0);
    // Trễ ít hơn LATE_MS (đồng hồ lệch nhau một chút) thì vẫn được tính
    d.host.receive({ k: 'ev', n: 1, t: PVP_TIME * 1000 + LATE_MS, ev: { type: 'match', a: move[0], b: move[1] } });
    expect(d.host.opp.n).toBe(1);
  });

  it('đầu hàng', () => {
    const d = duel();
    d.at(5000);
    d.guest.surrender();
    expect(d.ends.guest).toEqual([{ result: 'lose', why: 'surrender' }]);
    d.deliver();
    expect(d.ends.host).toEqual([{ result: 'win', why: 'surrender' }]);
  });

  it('đối thủ rời trận: thắng; trận đã kết thúc thì không đổi kết quả nữa', () => {
    const d = duel();
    d.at(5000);
    d.host.opponentLeft();
    expect(d.ends.host).toEqual([{ result: 'win', why: 'left' }]);
    d.host.receive({ k: 'bye', why: 'surrender' });
    d.host.opponentLeft();
    d.at(PVP_TIME * 1000 + GRACE_MS);
    expect(d.ends.host).toHaveLength(1);
  });
});

/** Ăn một cặp bất kỳ (bế tắc thì tự đảo trước), trả về kết quả lần ăn đó. */
function playOne(m: Match): Played {
  for (let i = 0; i < 5; i++) {
    const move = m.me.board.findAnyMove();
    if (move) return m.play(move[0], move[1])!;
    expect(m.shuffle(true)).not.toBeNull();
  }
  throw new Error('Bàn vẫn bế tắc sau khi đảo');
}

const stones = (m: Match) => m.me.board.grid.flat().filter((v) => v === STONE).length;

describe('tấn công', () => {
  it('chuỗi tăng khi ăn nhanh liên tiếp, về 1 khi chậm quá', () => {
    const d = duel();
    const combos: number[] = [];
    for (const t of [1000, 2000, 2000 + COMBO_MS, 2000 + 2 * COMBO_MS + 1]) {
      d.at(t);
      combos.push(playOne(d.host).combo);
    }
    expect(combos).toEqual([1, 2, 3, 1]);
  });

  it('chuỗi 3 cặp thả đá lên bàn đối thủ, bản sao ở máy kẻ tấn công khớp', () => {
    const d = duel();
    const hits: HitEffect[] = [];
    d.guest.onHit = (e) => hits.push(e);
    // Khách ăn trước vài cặp (chậm, không thành chuỗi) để bàn có chỗ trống cho đá
    for (const t of [1000, 5000, 9000]) {
      d.at(t);
      playOne(d.guest);
    }
    d.at(10_000);
    expect([playOne(d.host).attack, playOne(d.host).attack, playOne(d.host).attack]).toEqual([null, null, 'stone']);
    d.deliver();
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ kind: 'stone' });
    expect(stones(d.guest)).toBe(1);
    expect(d.host.opp.board.grid).toEqual(d.guest.me.board.grid);
  });

  it('chuỗi dài: đủ các loại đòn theo thứ tự', () => {
    const d = duel();
    const hits: HitEffect[] = [];
    d.guest.onHit = (e) => hits.push(e);
    for (const t of [1000, 5000, 9000]) {
      d.at(t);
      playOne(d.guest);
    }
    d.at(10_000);
    for (let i = 0; i < COMBO_STEP * COMBO_ATTACKS.length; i++) playOne(d.host);
    d.deliver();
    expect(hits.map((h) => h.kind)).toEqual(COMBO_ATTACKS);
    expect(d.guest.me.hits).toBe(COMBO_ATTACKS.length);
    expect(d.host.opp.board.grid).toEqual(d.guest.me.board.grid);
    expect(d.host.outcome).toBeNull();
  });

  it('cả hai cùng tấn công, tin đến trễ: bản sao hai bên luôn khớp tới hết trận', () => {
    const rng = seededRng(99);
    PVP_GRAVITIES.forEach((_, i) => {
      for (let k = 0; k < 4; k++) {
        const d = duel(seedFor(i, k));
        let t = 0;
        let hits = 0;
        d.host.onHit = () => hits++;
        d.guest.onHit = () => hits++;
        for (let guard = 0; guard < 3000 && !(d.host.outcome && d.guest.outcome); guard++) {
          t += Math.floor(rng() * 1500);
          d.at(t);
          const m = rng() < 0.5 ? d.host : d.guest;
          if (m.canPlay()) step(m);
          // Tin đến theo từng đợt, như mạng chậm. Trận đã có kết quả thì bản sao thôi theo dõi bàn đối thủ
          if (rng() < 0.3) {
            d.deliver();
            if (d.host.outcome || d.guest.outcome) continue;
            expect(d.host.opp.board.grid).toEqual(d.guest.me.board.grid);
            expect(d.guest.opp.board.grid).toEqual(d.host.me.board.grid);
          }
        }
        expect(hits).toBeGreaterThan(0);
        expect(['clear', 'time']).toContain(d.host.outcome?.why);
        expect(d.guest.outcome?.why).toBe(d.host.outcome?.why);
      }
    });
  });

  it('đòn không có thật hoặc sai loại: bị xử thua', () => {
    const d = duel();
    d.at(1000);
    d.host.receive({ k: 'ev', n: 1, t: 1000, ev: { type: 'hit', kind: 'shuffle' } });
    expect(d.host.outcome).toEqual({ result: 'win', why: 'cheat' });

    const e = duel();
    e.at(1000);
    for (let i = 0; i < 3; i++) playOne(e.host); // đánh một viên đá
    e.host.receive({ k: 'ev', n: 1, t: 1000, ev: { type: 'hit', kind: 'fog' } });
    expect(e.host.outcome).toEqual({ result: 'win', why: 'cheat' });
  });

  it('đã dọn xong thì không nhận đòn nữa, không bị coi là gian lận', () => {
    const d = duel();
    d.at(30_000);
    clearBoard(d.guest);
    for (let i = 0; i < 3; i++) playOne(d.host);
    d.deliver();
    expect(d.guest.me.hits).toBe(0);
    expect(d.ends.host).toEqual([{ result: 'lose', why: 'clear' }]);
    expect(d.ends.guest).toEqual([{ result: 'win', why: 'clear' }]);
  });
});
