import type { SoundSetId } from '../game/storage';
import type { AttackKind } from '../pvp/attacks';
import { bell, hz, jit, marimba, penta, woodTick, type Voices } from './voices';

/**
 * Ba bộ âm thanh người chơi chọn được: tiếng cho từng sự kiện, tiếng bị tấn công khi đấu online, và một bản nhạc nền.
 * Mọi con số lấy đúng theo bản mẫu đã duyệt (docs/superpowers/specs/2026-10-19-sound-audition.html), không chỉnh tai.
 * Ngẫu nhiên (độ lệch cao độ, tiếng xáo) dùng Math.random, không bao giờ dùng rng của bàn.
 */

export type SfxName = 'select' | 'deselect' | 'match' | 'wrong' | 'hint' | 'shuffle' | 'clear' | 'lose';

export const SFX_NAMES: readonly SfxName[] = ['select', 'deselect', 'match', 'wrong', 'hint', 'shuffle', 'clear', 'lose'];

/** Một vòng nhạc dài 8 ô nhịp, mỗi ô 16 nốt móc kép. */
export const LOOP_STEPS = 128;

export interface MusicDef {
  bpm: number;
  /** Phát nốt móc kép thứ `step` (0..LOOP_STEPS-1) lúc `t`, qua `out`; `sd` là độ dài một nốt móc kép (giây). */
  play(v: Voices, step: number, t: number, out: AudioNode, sd: number): void;
}

export interface SoundSet {
  id: SoundSetId;
  name: string;
  desc: string;
  /** `step` là bậc cao độ theo chuỗi, chỉ tiếng nối cặp dùng. */
  sfx: Record<SfxName, (v: Voices, t: number, step: number) => void>;
  hit: Record<AttackKind, (v: Voices, t: number) => void>;
  music: MusicDef;
}

/** Một nốt trong giai điệu: [nốt móc kép trong ô nhịp, số MIDI, độ dài tính bằng nốt móc kép]. */
type Note = [step: number, midi: number, len: number];

// ---------------- Gỗ & chuông: ấm, nhẹ, kiểu marimba ----------------

function woodShuffle(v: Voices, t: number): void {
  for (let i = 0; i < 7; i++) woodTick(v, t + i * 0.045, 900 + Math.random() * 700, 0.16);
  v.sweep({ t, from: 600, to: 3000, dur: 0.35, gain: 0.05 });
}

const WOOD_CHORDS = [
  [60, 64, 67, 71],
  [57, 60, 64, 67],
  [53, 57, 60, 64],
  [55, 59, 62, 64],
];
/** Chuông ở nửa sau vòng nhạc: [nốt móc kép, số MIDI]. */
const WOOD_BELLS: [number, number][][] = [
  [],
  [],
  [],
  [],
  [[0, 88], [6, 86], [8, 84]],
  [[0, 81], [8, 84], [12, 88]],
  [[0, 88], [6, 84], [8, 81]],
  [[0, 83], [4, 86], [8, 88], [12, 86]],
];
/** Hợp âm rải: nốt móc kép → chỉ số nốt trong hợp âm. */
const WOOD_ARP: Record<number, number> = { 0: 0, 3: 2, 6: 1, 8: 3, 11: 2, 14: 1 };

const WOOD: SoundSet = {
  id: 'wood',
  name: 'Gỗ & chuông',
  desc: 'Ấm, nhẹ, kiểu marimba',
  sfx: {
    select(v, t) {
      const j = jit();
      v.tone({ t, f: 1250 * j, to: 980 * j, glide: 0.04, gain: 0.32, attack: 0.001, dur: 0.06 });
      v.tone({ t, type: 'triangle', f: 2700 * j, gain: 0.07, attack: 0.001, dur: 0.02 });
      v.noise({ t, f: 3200, q: 1.5, gain: 0.1, dur: 0.012 });
    },
    deselect(v, t) {
      const j = jit();
      v.tone({ t, f: 880 * j, to: 700 * j, glide: 0.05, gain: 0.28, attack: 0.001, dur: 0.07 });
      v.noise({ t, f: 2200, q: 1.5, gain: 0.07, dur: 0.012 });
    },
    match(v, t, n) {
      marimba(v, t, penta(72, n), 0.32, 0.45);
      marimba(v, t + 0.075, penta(72, n + 2), 0.34, 0.6);
    },
    wrong(v, t) {
      v.tone({ t, type: 'triangle', f: 300, to: 170, glide: 0.12, gain: 0.32, attack: 0.002, dur: 0.14 });
      v.noise({ t, kind: 'lowpass', f: 800, q: 0.7, gain: 0.16, dur: 0.05 });
    },
    hint(v, t) {
      bell(v, t, 88, 0.13, 0.9);
      bell(v, t + 0.09, 95, 0.11, 1.1);
    },
    shuffle: woodShuffle,
    clear(v, t) {
      v.duck(t, 2);
      [72, 76, 79, 84].forEach((m, i) => marimba(v, t + i * 0.1, m, 0.3, 0.5));
      const c = t + 0.45;
      [72, 76, 79, 84, 88].forEach((m) => marimba(v, c, m, 0.14, 1.6));
      [96, 100].forEach((m, i) => v.tone({ t: c + 0.02 + i * 0.03, f: hz(m), gain: 0.04, attack: 0.01, dur: 1.4 }));
    },
    lose(v, t) {
      v.duck(t, 2);
      marimba(v, t, 67, 0.28, 0.6);
      marimba(v, t + 0.24, 63, 0.26, 0.6);
      marimba(v, t + 0.48, 60, 0.26, 1.3);
      marimba(v, t + 0.48, 48, 0.12, 1.3);
    },
  },
  hit: {
    stone(v, t) {
      v.tone({ t, type: 'triangle', f: 220, to: 90, glide: 0.15, gain: 0.4, attack: 0.002, dur: 0.18 });
      v.noise({ t, kind: 'lowpass', f: 1200, q: 0.7, gain: 0.25, dur: 0.08 });
      v.noise({ t: t + 0.02, f: 2500, q: 3, gain: 0.12, dur: 0.03 });
    },
    tilt(v, t) {
      for (let i = 0; i < 6; i++) woodTick(v, t + i * 0.035, 1500 - i * 150, 0.14);
      v.sweep({ t, from: 2200, to: 500, dur: 0.3, gain: 0.06 });
    },
    fog(v, t) {
      v.sweep({ t, from: 400, to: 1400, dur: 0.6, gain: 0.1, attack: 0.25 });
      v.tone({ t, f: 220, gain: 0.07, attack: 0.3, dur: 0.6 });
      v.tone({ t, f: 233, gain: 0.05, attack: 0.3, dur: 0.6 });
    },
    shuffle(v, t) {
      marimba(v, t, 76, 0.22, 0.3);
      marimba(v, t + 0.09, 70, 0.22, 0.4);
      woodShuffle(v, t + 0.2);
    },
  },
  // Marimba thong thả, chuông ở nửa sau
  music: {
    bpm: 88,
    play(v, s, t, out) {
      const bar = Math.floor(s / 16);
      const st = s % 16;
      const ch = WOOD_CHORDS[bar % 4];
      if (st === 0 || st === 10) marimba(v, t, ch[0] - 12, 0.1, 0.9, out);
      if (st in WOOD_ARP) marimba(v, t, ch[WOOD_ARP[st]] + 12, 0.055, 0.45, out);
      for (const [ms, m] of WOOD_BELLS[bar]) if (ms === st) bell(v, t, m, 0.045, 1.4, out);
      if (st % 4 === 2) v.noise({ t, kind: 'highpass', f: 7000, q: 0.7, gain: 0.012, attack: 0.005, dur: 0.05, out });
    },
  },
};

// ---------------- Bong bóng: pop vui nhộn ----------------

function bubbleShuffle(v: Voices, t: number): void {
  for (let i = 0; i < 8; i++) {
    const f = 300 + Math.random() * 600;
    v.tone({ t: t + i * 0.04, f, to: f * 1.8, glide: 0.03, gain: 0.14, attack: 0.003, dur: 0.05 });
  }
}

const BUBBLE_CHORDS = [
  [53, 57, 60, 64],
  [55, 59, 62, 67],
  [52, 55, 59, 62],
  [57, 60, 64, 69],
];
const BUBBLE_MELODY: Note[][] = [
  [[0, 72, 2], [2, 74, 2], [4, 76, 4], [10, 81, 2], [12, 79, 4]],
  [[0, 79, 2], [2, 76, 2], [4, 74, 4], [10, 74, 2], [12, 79, 4]],
  [[0, 76, 2], [2, 79, 2], [4, 83, 4], [10, 81, 2], [12, 79, 4]],
  [[0, 76, 6], [8, 72, 2], [10, 74, 2], [12, 76, 4]],
  [[0, 84, 2], [2, 81, 2], [4, 79, 4], [8, 77, 2], [10, 76, 2], [12, 72, 4]],
  [[0, 74, 2], [2, 79, 2], [4, 83, 4], [8, 86, 4], [12, 83, 4]],
  [[0, 83, 2], [2, 79, 2], [4, 76, 4], [8, 79, 2], [10, 76, 2], [12, 74, 4]],
  [[0, 72, 8], [12, 76, 2], [14, 79, 2]],
];

const BUBBLE: SoundSet = {
  id: 'bubble',
  name: 'Bong bóng',
  desc: 'Pop vui nhộn, hợp bộ trái cây và quái vật',
  sfx: {
    select(v, t) {
      const j = jit(0.05);
      v.tone({ t, f: 420 * j, to: 1150 * j, glide: 0.05, gain: 0.3, attack: 0.003, dur: 0.07 });
    },
    deselect(v, t) {
      const j = jit(0.05);
      v.tone({ t, f: 950 * j, to: 420 * j, glide: 0.06, gain: 0.26, attack: 0.003, dur: 0.08 });
    },
    match(v, t, n) {
      v.tone({ t, f: 500, to: 1700, glide: 0.035, gain: 0.28, attack: 0.002, dur: 0.05 });
      const a = hz(penta(79, n));
      const b = hz(penta(79, n + 2));
      v.tone({ t: t + 0.05, type: 'triangle', f: a, gain: 0.22, dur: 0.22 });
      v.tone({ t: t + 0.05, f: a * 2, gain: 0.05, dur: 0.15 });
      v.tone({ t: t + 0.12, type: 'triangle', f: b, gain: 0.24, dur: 0.32 });
      v.tone({ t: t + 0.12, f: b * 2, gain: 0.06, dur: 0.2 });
      v.noise({ t: t + 0.05, kind: 'highpass', f: 6000, q: 0.5, gain: 0.035, attack: 0.01, dur: 0.22 });
    },
    wrong(v, t) {
      v.tone({ t, type: 'triangle', f: 340, to: 210, glide: 0.09, gain: 0.26, dur: 0.1 });
      v.tone({ t: t + 0.11, type: 'triangle', f: 280, to: 160, glide: 0.12, gain: 0.26, dur: 0.14 });
    },
    hint(v, t) {
      for (let i = 0; i < 3; i++) {
        const f = 600 * (1 + i * 0.3);
        v.tone({ t: t + i * 0.06, f, to: f * 2, glide: 0.04, gain: 0.17, attack: 0.003, dur: 0.06 });
      }
      v.tone({ t: t + 0.2, type: 'triangle', f: hz(96), gain: 0.07, dur: 0.35 });
    },
    shuffle: bubbleShuffle,
    clear(v, t) {
      v.duck(t, 2);
      for (let i = 0; i < 6; i++) {
        const f = hz(penta(72, i));
        v.tone({ t: t + i * 0.07, f: f * 0.7, to: f, glide: 0.03, gain: 0.26, dur: 0.12 });
      }
      const s = t + 0.48;
      for (let i = 0; i < 8; i++) v.tone({ t: s + i * 0.045, type: 'triangle', f: hz(i % 2 ? 91 : 96), gain: 0.12 * (1 - i / 10), dur: 0.08 });
      [84, 88, 91].forEach((m) => v.tone({ t: s, type: 'triangle', f: hz(m), gain: 0.1, attack: 0.01, dur: 1.1 }));
      v.noise({ t: s, kind: 'highpass', f: 7000, q: 0.5, gain: 0.03, attack: 0.05, dur: 0.6 });
    },
    lose(v, t) {
      v.duck(t, 2.2);
      [67, 66, 65].forEach((m, i) =>
        v.tone({ t: t + i * 0.28, type: 'triangle', f: hz(m), to: hz(m) * 0.97, glide: 0.25, gain: 0.22, attack: 0.01, dur: 0.24 }),
      );
      v.tone({
        t: t + 0.84,
        type: 'triangle',
        f: hz(64),
        to: hz(64) * 0.94,
        glide: 0.8,
        gain: 0.22,
        attack: 0.01,
        hold: 0.3,
        dur: 0.5,
        vib: { rate: 6, depth: 9 },
      });
    },
  },
  hit: {
    stone(v, t) {
      v.tone({ t, f: 700, to: 200, glide: 0.08, gain: 0.35, attack: 0.002, dur: 0.12 });
      v.tone({ t, type: 'triangle', f: 160, gain: 0.2, attack: 0.002, dur: 0.1 });
      v.noise({ t, kind: 'lowpass', f: 900, q: 0.7, gain: 0.15, dur: 0.04 });
    },
    tilt(v, t) {
      v.tone({ t, f: 1400, to: 350, glide: 0.4, gain: 0.2, attack: 0.01, dur: 0.42 });
    },
    fog(v, t) {
      v.sweep({ t, from: 3000, to: 400, dur: 0.4, gain: 0.16, q: 0.8, attack: 0.01 });
      v.tone({ t: t + 0.05, f: 300, to: 180, glide: 0.2, gain: 0.15, dur: 0.22 });
    },
    shuffle(v, t) {
      v.tone({ t, f: 500, to: 250, glide: 0.08, gain: 0.25, dur: 0.1 });
      bubbleShuffle(v, t + 0.14);
    },
  },
  // Nảy, vui; bass "bụp" trượt lên
  music: {
    bpm: 112,
    play(v, s, t, out, sd) {
      const bar = Math.floor(s / 16);
      const st = s % 16;
      const ch = BUBBLE_CHORDS[bar % 4];
      if (st === 0 || st === 6 || st === 8) {
        const f = hz(ch[0]);
        v.tone({ t, f: f * 0.8, to: f, glide: 0.03, gain: 0.13, dur: 0.16, out });
        v.tone({ t, f: f * 2, gain: 0.04, dur: 0.1, out });
      }
      if (st === 4 || st === 12) for (const m of ch) v.tone({ t, type: 'triangle', f: hz(m + 12), gain: 0.025, dur: 0.09, out });
      for (const [ms, m, len] of BUBBLE_MELODY[bar]) {
        if (ms !== st) continue;
        const f = hz(m);
        v.tone({ t, type: 'triangle', f: f * 0.94, to: f, glide: 0.02, gain: 0.065, dur: len * sd * 0.9, out });
      }
      if (st % 2 === 0) v.noise({ t, kind: 'highpass', f: 8000, q: 0.7, gain: st % 4 === 2 ? 0.014 : 0.008, attack: 0.002, dur: 0.03, out });
      if (st === 4 || st === 12) v.noise({ t, f: 1500, q: 1.2, gain: 0.035, attack: 0.002, dur: 0.05, out });
    },
  },
};

// ---------------- 8-bit: máy game cổ ----------------

function chipShuffle(v: Voices, t: number): void {
  for (let i = 0; i < 8; i++) {
    const f = hz(penta(72, Math.floor(Math.random() * 8)));
    v.tone({ t: t + i * 0.03, type: 'pulse', f, gain: 0.08, attack: 0.001, hold: 0.02, dur: 0.008 });
  }
  v.noise({ t, kind: 'highpass', f: 3000, q: 0.7, gain: 0.05, attack: 0.001, dur: 0.24 });
}

/** Chuỗi nốt sóng xung nối nhau: [số MIDI, độ dài (giây)]; nốt cuối ngân thêm `tail` giây. */
function chipRun(v: Voices, t: number, seq: [number, number][], gain: number, tail: number): void {
  let x = t;
  seq.forEach(([m, d], i) => {
    const last = i === seq.length - 1;
    v.tone({ t: x, type: 'pulse', f: hz(m), gain, attack: 0.001, hold: d * 0.8, dur: d * 0.2 + (last ? tail : 0) });
    x += d;
  });
}

const CHIP_ARPS = [
  [69, 72, 76],
  [65, 69, 72],
  [67, 72, 76],
  [67, 71, 74],
];
const CHIP_BASS = [57, 53, 60, 55];
const CHIP_MELODY: Note[][] = [
  [[0, 76, 3], [3, 74, 1], [4, 72, 2], [6, 69, 2], [8, 72, 4], [12, 76, 4]],
  [[0, 77, 3], [3, 76, 1], [4, 74, 2], [6, 72, 2], [8, 69, 6], [14, 72, 2]],
  [[0, 79, 3], [3, 77, 1], [4, 76, 2], [6, 72, 2], [8, 76, 4], [12, 79, 4]],
  [[0, 74, 6], [6, 76, 2], [8, 79, 2], [10, 83, 2], [12, 81, 4]],
  [[0, 81, 3], [3, 79, 1], [4, 76, 4], [8, 72, 2], [10, 76, 2], [12, 81, 4]],
  [[0, 84, 4], [4, 81, 2], [6, 77, 2], [8, 81, 4], [12, 77, 4]],
  [[0, 79, 2], [2, 76, 2], [4, 72, 2], [6, 76, 2], [8, 79, 4], [12, 84, 4]],
  [[0, 83, 4], [4, 79, 4], [8, 74, 4], [12, 71, 4]],
];

const CHIP: SoundSet = {
  id: 'chip',
  name: '8-bit',
  desc: 'Máy game cổ, hợp bộ Tuxemon',
  sfx: {
    select(v, t) {
      v.tone({ t, type: 'pulse', f: 1320, gain: 0.1, attack: 0.001, hold: 0.025, dur: 0.02 });
    },
    deselect(v, t) {
      v.tone({ t, type: 'pulse', f: 880, gain: 0.1, attack: 0.001, hold: 0.025, dur: 0.02 });
    },
    match(v, t, n) {
      const m = penta(76, n);
      [0, 4, 7, 12].forEach((d, i) => {
        const last = i === 3;
        v.tone({ t: t + i * 0.04, type: 'pulse', f: hz(m + d), gain: 0.1, attack: 0.001, hold: last ? 0.08 : 0.03, dur: last ? 0.12 : 0.01 });
      });
    },
    wrong(v, t) {
      v.tone({ t, type: 'square', f: 196, gain: 0.08, attack: 0.001, hold: 0.06, dur: 0.02 });
      v.tone({ t: t + 0.09, type: 'square', f: 147, gain: 0.08, attack: 0.001, hold: 0.1, dur: 0.04 });
    },
    hint(v, t) {
      [88, 95, 88, 95].forEach((m, i) =>
        v.tone({ t: t + i * 0.06, type: 'pulse', f: hz(m), gain: 0.07 * (1 - i * 0.18), attack: 0.001, hold: 0.035, dur: 0.01 }),
      );
    },
    shuffle: chipShuffle,
    clear(v, t) {
      v.duck(t, 1.8);
      chipRun(v, t, [[72, 0.09], [76, 0.09], [79, 0.09], [84, 0.18], [79, 0.09], [84, 0.5]], 0.1, 0.25);
      v.tone({ t: t + 0.54, type: 'pulse', f: hz(88), gain: 0.06, attack: 0.001, hold: 0.4, dur: 0.25 });
      v.tone({ t, type: 'triangle', f: hz(48), gain: 0.18, attack: 0.001, hold: 0.25, dur: 0.02 });
      v.tone({ t: t + 0.27, type: 'triangle', f: hz(55), gain: 0.18, attack: 0.001, hold: 0.25, dur: 0.02 });
      v.tone({ t: t + 0.54, type: 'triangle', f: hz(60), gain: 0.2, attack: 0.001, hold: 0.4, dur: 0.25 });
    },
    lose(v, t) {
      v.duck(t, 2);
      chipRun(v, t, [[72, 0.13], [67, 0.13], [63, 0.13], [62, 0.13], [60, 0.6]], 0.09, 0.3);
      v.tone({ t: t + 0.52, type: 'triangle', f: hz(48), gain: 0.18, attack: 0.001, hold: 0.5, dur: 0.3 });
    },
  },
  hit: {
    stone(v, t) {
      v.noise({ t, kind: 'lowpass', f: 900, q: 0.7, gain: 0.28, attack: 0.001, dur: 0.16 });
      v.tone({ t, type: 'square', f: 110, to: 55, glide: 0.15, gain: 0.08, attack: 0.001, dur: 0.15 });
    },
    tilt(v, t) {
      for (let i = 0; i < 8; i++)
        v.tone({ t: t + i * 0.035, type: 'pulse', f: 1200 * Math.pow(0.84, i), gain: 0.08, attack: 0.001, hold: 0.025, dur: 0.008 });
    },
    fog(v, t) {
      v.tone({ t, type: 'pulse', f: 330, gain: 0.07, attack: 0.01, hold: 0.35, dur: 0.15, vib: { rate: 14, depth: 40 } });
      v.noise({ t, f: 1200, q: 0.8, gain: 0.05, attack: 0.05, dur: 0.4 });
    },
    shuffle(v, t) {
      [988, 784, 988, 784].forEach((f, i) =>
        v.tone({ t: t + i * 0.06, type: 'pulse', f, gain: 0.07, attack: 0.001, hold: 0.04, dur: 0.01 }),
      );
      chipShuffle(v, t + 0.26);
    },
  },
  // Bass tam giác, hợp âm rải nhanh, giai điệu sóng xung
  music: {
    bpm: 120,
    play(v, s, t, out, sd) {
      const bar = Math.floor(s / 16);
      const st = s % 16;
      const i = bar % 4;
      if (st % 2 === 0)
        v.tone({ t, type: 'triangle', f: hz(CHIP_BASS[i] - 12 + (st % 4 === 2 ? 12 : 0)), gain: 0.16, attack: 0.001, hold: sd * 1.4, dur: 0.02, out });
      v.tone({ t, type: 'pulse12', f: hz(CHIP_ARPS[i][st % 3]), gain: 0.022, attack: 0.001, hold: sd * 0.6, dur: 0.01, out });
      for (const [ms, m, len] of CHIP_MELODY[bar]) {
        if (ms === st) v.tone({ t, type: 'pulse', f: hz(m), gain: 0.05, attack: 0.002, hold: len * sd * 0.75, dur: len * sd * 0.2, out });
      }
      if (st % 2 === 0) v.noise({ t, kind: 'highpass', f: 7000, q: 0.7, gain: 0.02, attack: 0.001, dur: 0.02, out });
      if (st === 4 || st === 12) v.noise({ t, f: 1800, q: 0.8, gain: 0.06, attack: 0.001, dur: 0.08, out });
      if (st === 0 || st === 8 || st === 10) v.tone({ t, f: 180, to: 50, glide: 0.07, gain: 0.2, attack: 0.001, dur: 0.08, out });
    },
  },
};

export const SOUND_SETS: Record<SoundSetId, SoundSet> = { wood: WOOD, bubble: BUBBLE, chip: CHIP };
