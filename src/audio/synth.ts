import type { MusicOutput } from './music';
import type { NoiseOpts, SweepOpts, ToneOpts, Voices } from './voices';

/** Mức trộn: hiệu ứng và nhạc nền, như bản mẫu đã duyệt. */
const SFX_LEVEL = 0.9;
const MUSIC_LEVEL = 0.5;
/** Nhạc nền nhỏ lại còn chừng này khi phát tiếng qua màn / thua. */
const DUCK_LEVEL = 0.2;

/**
 * Hiện thực Voices bằng Web Audio. Đồ thị:
 * hiệu ứng → master; nhạc: (đầu ra của từng lần phát) → nút hạ nhạc → đường nhạc → master; master → bộ nén → destination.
 */
export class Synth implements Voices {
  private readonly sfx: GainNode;
  private readonly duckNode: GainNode;
  private readonly noiseBuf: AudioBuffer;
  private readonly pulse: PeriodicWave;
  private readonly pulse12: PeriodicWave;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
  ) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 6;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.1;
    comp.connect(destination);
    const master = ctx.createGain();
    master.connect(comp);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = SFX_LEVEL;
    this.sfx.connect(master);
    const musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_LEVEL;
    musicBus.connect(master);
    this.duckNode = ctx.createGain();
    this.duckNode.connect(musicBus);

    const len = Math.floor(ctx.sampleRate * 0.5);
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.pulse = this.pulseWave(0.25);
    this.pulse12 = this.pulseWave(0.125);
  }

  tone({ t, f, to, glide, type = 'sine', gain = 0.3, attack = 0.002, hold = 0, dur = 0.2, vib, out }: ToneOpts): void {
    const end = t + attack + hold + dur + 0.05;
    const o = this.ctx.createOscillator();
    if (type === 'pulse' || type === 'pulse12') o.setPeriodicWave(type === 'pulse' ? this.pulse : this.pulse12);
    else o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + (glide ?? dur));
    if (vib) {
      const l = this.ctx.createOscillator();
      const lg = this.ctx.createGain();
      l.frequency.value = vib.rate;
      lg.gain.value = vib.depth;
      l.connect(lg);
      lg.connect(o.frequency);
      l.start(t);
      l.stop(end);
    }
    const g = this.env(t, gain, attack, hold, dur, out);
    o.connect(g);
    o.onended = () => g.disconnect();
    o.start(t);
    o.stop(end);
  }

  noise({ t, f = 2000, q = 1, kind = 'bandpass', gain = 0.1, attack = 0.001, dur = 0.05, out }: NoiseOpts): void {
    const fl = this.ctx.createBiquadFilter();
    fl.type = kind;
    fl.frequency.value = f;
    fl.Q.value = q;
    this.playNoise(t, fl, this.env(t, gain, attack, 0, dur, out), attack + dur);
  }

  sweep({ t, from, to, dur, gain = 0.1, q = 1.2, attack = 0.02, out }: SweepOpts): void {
    const fl = this.ctx.createBiquadFilter();
    fl.type = 'bandpass';
    fl.Q.value = q;
    fl.frequency.setValueAtTime(from, t);
    fl.frequency.exponentialRampToValueAtTime(to, t + attack + dur);
    this.playNoise(t, fl, this.env(t, gain, attack, 0, dur, out), attack + dur);
  }

  duck(t: number, len: number): void {
    const g = this.duckNode.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(DUCK_LEVEL, t, 0.05);
    g.setTargetAtTime(1, t + len, 0.4);
  }

  /** Đường ra cho một lần phát nhạc, nối vào nút hạ nhạc; tắt dần xong thì tự gỡ. */
  musicOutput(): MusicOutput {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    g.connect(this.duckNode);
    return {
      node: g,
      fadeIn: (t, secs) => {
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(1, t + secs);
      },
      fadeOut: (t, secs) => {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + secs);
        window.setTimeout(() => g.disconnect(), (secs + 3) * 1000);
      },
    };
  }

  /** Vỏ âm lượng: lên tới `gain` trong `attack`, giữ `hold`, tắt dần trong `dur`. */
  private env(t: number, gain: number, attack: number, hold: number, dur: number, out?: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    if (hold) g.gain.setValueAtTime(gain, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + dur);
    g.connect(out ?? this.sfx);
    return g;
  }

  /** Phát bộ đệm nhiễu (lặp, bắt đầu ở chỗ ngẫu nhiên) qua bộ lọc `fl` vào vỏ `g` trong `len` giây. */
  private playNoise(t: number, fl: BiquadFilterNode, g: GainNode, len: number): void {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.connect(fl);
    fl.connect(g);
    s.onended = () => g.disconnect();
    s.start(t, Math.random() * 0.3);
    s.stop(t + len + 0.05);
  }

  /** Sóng xung có độ rộng `duty`, cho tiếng 8-bit. */
  private pulseWave(duty: number): PeriodicWave {
    const n = 40;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let i = 1; i < n; i++) real[i] = Math.sin(i * Math.PI * duty) / i;
    return this.ctx.createPeriodicWave(real, imag);
  }
}
