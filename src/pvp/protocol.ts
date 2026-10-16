import type { Point } from '../game/Board';
import { cleanName } from '../game/storage';
import { ATTACK_KINDS, type AttackKind } from './attacks';

/**
 * Tin nhắn giữa hai máy trong lúc đấu online, gửi dạng JSON qua kênh dữ liệu WebRTC (xem peer.ts).
 * Máy kia có thể gửi bất cứ thứ gì, nên mọi tin nhận được đều qua decode() để kiểm tra đúng dạng.
 */

/**
 * Phiên bản giao thức. Hai máy phải giống hệt nhau về tin nhắn, luật trận đấu, Board và cách sinh bàn,
 * vì mỗi máy tự chơi lại các nước đi của đối thủ trên bản sao bàn của họ (xem match.ts).
 * Tăng số này mỗi khi đổi một trong các thứ đó: máy khác phiên bản sẽ không vào được phòng của nhau.
 */
export const PROTOCOL = 2;

/** Chủ phòng (người tạo phòng, phân xử thắng thua) và khách (người vào phòng bằng mã). */
export type Role = 'host' | 'guest';

/** Lý do trận kết thúc. */
export type EndReason = 'clear' | 'time' | 'surrender' | 'left' | 'cheat';

/**
 * Một thay đổi trên bàn của người gửi: ăn một cặp, đảo bàn (tự đảo khi bế tắc, hay tự bấm nút),
 * hoặc nhận một đòn tấn công của đối thủ (xem attacks.ts).
 */
export type BoardEvent =
  | { type: 'match'; a: Point; b: Point }
  | { type: 'shuffle'; auto: boolean }
  | { type: 'hit'; kind: AttackKind };

export type Msg =
  /** Chào nhau khi vừa kết nối. Khách chỉ chào sau khi đã đo xong độ lệch đồng hồ (xem session.ts). */
  | { k: 'hello'; name: string; protocol: number }
  /** Đo độ lệch đồng hồ và giữ liên lạc: `t` là giờ người gửi ping, `at` là giờ người trả lời. */
  | { k: 'ping'; t: number }
  | { k: 'pong'; t: number; at: number }
  /** Chủ phòng: trận mới với hạt giống `seed`, bắt đầu lúc `at` theo đồng hồ chủ phòng. */
  | { k: 'start'; seed: number; at: number }
  /** Sự kiện thứ `n` (từ 1) trên bàn người gửi, lúc `t` ms kể từ khi trận bắt đầu. */
  | { k: 'ev'; n: number; t: number; ev: BoardEvent }
  /** Chủ phòng: kết quả trận. */
  | { k: 'result'; winner: Role | 'draw'; why: EndReason }
  /** Muốn đấu lại sau khi trận kết thúc. */
  | { k: 'rematch' }
  /** Đầu hàng, báo đối thủ gửi nước đi không hợp lệ, hoặc rời phòng. */
  | { k: 'bye'; why: 'surrender' | 'cheat' | 'leave' };

/** Tin dài hơn thế này chắc chắn không phải của game. */
const MAX_LENGTH = 2000;

const END_REASONS: readonly EndReason[] = ['clear', 'time', 'surrender', 'left', 'cheat'];
const BYE_REASONS = ['surrender', 'cheat', 'leave'] as const;

const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isIndex = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 100;

function toPoint(v: unknown): Point | null {
  if (typeof v !== 'object' || v === null) return null;
  const { r, c } = v as Record<string, unknown>;
  return isIndex(r) && isIndex(c) ? { r, c } : null;
}

function toEvent(v: unknown): BoardEvent | null {
  if (typeof v !== 'object' || v === null) return null;
  const e = v as Record<string, unknown>;
  if (e.type === 'shuffle') return typeof e.auto === 'boolean' ? { type: 'shuffle', auto: e.auto } : null;
  if (e.type === 'hit') return ATTACK_KINDS.includes(e.kind as AttackKind) ? { type: 'hit', kind: e.kind as AttackKind } : null;
  if (e.type !== 'match') return null;
  const a = toPoint(e.a);
  const b = toPoint(e.b);
  return a && b ? { type: 'match', a, b } : null;
}

/** Đọc một tin nhận được; sai dạng thì trả về null (bỏ qua). */
export function decode(raw: unknown): Msg | null {
  if (typeof raw !== 'string' || raw.length > MAX_LENGTH) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const m = parsed as Record<string, unknown>;
  switch (m.k) {
    case 'hello':
      return typeof m.name === 'string' && Number.isInteger(m.protocol)
        ? { k: 'hello', name: cleanName(m.name) || '?', protocol: m.protocol as number }
        : null;
    case 'ping':
      return isTime(m.t) ? { k: 'ping', t: m.t } : null;
    case 'pong':
      return isTime(m.t) && isTime(m.at) ? { k: 'pong', t: m.t, at: m.at } : null;
    case 'start':
      return Number.isInteger(m.seed) && (m.seed as number) >= 0 && isTime(m.at)
        ? { k: 'start', seed: m.seed as number, at: m.at }
        : null;
    case 'ev': {
      const ev = toEvent(m.ev);
      return ev && Number.isInteger(m.n) && isTime(m.t) ? { k: 'ev', n: m.n as number, t: m.t, ev } : null;
    }
    case 'result':
      return (m.winner === 'host' || m.winner === 'guest' || m.winner === 'draw') &&
        END_REASONS.includes(m.why as EndReason)
        ? { k: 'result', winner: m.winner, why: m.why as EndReason }
        : null;
    case 'rematch':
      return { k: 'rematch' };
    case 'bye':
      return BYE_REASONS.includes(m.why as (typeof BYE_REASONS)[number])
        ? { k: 'bye', why: m.why as (typeof BYE_REASONS)[number] }
        : null;
    default:
      return null;
  }
}

// ---------------- Mã phòng ----------------

/** Ký tự dùng trong mã phòng: bỏ I, O, 0, 1 vì dễ đọc nhầm. database.rules.json kiểm tra đúng tập này. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

/** Mã phòng ngẫu nhiên, ví dụ "K7Q2XM". */
export function randomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

/** Mã người chơi gõ vào: viết hoa, bỏ khoảng trắng và dấu gạch. Không phải mã hợp lệ thì trả về chuỗi rỗng. */
export function cleanCode(raw: string): string {
  const code = raw.toUpperCase().replace(/[\s-]/g, '');
  return code.length === CODE_LENGTH && [...code].every((ch) => CODE_ALPHABET.includes(ch)) ? code : '';
}

// ---------------- Lỗi ----------------

export type PvpErrorCode = 'config' | 'not-found' | 'full' | 'version' | 'timeout';

/** Lỗi khi tạo phòng, vào phòng hay kết nối; `code` cho biết hiện thông báo nào (xem errorText). */
export class PvpError extends Error {
  constructor(readonly code: PvpErrorCode) {
    super(code);
  }
}

const ERROR_TEXT: Record<PvpErrorCode, string> = {
  config: 'Bản game này chưa được cấu hình để đấu online.',
  'not-found': 'Không tìm thấy phòng. Hãy kiểm tra lại mã phòng.',
  full: 'Phòng này đã có người vào.',
  version: 'Hai máy đang dùng hai phiên bản game khác nhau. Hãy cập nhật game trên cả hai máy.',
  timeout: 'Không kết nối được với đối thủ. Hãy kiểm tra mạng rồi thử lại.',
};

/** Thông báo cho người chơi; lỗi khác (mất mạng, máy chủ lỗi...) dùng chung một câu. */
export function errorText(e: unknown): string {
  return e instanceof PvpError ? ERROR_TEXT[e.code] : 'Không kết nối được máy chủ. Hãy kiểm tra mạng rồi thử lại.';
}
