/**
 * Các "giọng" cơ bản để tạo âm thanh, tách khỏi Web Audio để các bộ âm thanh (sets.ts) test được trong Node:
 * synth.ts hiện thực Voices bằng Web Audio, còn test dùng bản giả ghi lại các lời gọi.
 * Tham số mặc định và các nhạc cụ ghép (marimba, chuông, tiếng gõ gỗ) lấy đúng theo bản mẫu đã duyệt
 * (docs/superpowers/specs/2026-10-19-sound-audition.html).
 */

/** Dạng sóng: của Web Audio, hoặc sóng xung 25% / 12,5% cho tiếng 8-bit. */
export type Wave = OscillatorType | 'pulse' | 'pulse12';

/**
 * Một nốt: bắt đầu lúc `t` (giây, theo đồng hồ của AudioContext), tần số `f`, trượt tới `to` trong `glide` giây.
 * Âm lượng lên tới `gain` trong `attack`, giữ `hold`, rồi tắt dần trong `dur`. `vib` là rung (Hz, độ lệch Hz).
 * Mặc định: sine, gain 0.3, attack 0.002, hold 0, dur 0.2. `out` bỏ trống thì đi đường hiệu ứng.
 */
export interface ToneOpts {
  t: number;
  f: number;
  to?: number;
  glide?: number;
  type?: Wave;
  gain?: number;
  attack?: number;
  hold?: number;
  dur?: number;
  vib?: { rate: number; depth: number };
  out?: AudioNode;
}

/** Tiếng nhiễu qua một bộ lọc. Mặc định: bandpass 2000 Hz, q 1, gain 0.1, attack 0.001, dur 0.05. */
export interface NoiseOpts {
  t: number;
  f?: number;
  q?: number;
  kind?: BiquadFilterType;
  gain?: number;
  attack?: number;
  dur?: number;
  out?: AudioNode;
}

/** Tiếng gió: nhiễu qua bộ lọc quét từ `from` tới `to`. Mặc định: gain 0.1, q 1.2, attack 0.02. */
export interface SweepOpts {
  t: number;
  from: number;
  to: number;
  dur: number;
  gain?: number;
  q?: number;
  attack?: number;
  out?: AudioNode;
}

export interface Voices {
  tone(o: ToneOpts): void;
  noise(o: NoiseOpts): void;
  sweep(o: SweepOpts): void;
  /** Nhạc nền nhỏ lại trong `len` giây kể từ `t`, cho tiếng kết thúc màn nổi lên. */
  duck(t: number, len: number): void;
}

/** Tần số của nốt có số MIDI `m` (69 là La 440 Hz). */
export function hz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

const PENTA = [0, 2, 4, 7, 9];

/** Bậc thứ `n` của gam ngũ cung tính từ nốt `base` (số MIDI). */
export function penta(base: number, n: number): number {
  return base + 12 * Math.floor(n / 5) + PENTA[n % 5];
}

/** Hệ số lệch cao độ ngẫu nhiên tối đa ±k, để tiếng nghe nhiều lần không bị nhàm. Không dùng rng của bàn. */
export function jit(k = 0.03): number {
  return 1 + (Math.random() * 2 - 1) * k;
}

export function marimba(v: Voices, t: number, m: number, gain = 0.3, dur = 0.5, out?: AudioNode): void {
  const f = hz(m);
  v.tone({ t, f, gain, attack: 0.002, dur, out });
  v.tone({ t, f: f * 4, gain: gain * 0.22, attack: 0.001, dur: dur * 0.18, out });
  v.tone({ t, f: f * 9.9, gain: gain * 0.06, attack: 0.001, dur: 0.03, out });
}

export function bell(v: Voices, t: number, m: number, gain = 0.1, dur = 1, out?: AudioNode): void {
  const f = hz(m);
  v.tone({ t, f, gain, attack: 0.004, dur, out });
  v.tone({ t, f: f * 2.76, gain: gain * 0.3, attack: 0.002, dur: dur * 0.4, out });
  v.tone({ t, f: f * 5.4, gain: gain * 0.12, attack: 0.001, dur: dur * 0.15, out });
}

/** Tiếng gõ gỗ ngắn: một nốt trượt xuống kèm tiếng lách cách. */
export function woodTick(v: Voices, t: number, f: number, gain = 0.2): void {
  v.tone({ t, f, to: f * 0.8, glide: 0.03, gain, attack: 0.001, dur: 0.04 });
  v.noise({ t, f: f * 2.5, q: 1.5, gain: gain * 0.3, dur: 0.01 });
}
