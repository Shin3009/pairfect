import type { SoundSetId } from '../game/storage';
import { LOOP_STEPS, SOUND_SETS } from './sets';
import type { Voices } from './voices';

/** Xếp lịch trước chừng này giây theo đồng hồ âm thanh (đủ để bộ hẹn giờ trễ một chút không làm nhạc hụt). */
export const LOOKAHEAD = 0.15;
/** Nốt đầu tiên (và nốt đầu sau một lần lỡ nhịp) bắt đầu sau chừng này giây. */
export const START_DELAY = 0.05;
export const FADE_IN = 0.6;
export const FADE_OUT = 0.4;

/** Đường ra riêng của một lần phát nhạc: tăng dần lúc bắt đầu, giảm dần rồi tự gỡ lúc dừng. */
export interface MusicOutput {
  node: AudioNode;
  fadeIn(t: number, secs: number): void;
  fadeOut(t: number, secs: number): void;
}

export interface MusicHost {
  /** Giờ hiện tại theo đồng hồ âm thanh (giây). */
  now(): number;
  voices: Voices;
  createOutput(): MusicOutput;
}

interface Playing {
  set: SoundSetId;
  out: MusicOutput;
  /** Nốt móc kép kế tiếp và lúc phát nó. */
  step: number;
  next: number;
}

/**
 * Phát nhạc nền của một bộ âm thanh, lặp mãi. Không tự hẹn giờ: người dùng gọi pump() đều đặn (sound.ts gọi mỗi 40 ms),
 * mỗi lần xếp lịch các nốt trong LOOKAHEAD giây tới. Lỡ nhịp (trang bị ẩn, máy bận) thì bỏ qua phần đã lỡ chứ không phát dồn.
 */
export class MusicPlayer {
  private playing: Playing | null = null;

  constructor(private readonly host: MusicHost) {}

  get current(): SoundSetId | null {
    return this.playing?.set ?? null;
  }

  /** Phát nhạc của bộ `set`, hoặc im nếu null. Bộ đang phát thì không làm gì, nên nhạc không bị phát lại từ đầu. */
  play(set: SoundSetId | null): void {
    if (set === this.current) return;
    const now = this.host.now();
    this.playing?.out.fadeOut(now, FADE_OUT);
    this.playing = null;
    if (!set) return;
    const out = this.host.createOutput();
    const start = now + START_DELAY;
    out.fadeIn(start, FADE_IN);
    this.playing = { set, out, step: 0, next: start };
    this.pump();
  }

  pump(): void {
    const p = this.playing;
    if (!p) return;
    const now = this.host.now();
    const { music } = SOUND_SETS[p.set];
    const sd = 60 / music.bpm / 4;
    if (p.next < now) p.next = now + START_DELAY;
    while (p.next < now + LOOKAHEAD) {
      music.play(this.host.voices, p.step % LOOP_STEPS, p.next, p.out.node, sd);
      p.next += sd;
      p.step++;
    }
  }
}
