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
