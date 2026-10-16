/**
 * Lưu vào localStorage: bảng xếp hạng (kỷ lục là điểm cao nhất trên bảng), tên người chơi,
 * bản kỷ lục đã gửi lên mạng (xem online.ts), bộ hình ô đang chọn và lượt chơi đang lưu dở.
 * Không phụ thuộc Phaser. Mọi lỗi lưu trữ (trình duyệt chặn, chế độ ẩn danh...) đều được bỏ qua.
 */

const LEADERBOARD_KEY = 'pairfect-leaderboard';
const PLAYER_NAME_KEY = 'pairfect-player-name';
const SYNCED_BEST_KEY = 'pairfect-synced-best';
const TILE_ART_KEY = 'pairfect-tile-art';
const SAVED_GAME_KEY = 'pairfect-saved-game';

/** Số lượt chơi giữ lại trên bảng xếp hạng. */
export const LEADERBOARD_SIZE = 10;

/** Một lượt chơi đã kết thúc vì thua (hết giờ hoặc hết nước đi). */
export interface LeaderboardEntry {
  score: number;
  /** Màn đang chơi lúc thua, đánh số từ 1 như trên HUD. */
  stage: number;
  /** Thời điểm kết thúc, tính bằng mili giây (Date.now()). */
  date: number;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* bỏ qua nếu trình duyệt chặn lưu trữ */
  }
}

/** Đọc JSON đã lưu; không có hoặc hỏng thì trả về null. */
function readJson(key: string): unknown {
  try {
    return JSON.parse(read(key) ?? 'null');
  } catch {
    return null;
  }
}

/** Thứ tự xếp hạng: điểm cao hơn đứng trên; bằng điểm thì màn xa hơn; vẫn bằng thì lượt chơi trước đứng trên. */
export function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  return b.score - a.score || b.stage - a.stage || a.date - b.date;
}

/**
 * Chèn `entry` vào bảng xếp hạng rồi cắt còn LEADERBOARD_SIZE dòng. Không sửa mảng đầu vào.
 * `rank` là thứ hạng của `entry` (từ 1), hoặc null nếu nó không lọt vào bảng.
 */
export function insertEntry(
  list: LeaderboardEntry[],
  entry: LeaderboardEntry,
): { list: LeaderboardEntry[]; rank: number | null } {
  const next = [...list, entry].sort(compareEntries).slice(0, LEADERBOARD_SIZE);
  const i = next.indexOf(entry);
  return { list: next, rank: i < 0 ? null : i + 1 };
}

function isEntry(e: unknown): e is LeaderboardEntry {
  if (typeof e !== 'object' || e === null) return false;
  const { score, stage, date } = e as Record<string, unknown>;
  return [score, stage, date].every((v) => typeof v === 'number' && Number.isFinite(v));
}

/** Bảng xếp hạng, hạng 1 trước. Dữ liệu hỏng hoặc không đọc được thì coi như bảng trống. */
export function loadLeaderboard(): LeaderboardEntry[] {
  const list = readJson(LEADERBOARD_KEY);
  if (!Array.isArray(list)) return [];
  return list.filter(isEntry).sort(compareEntries).slice(0, LEADERBOARD_SIZE);
}

/** Kỷ lục: điểm cao nhất trên bảng xếp hạng, nên bỏ cuộc giữa chừng không tính. Bảng trống thì là 0. */
export function loadBest(): number {
  return loadLeaderboard()[0]?.score ?? 0;
}

/** Thứ hạng một lượt chơi sẽ có nếu ghi vào bảng xếp hạng lúc này (từ 1, hoặc null nếu không lọt vào bảng). Không ghi gì. */
export function rankFor(score: number, stage: number): number | null {
  return insertEntry(loadLeaderboard(), { score, stage, date: Date.now() }).rank;
}

/**
 * Ghi một lượt chơi đã kết thúc vào bảng xếp hạng.
 * Trả về thứ hạng của lượt này (từ 1), hoặc null nếu điểm không đủ lọt vào bảng.
 */
export function addToLeaderboard(score: number, stage: number): number | null {
  const { list, rank } = insertEntry(loadLeaderboard(), { score, stage, date: Date.now() });
  write(LEADERBOARD_KEY, JSON.stringify(list));
  return rank;
}

// ---------------- Tên người chơi ----------------

/** Độ dài tối đa của tên người chơi, tính bằng ký tự. */
export const NAME_MAX = 20;

/**
 * Chuẩn hóa tên nhập vào: bỏ ký tự điều khiển (kể cả ký tự đảo chiều chữ, vốn làm rối tên khi hiện cạnh tên khác),
 * gộp khoảng trắng, cắt còn NAME_MAX ký tự. Không còn gì thì trả về ''.
 */
export function cleanName(raw: string): string {
  const name = raw
    .normalize('NFC')
    .replace(/[\p{Cc}\u202A-\u202E\u2066-\u2069]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(name).slice(0, NAME_MAX).join('').trim();
}

/** Tên người chơi trên máy này, hoặc null nếu chưa nhập (lần đầu mở game). */
export function loadPlayerName(): string | null {
  return cleanName(read(PLAYER_NAME_KEY) ?? '') || null;
}

/** Lưu tên người chơi (không được rỗng sau cleanName), trả về tên đã chuẩn hóa. */
export function savePlayerName(name: string): string {
  const clean = cleanName(name);
  write(PLAYER_NAME_KEY, clean);
  return clean;
}

// ---------------- Kỷ lục trên mạng ----------------

/** Kỷ lục của người chơi như lưu trên mạng (xem online.ts): tên hiện tại kèm điểm cao nhất trên bảng xếp hạng. */
export interface OnlineBest {
  name: string;
  score: number;
  /** Màn đang chơi lúc thua, đánh số từ 1 như trên HUD. */
  stage: number;
}

/** Bản gửi lên mạng thành công lần gần nhất, để biết khi nào cần gửi lại; chưa gửi lần nào thì null. */
export function loadSyncedBest(): OnlineBest | null {
  const r = readJson(SYNCED_BEST_KEY);
  if (typeof r !== 'object' || r === null) return null;
  const { name, score, stage } = r as Record<string, unknown>;
  if (typeof name !== 'string' || typeof score !== 'number' || typeof stage !== 'number') return null;
  return { name, score, stage };
}

export function saveSyncedBest(best: OnlineBest): void {
  write(SYNCED_BEST_KEY, JSON.stringify(best));
}

// ---------------- Bộ hình ô ----------------

/** Mã bộ hình ô người chơi đã chọn, hoặc null nếu chưa chọn. Mã không còn tồn tại thì tileArt.ts tự dùng bộ mặc định. */
export function loadTileArt(): string | null {
  return read(TILE_ART_KEY) || null;
}

export function saveTileArt(id: string): void {
  write(TILE_ART_KEY, id);
}

// ---------------- Lượt chơi đang lưu ----------------

/** Lý do thua màn: hết giờ hoặc hết nước đi (bàn bế tắc mà hết lượt Đảo bàn). */
export type LoseReason = 'time' | 'moves';

/**
 * Lượt chơi đang dở, để chơi tiếp từ menu (kể cả sau khi app bị tắt ngang). Các trường ngoài `play`
 * là chỗ vào màn đang chơi: đó cũng là dữ liệu GameScene nhận khi vào màn, và là chỗ bắt đầu lại khi chơi lại màn sau khi thua.
 */
export interface SavedGame {
  /** Màn đang chơi, đánh số từ 0. */
  level: number;
  /** Điểm lúc vào màn. */
  score: number;
  /** Lượt Gợi ý / Đảo bàn còn dư từ màn trước, chưa cộng lượt của màn này. */
  hints: number;
  shuffles: number;
  /** Lượt chơi lại còn lại của cả lượt chơi. */
  retries: number;
  /** Màn đang chơi dở; không có thì vào màn từ đầu (như vừa qua màn trước). */
  play?: SavedPlay;
}

/** Trạng thái giữa màn: đủ để dựng lại đúng bàn đang chơi. */
export interface SavedPlay {
  score: number;
  /** Lượt Gợi ý / Đảo bàn còn lại (đã cộng lượt của màn này). */
  hints: number;
  shuffles: number;
  /** Số giây còn lại. */
  timeLeft: number;
  /** Số cặp đã ăn trong màn, quyết định hướng dồn kế tiếp của kiểu Xoay vòng. */
  matches: number;
  /** Lưới có viền của Board (xem Board.load). */
  grid: number[][];
  /** Đã thua màn, đang chờ chọn chơi lại hay về menu. */
  lost?: LoseReason;
}

const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

function isSavedPlay(p: unknown): p is SavedPlay {
  if (typeof p !== 'object' || p === null) return false;
  const { score, hints, shuffles, timeLeft, matches, grid, lost } = p as Record<string, unknown>;
  return (
    [score, hints, shuffles, matches].every(isCount) &&
    typeof timeLeft === 'number' &&
    Number.isFinite(timeLeft) &&
    Array.isArray(grid) &&
    grid.every((row) => Array.isArray(row) && row.every((v) => Number.isInteger(v))) &&
    (lost === undefined || lost === 'time' || lost === 'moves')
  );
}

/**
 * Lượt chơi đang lưu, hoặc null nếu không có (hay dữ liệu hỏng).
 * Riêng phần màn chơi dở hỏng thì bỏ phần đó: vẫn chơi tiếp được, từ đầu màn đang chơi.
 */
export function loadSavedGame(): SavedGame | null {
  const stored = readJson(SAVED_GAME_KEY);
  if (typeof stored !== 'object' || stored === null) return null;
  const s = (stored as Record<string, unknown>).game;
  if (typeof s !== 'object' || s === null) return null;
  const { level, score, hints, shuffles, retries, play } = s as Record<string, unknown>;
  if (!isCount(level) || !isCount(score) || !isCount(hints) || !isCount(shuffles) || !isCount(retries)) return null;
  return { level, score, hints, shuffles, retries, ...(isSavedPlay(play) ? { play } : {}) };
}

/**
 * Nơi ghi thêm một bản sao của mỗi lần lưu (trên Android: bộ nhớ riêng của app, xem native.ts),
 * phòng khi localStorage của WebView chưa kịp ghi xuống đĩa thì app đã bị tắt.
 */
let mirror: ((raw: string) => void) | null = null;

export function setSavedGameMirror(fn: ((raw: string) => void) | null): void {
  mirror = fn;
}

/**
 * Ghi kèm thời điểm lưu để biết bản nào mới hơn (xem restoreSavedGame).
 * `game` null là dấu "đã xóa": không xóa hẳn, để một bản sao cũ hơn không làm sống lại lượt chơi đã kết thúc.
 */
function writeSavedGame(game: SavedGame | null): void {
  const raw = JSON.stringify({ savedAt: Date.now(), game });
  write(SAVED_GAME_KEY, raw);
  mirror?.(raw);
}

export function saveGame(game: SavedGame): void {
  writeSavedGame(game);
}

/** Xóa lượt chơi đang lưu (lượt chơi đã kết thúc và được ghi lên bảng xếp hạng). */
export function clearSavedGame(): void {
  writeSavedGame(null);
}

/** Thời điểm lưu của một bản lưu dạng chuỗi; không có hoặc hỏng thì -Infinity (cũ nhất). */
function savedAt(raw: string | null): number {
  try {
    const t = (JSON.parse(raw ?? 'null') as { savedAt?: unknown } | null)?.savedAt;
    return typeof t === 'number' && Number.isFinite(t) ? t : -Infinity;
  } catch {
    return -Infinity;
  }
}

/**
 * Lúc mở app: so bản sao `copy` (đọc lại từ chỗ ghi bản sao) với bản trong localStorage và giữ bản mới hơn ở cả hai nơi.
 * Trả về bản cần ghi lại vào chỗ bản sao, hoặc null nếu bản sao đã là bản mới nhất.
 */
export function restoreSavedGame(copy: string | null): string | null {
  const local = read(SAVED_GAME_KEY);
  if (savedAt(copy) > savedAt(local)) {
    write(SAVED_GAME_KEY, copy!);
    return null;
  }
  return savedAt(local) > savedAt(copy) ? local : null;
}
