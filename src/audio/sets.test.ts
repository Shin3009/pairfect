import { describe, expect, it } from 'vitest';
import { SOUND_SET_IDS } from '../game/storage';
import { ATTACK_KINDS } from '../pvp/attacks';
import { FakeVoices, type VoiceCall } from '../test/fakeVoices';
import { LOOP_STEPS, SFX_NAMES, SOUND_SETS, type MusicDef } from './sets';

const T0 = 10;

/** Mọi nốt bắt đầu từ `t0`, tần số hữu hạn và dương, âm lượng trong (0, 1]. */
function expectValid(calls: VoiceCall[], t0: number): void {
  const sounds = calls.filter((c) => c.kind !== 'duck');
  expect(sounds.length).toBeGreaterThan(0);
  for (const c of sounds) {
    expect(c.t).toBeGreaterThanOrEqual(t0);
    for (const f of [c.f, c.to, c.from]) {
      if (f === undefined) continue;
      expect(Number.isFinite(f)).toBe(true);
      expect(f).toBeGreaterThan(0);
    }
    expect(c.gain).toBeGreaterThan(0);
    expect(c.gain).toBeLessThanOrEqual(1);
  }
}

const ducks = (calls: VoiceCall[]) => calls.filter((c) => c.kind === 'duck').length;

describe('các bộ âm thanh', () => {
  it('có đủ ba bộ', () => {
    expect(Object.keys(SOUND_SETS)).toEqual([...SOUND_SET_IDS]);
    for (const id of SOUND_SET_IDS) {
      const s = SOUND_SETS[id];
      expect(s.id).toBe(id);
      expect(s.name).not.toBe('');
      expect(s.desc).not.toBe('');
    }
  });

  it('mỗi tiếng của mỗi bộ phát ra âm hợp lệ', () => {
    for (const id of SOUND_SET_IDS)
      for (const name of SFX_NAMES) {
        const v = new FakeVoices();
        SOUND_SETS[id].sfx[name](v, T0, 0);
        expectValid(v.calls, T0);
      }
  });

  it('chỉ qua màn và thua mới hạ nhạc', () => {
    for (const id of SOUND_SET_IDS)
      for (const name of SFX_NAMES) {
        const v = new FakeVoices();
        SOUND_SETS[id].sfx[name](v, T0, 0);
        expect(ducks(v.calls)).toBe(name === 'clear' || name === 'lose' ? 1 : 0);
      }
  });

  it('mỗi đòn của mỗi bộ phát ra âm hợp lệ', () => {
    for (const id of SOUND_SET_IDS)
      for (const kind of ATTACK_KINDS) {
        const v = new FakeVoices();
        SOUND_SETS[id].hit[kind](v, T0);
        expectValid(v.calls, T0);
        expect(ducks(v.calls)).toBe(0);
      }
  });

  it('nốt nối cặp cao dần theo bậc chuỗi', () => {
    for (const id of SOUND_SET_IDS) {
      const tops = [0, 1, 2, 3, 4, 5, 6, 7].map((step) => {
        const v = new FakeVoices();
        SOUND_SETS[id].sfx.match(v, T0, step);
        return Math.max(...v.calls.filter((c) => c.kind === 'tone').map((c) => c.f!));
      });
      for (let i = 1; i < tops.length; i++) expect(tops[i]).toBeGreaterThan(tops[i - 1]);
    }
  });

  it('có đủ 15 tiếng', () => {
    expect(SFX_NAMES).toEqual([
      'select',
      'deselect',
      'match',
      'wrong',
      'hint',
      'shuffle',
      'clear',
      'lose',
      'tap',
      'count',
      'go',
      'warn',
      'tick',
      'crack',
      'launch',
    ]);
  });

  it('đòn đảo bàn: tiếng xáo bắt đầu đúng ở shuffleHitRattle', () => {
    for (const id of SOUND_SET_IDS) {
      const set = SOUND_SETS[id];
      const hit = new FakeVoices();
      set.hit.shuffle(hit, T0);
      const shuffle = new FakeVoices();
      set.sfx.shuffle(shuffle, T0, 0);
      // Phần sau tiếng báo của đòn chính là tiếng xáo, dời đi shuffleHitRattle giây
      const rattle = hit.calls.filter((c) => c.t >= T0 + set.shuffleHitRattle - 1e-9);
      expect(rattle).toHaveLength(shuffle.calls.length);
      expect(Math.min(...rattle.map((c) => c.t))).toBeCloseTo(T0 + set.shuffleHitRattle);
    }
  });

  it('tiếng tích gấp cũng hợp lệ', () => {
    for (const id of SOUND_SET_IDS) {
      const v = new FakeVoices();
      SOUND_SETS[id].sfx.tick(v, T0, 1);
      expectValid(v.calls, T0);
      expect(ducks(v.calls)).toBe(0);
    }
  });

  it('nhạc đủ 8 ô nhịp và chỉ đi qua đầu ra nhạc', () => {
    expect(LOOP_STEPS).toBe(128);
    for (const id of SOUND_SET_IDS) expectLoop(SOUND_SETS[id].music);
  });

  it('nhạc menu đủ 8 ô nhịp và chỉ đi qua đầu ra nhạc', () => {
    for (const id of SOUND_SET_IDS) expectLoop(SOUND_SETS[id].menuMusic);
  });
});

/** Mỗi ô nhịp của vòng nhạc có nốt hợp lệ, mọi nốt đi qua đầu ra nhạc được truyền vào, không hạ nhạc. */
function expectLoop(music: MusicDef): void {
  const OUT = {} as AudioNode;
  const sd = 60 / music.bpm / 4;
  for (let bar = 0; bar < LOOP_STEPS / 16; bar++) {
    const v = new FakeVoices();
    for (let step = bar * 16; step < (bar + 1) * 16; step++) music.play(v, step, step * sd, OUT, sd);
    expectValid(v.calls, bar * 16 * sd);
    expect(v.calls.every((c) => c.out === OUT)).toBe(true);
    expect(ducks(v.calls)).toBe(0);
  }
}
