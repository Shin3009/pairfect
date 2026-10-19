import { COMBO_MS } from '../pvp/attacks';

/**
 * Độ dài chuỗi sau một lần ăn cặp lúc `now` (ms), khi lần trước lúc `lastAt` và chuỗi đang dài `combo`.
 * Cùng luật với chuỗi khi đấu online (Side.match): cách nhau tối đa COMBO_MS thì nối chuỗi.
 */
export function nextCombo(lastAt: number | null, now: number, combo: number): number {
  return lastAt !== null && now - lastAt <= COMBO_MS ? combo + 1 : 1;
}

/** Bậc cao độ của tiếng nối cặp theo độ dài chuỗi: cặp đầu là bậc 0, cao nhất bậc 7. */
export function pitchStep(combo: number): number {
  return Math.min(Math.max(combo - 1, 0), 7);
}

/** Thời gian còn lại từ tỉ lệ này của thời gian màn trở xuống thì thanh giờ chuyển đỏ và có tiếng báo. */
export const LOW_TIME_RATIO = 0.25;
/** Tiếng tích trong chừng này giây cuối; từ URGENT_SECONDS trở xuống là tiếng tích gấp. */
const TICK_SECONDS = 10;
const URGENT_SECONDS = 3;

/** Tiếng báo giờ cho một bước đồng hồ: thanh giờ vừa chuyển đỏ, và tiếng tích (nếu có). */
export interface TimeCue {
  warn: boolean;
  tick: 'normal' | 'urgent' | null;
}

/**
 * Tiếng báo khi thời gian còn lại đi từ `prev` tới `left` (giây) trong màn dài `total` giây.
 * Thanh giờ chuyển đỏ: báo một lần (`warned` là đã báo trong màn này). Tiếng tích: mỗi khi số giây còn lại (làm tròn lên)
 * giảm xuống một giá trị từ 10 tới 1; thưởng giờ làm số giây tăng lại thì không kêu, máy bận làm nhảy nhiều giây thì một tiếng.
 */
export function timeCues(prev: number, left: number, total: number, warned: boolean): TimeCue {
  const low = total * LOW_TIME_RATIO;
  const s = Math.ceil(left);
  const tick = s < Math.ceil(prev) && s >= 1 && s <= TICK_SECONDS ? (s <= URGENT_SECONDS ? 'urgent' : 'normal') : null;
  return { warn: !warned && prev > low && left <= low, tick };
}

/** Hiệu ứng và nhạc nền có bật không. */
export interface SoundSwitches {
  sfx: boolean;
  music: boolean;
}

export function audible(s: SoundSwitches): boolean {
  return s.sfx || s.music;
}

/**
 * Nút loa trong màn chơi: đang có tiếng thì tắt hết và nhớ trạng thái cũ; đang tắt hết thì trả lại trạng thái đã nhớ,
 * không nhớ gì thì bật cả hai.
 */
export function muteToggled(
  s: SoundSwitches,
  remembered: SoundSwitches | null,
): { next: SoundSwitches; remembered: SoundSwitches | null } {
  if (audible(s)) return { next: { sfx: false, music: false }, remembered: { sfx: s.sfx, music: s.music } };
  const next = remembered && audible(remembered) ? { sfx: remembered.sfx, music: remembered.music } : { sfx: true, music: true };
  return { next, remembered: null };
}
