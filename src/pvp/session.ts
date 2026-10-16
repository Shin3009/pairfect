import { randomSeed } from '../game/rng';
import { ClockSync } from './clock';
import { Match } from './match';
import { openPeer, type PeerLink } from './peer';
import { decode, errorText, PROTOCOL, PvpError, type Msg, type Role } from './protocol';
import { createRoom, joinRoom, type Room } from './signaling';
import { iceServers } from './turn';

/**
 * Một phiên đấu online với một đối thủ: từ lúc tạo / vào phòng, qua các trận (đấu lại bao nhiêu lần cũng được),
 * tới khi một bên rời phòng. Phiên sống ngoài các scene: phòng chờ (PvpLobbyScene) tạo ra nó rồi chuyển cho
 * GameScene, GameScene khởi động lại cho mỗi trận mới mà kết nối vẫn giữ nguyên.
 *
 * Trình tự khi vừa kết nối:
 * 1. Hai máy ping nhau liên tục (mỗi HEARTBEAT_MS): vừa đo độ lệch đồng hồ, vừa biết đối thủ còn đó.
 * 2. Chủ phòng chào ngay; khách chào sau khi đo được SYNC_SAMPLES lần (đã biết độ lệch đồng hồ).
 * 3. Nhận lời chào của khách, chủ phòng gửi `start`: hạt giống và giờ bắt đầu theo đồng hồ chủ phòng,
 *    khách đổi sang đồng hồ của mình. Cả hai cùng đếm ngược rồi bắt đầu cùng lúc.
 * Không nghe thấy gì từ đối thủ trong TIMEOUT_MS (mất mạng, app xuống nền) thì coi như đối thủ đã rời đi.
 */
export const HEARTBEAT_MS = 1000;
export const TIMEOUT_MS = 10000;
/** Từ lúc chủ phòng gửi `start` tới lúc trận bắt đầu: đủ cho tin đi tới khách, mở màn chơi và đếm ngược 3 giây. */
export const START_DELAY_MS = 4000;
const SYNC_SAMPLES = 3;
/** Lúc vừa kết nối: ping dồn dập để khách sớm biết độ lệch đồng hồ. */
const SYNC_BURST = 5;
const SYNC_BURST_MS = 150;

/** Các bước trong phòng chờ, để PvpLobbyScene hiện đúng màn hình. */
export type LobbyState =
  | { step: 'creating' }
  | { step: 'waiting'; code: string }
  | { step: 'connecting'; code: string; opponent: string | null }
  | { step: 'error'; message: string };

/** Scene đang hiện nghe phiên qua đây (mỗi lúc chỉ một scene). */
export interface SessionListener {
  /** Trận mới bắt đầu (lần đầu, hoặc khi hai bên cùng muốn đấu lại). */
  onStart?(match: Match): void;
  /** Đối thủ vừa muốn đấu lại. */
  onRematch?(): void;
  /** Đối thủ đã rời phòng hoặc mất liên lạc hẳn; trận đang dở (nếu có) đã được xử thắng. */
  onClosed?(): void;
  /** Mất kết nối tạm thời (false) hoặc đã kết nối lại (true). */
  onLink?(ok: boolean): void;
}

/** Chỉ khi phát triển: `?relay` trên địa chỉ trang buộc đi qua TURN, để thử máy chủ TURN trên cùng một máy. */
function forceRelay(): boolean {
  return import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('relay');
}

export class PvpSession {
  role: Role = 'host';
  code = '';
  oppName = 'Đối thủ';
  /** Kết nối đi qua máy chủ TURN (không nối thẳng được). */
  relayed = false;
  /** Trận gần nhất (đang đấu hoặc vừa xong). */
  match: Match | null = null;
  /** Phiên đã đóng: mình rời phòng hoặc đối thủ đã đi. */
  closed = false;
  /** Ai đã bấm đấu lại sau trận gần nhất. */
  rematch = { me: false, opp: false };
  listener: SessionListener | null = null;

  private link: PeerLink | null = null;
  private room: Room | null = null;
  private clock = new ClockSync();
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private lastHeard = 0;
  private greeted = false;

  constructor(
    readonly myName: string,
    private readonly onLobby: (state: LobbyState) => void = () => {},
    /** Đồng hồ của máy này (ms); test thay bằng đồng hồ lệch để thử việc đồng bộ. */
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Tạo phòng và chờ khách. Khách vào mà không kết nối được thì mời ra và chờ khách khác. */
  async host(): Promise<void> {
    this.role = 'host';
    try {
      this.onLobby({ step: 'creating' });
      const room = await createRoom(this.myName);
      if (this.closed) return void room.leave();
      this.room = room;
      this.code = room.code;
      for (;;) {
        this.onLobby({ step: 'waiting', code: room.code });
        const guest = await room.waitForGuest();
        if (this.closed) return;
        this.oppName = guest.name;
        this.onLobby({ step: 'connecting', code: room.code, opponent: guest.name });
        try {
          await this.connect(room);
          return;
        } catch (e) {
          if (this.closed) return;
          console.warn('Không kết nối được với khách, chờ khách khác:', e);
          await room.kickGuest();
        }
      }
    } catch (e) {
      this.fail(e);
    }
  }

  /** Vào phòng bằng mã (đã qua cleanCode). */
  async join(code: string): Promise<void> {
    this.role = 'guest';
    this.code = code;
    try {
      this.onLobby({ step: 'connecting', code, opponent: null });
      const room = await joinRoom(code, this.myName);
      if (this.closed) return void room.leave();
      this.room = room;
      this.oppName = room.hostName;
      this.onLobby({ step: 'connecting', code, opponent: room.hostName });
      await this.connect(room);
    } catch (e) {
      this.fail(e);
    }
  }

  private async connect(room: Room): Promise<void> {
    const link = await openPeer(this.role, await iceServers(), room.signal, forceRelay());
    if (this.closed) return link.close();
    this.attach(link);
    void link.relayed().then((r) => (this.relayed = r));
  }

  /** Bắt đầu nói chuyện qua kết nối đã mở. Test và đấu với máy (bot.ts) gọi thẳng, không qua phòng chờ. */
  attach(link: PeerLink): void {
    this.link = link;
    this.lastHeard = this.now();
    link.onMessage = (raw) => this.receive(raw);
    link.onStatus = (status) => (status === 'closed' ? this.lost() : this.listener?.onLink?.(status === 'connected'));
    this.heartbeat = setInterval(() => this.beat(), HEARTBEAT_MS);
    for (let i = 0; i < SYNC_BURST; i++) setTimeout(() => this.ping(), i * SYNC_BURST_MS);
    if (this.role === 'host') this.greet();
  }

  /** Muốn đấu lại sau khi trận kết thúc; hai bên cùng muốn thì chủ phòng bắt đầu trận mới. */
  requestRematch(): void {
    if (this.closed || !this.match?.outcome || this.rematch.me) return;
    this.rematch.me = true;
    this.send({ k: 'rematch' });
    if (this.role === 'host' && this.rematch.opp) this.startMatch();
  }

  /** Rời phòng (về menu, hủy chờ). Đối thủ được báo ngay, trận đang dở (nếu có) thì họ thắng. */
  close(): void {
    if (this.closed) return;
    this.send({ k: 'bye', why: 'leave' });
    this.shutdown();
  }

  private send(msg: Msg): void {
    if (!this.closed) this.link?.send(JSON.stringify(msg));
  }

  private ping(): void {
    this.send({ k: 'ping', t: this.now() });
  }

  private greet(): void {
    this.greeted = true;
    this.send({ k: 'hello', name: this.myName, protocol: PROTOCOL });
  }

  private beat(): void {
    if (this.now() - this.lastHeard > TIMEOUT_MS) this.lost();
    else this.ping();
  }

  private receive(raw: string): void {
    const msg = decode(raw);
    if (!msg || this.closed) return;
    this.lastHeard = this.now();
    switch (msg.k) {
      case 'ping':
        this.send({ k: 'pong', t: msg.t, at: this.now() });
        break;
      case 'pong':
        this.clock.sample(msg.t, msg.at, this.now());
        if (this.role === 'guest' && !this.greeted && this.clock.count >= SYNC_SAMPLES) this.greet();
        break;
      case 'hello':
        if (msg.protocol !== PROTOCOL) return this.fail(new PvpError('version'));
        this.oppName = msg.name;
        if (this.role === 'host' && !this.match) this.startMatch();
        break;
      case 'start':
        if (this.role === 'guest') this.begin(msg.seed, this.clock.toLocal(msg.at));
        break;
      case 'rematch':
        if (!this.match?.outcome) break;
        this.rematch.opp = true;
        this.listener?.onRematch?.();
        if (this.role === 'host' && this.rematch.me) this.startMatch();
        break;
      case 'bye':
        if (msg.why === 'leave') this.lost();
        else this.match?.receive(msg);
        break;
      default:
        this.match?.receive(msg);
    }
  }

  private startMatch(): void {
    const seed = randomSeed();
    const at = this.now() + START_DELAY_MS;
    this.send({ k: 'start', seed, at });
    this.begin(seed, at);
  }

  private begin(seed: number, startAt: number): void {
    this.rematch = { me: false, opp: false };
    this.match = new Match({ role: this.role, seed, startAt, send: (m) => this.send(m), now: this.now });
    this.listener?.onStart?.(this.match);
  }

  /** Đối thủ đã đi (báo rời phòng, kết nối đóng, quá lâu không nghe thấy gì). */
  private lost(): void {
    if (this.closed) return;
    this.shutdown();
    this.match?.opponentLeft();
    this.listener?.onClosed?.();
  }

  private fail(e: unknown): void {
    if (this.closed) return;
    console.warn('Đấu online lỗi:', e);
    this.close();
    this.onLobby({ step: 'error', message: errorText(e) });
  }

  private shutdown(): void {
    this.closed = true;
    clearInterval(this.heartbeat);
    this.link?.close();
    this.link = null;
    void this.room?.leave();
    this.room = null;
  }
}
