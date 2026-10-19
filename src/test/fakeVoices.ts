import type { NoiseOpts, SweepOpts, ToneOpts, Voices } from '../audio/voices';

/** Một lời gọi tới Voices, đã áp mặc định cho gain (xem voices.ts). */
export interface VoiceCall {
  kind: 'tone' | 'noise' | 'sweep' | 'duck';
  t: number;
  f?: number;
  to?: number;
  from?: number;
  gain?: number;
  out?: unknown;
}

/** Voices giả cho các test: không phát gì, chỉ ghi lại các lời gọi. */
export class FakeVoices implements Voices {
  calls: VoiceCall[] = [];

  tone(o: ToneOpts): void {
    this.calls.push({ kind: 'tone', t: o.t, f: o.f, to: o.to, gain: o.gain ?? 0.3, out: o.out });
  }

  noise(o: NoiseOpts): void {
    this.calls.push({ kind: 'noise', t: o.t, f: o.f ?? 2000, gain: o.gain ?? 0.1, out: o.out });
  }

  sweep(o: SweepOpts): void {
    this.calls.push({ kind: 'sweep', t: o.t, from: o.from, to: o.to, gain: o.gain ?? 0.1, out: o.out });
  }

  duck(t: number): void {
    this.calls.push({ kind: 'duck', t });
  }
}
