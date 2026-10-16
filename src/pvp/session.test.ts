import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { linkPair } from './loopback';
import type { Match } from './match';
import type { PeerLink } from './peer';
import { PROTOCOL } from './protocol';
import { HEARTBEAT_MS, PvpSession, START_DELAY_MS, TIMEOUT_MS, type LobbyState } from './session';

/**
 * Hai phiên nối với nhau bằng kết nối giả (độ trễ mỗi chiều 30 ms), không qua phòng chờ.
 * Đồng hồ của khách nhanh hơn chủ phòng 7 giây, để thử việc đồng bộ giờ bắt đầu.
 */
function connected() {
  const [hostLink, guestLink] = linkPair(30);
  const lobby: LobbyState[] = [];
  const host = new PvpSession('Chủ phòng', (s) => lobby.push(s));
  const guest = new PvpSession('Khách', () => {}, () => Date.now() + 7000);
  guest.role = 'guest';
  const starts = { host: [] as Match[], guest: [] as Match[] };
  const closed = { host: 0, guest: 0 };
  const rematches = { host: 0, guest: 0 };
  host.listener = {
    onStart: (m) => starts.host.push(m),
    onClosed: () => closed.host++,
    onRematch: () => rematches.host++,
  };
  guest.listener = {
    onStart: (m) => starts.guest.push(m),
    onClosed: () => closed.guest++,
    onRematch: () => rematches.guest++,
  };
  host.attach(hostLink);
  guest.attach(guestLink);
  return { host, guest, hostLink, guestLink, starts, closed, rematches, lobby };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PvpSession', () => {
  it('chào nhau rồi cùng bắt đầu một trận, cùng lúc dù đồng hồ hai máy lệch nhau', () => {
    const s = connected();
    vi.advanceTimersByTime(2000);
    expect(s.starts.host).toHaveLength(1);
    expect(s.starts.guest).toHaveLength(1);
    expect(s.host.oppName).toBe('Khách');
    expect(s.guest.oppName).toBe('Chủ phòng');
    const [h, g] = [s.starts.host[0], s.starts.guest[0]];
    expect(g.cfg).toEqual(h.cfg);
    expect(g.me.board.grid).toEqual(h.me.board.grid);
    // Cùng một thời điểm thật, hai máy thấy trận đã trôi qua như nhau
    expect(Math.abs(g.elapsed() - h.elapsed())).toBeLessThan(5);
    expect(h.elapsed()).toBeLessThan(0);
    expect(h.elapsed()).toBeGreaterThan(-START_DELAY_MS);
    vi.advanceTimersByTime(START_DELAY_MS);
    expect(h.canPlay()).toBe(true);
    expect(g.canPlay()).toBe(true);
  });

  it('nước đi của khách tới bản sao bàn của chủ phòng', () => {
    const s = connected();
    vi.advanceTimersByTime(2000 + START_DELAY_MS);
    const g = s.guest.match!;
    const move = g.me.board.findAnyMove()!;
    expect(g.play(move[0], move[1])).not.toBeNull();
    vi.advanceTimersByTime(100);
    expect(s.host.match!.opp.board.grid).toEqual(g.me.board.grid);
  });

  it('đấu lại khi cả hai cùng muốn', () => {
    const s = connected();
    vi.advanceTimersByTime(2000 + START_DELAY_MS);
    s.guest.match!.surrender();
    vi.advanceTimersByTime(100);
    expect(s.host.match!.outcome).toEqual({ result: 'win', why: 'surrender' });
    s.host.requestRematch();
    vi.advanceTimersByTime(100);
    expect(s.rematches.guest).toBe(1);
    expect(s.guest.rematch).toEqual({ me: false, opp: true });
    expect(s.starts.host).toHaveLength(1);
    s.guest.requestRematch();
    vi.advanceTimersByTime(100);
    expect(s.starts.host).toHaveLength(2);
    expect(s.starts.guest).toHaveLength(2);
    expect(s.host.match!.outcome).toBeNull();
    expect(s.guest.rematch).toEqual({ me: false, opp: false });
    expect(s.guest.match!.me.board.grid).toEqual(s.host.match!.me.board.grid);
  });

  it('không đấu lại khi trận chưa kết thúc', () => {
    const s = connected();
    vi.advanceTimersByTime(2000);
    s.host.requestRematch();
    vi.advanceTimersByTime(100);
    expect(s.host.rematch.me).toBe(false);
    expect(s.rematches.guest).toBe(0);
  });

  it('đối thủ rời phòng giữa trận: thắng, phiên đóng', () => {
    const s = connected();
    vi.advanceTimersByTime(2000 + START_DELAY_MS);
    s.guest.close();
    vi.advanceTimersByTime(100);
    expect(s.host.closed).toBe(true);
    expect(s.closed.host).toBe(1);
    expect(s.host.match!.outcome).toEqual({ result: 'win', why: 'left' });
    // Người rời phòng tự biết mình đi, không cần báo lại
    expect(s.closed.guest).toBe(0);
  });

  it('quá lâu không nghe thấy gì từ đối thủ: coi như đối thủ đã đi', () => {
    const s = connected();
    vi.advanceTimersByTime(2000 + START_DELAY_MS);
    // Từ giờ chủ phòng không nhận được gì nữa (khách mất mạng, app khách xuống nền)
    (s.hostLink as PeerLink).onMessage = null;
    vi.advanceTimersByTime(TIMEOUT_MS - HEARTBEAT_MS);
    expect(s.host.closed).toBe(false);
    vi.advanceTimersByTime(2 * HEARTBEAT_MS);
    expect(s.host.closed).toBe(true);
    expect(s.host.match!.outcome).toEqual({ result: 'win', why: 'left' });
    // Kết nối đóng nên khách cũng biết
    vi.advanceTimersByTime(100);
    expect(s.guest.closed).toBe(true);
  });

  it('đối thủ khác phiên bản: báo lỗi và đóng phiên', () => {
    const s = connected();
    s.hostLink.onMessage!(JSON.stringify({ k: 'hello', name: 'X', protocol: PROTOCOL + 1 }));
    expect(s.host.closed).toBe(true);
    expect(s.lobby.at(-1)).toMatchObject({ step: 'error' });
  });
});
