import { describe, expect, it } from 'vitest';
import { FakeVoices } from '../test/fakeVoices';
import { bell, hz, jit, marimba, penta, woodTick } from './voices';

describe('cao độ', () => {
  it('hz đổi số MIDI ra tần số', () => {
    expect(hz(69)).toBe(440);
    expect(hz(81)).toBe(880);
  });

  it('penta đi theo gam ngũ cung, sang quãng tám sau 5 bậc', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => penta(72, n))).toEqual([72, 74, 76, 79, 81, 84, 86]);
  });

  it('jit lệch tối đa 3%', () => {
    for (let i = 0; i < 200; i++) {
      const j = jit();
      expect(j).toBeGreaterThanOrEqual(0.97);
      expect(j).toBeLessThanOrEqual(1.03);
    }
  });
});

describe('nhạc cụ', () => {
  it('marimba: âm gốc và hai họa âm, cùng lúc', () => {
    const v = new FakeVoices();
    marimba(v, 1, 72);
    expect(v.calls.map((c) => c.kind)).toEqual(['tone', 'tone', 'tone']);
    expect(v.calls.map((c) => c.f)).toEqual([hz(72), hz(72) * 4, hz(72) * 9.9]);
    expect(v.calls.map((c) => c.gain)).toEqual([0.3, 0.3 * 0.22, 0.3 * 0.06]);
    expect(v.calls.every((c) => c.t === 1)).toBe(true);
  });

  it('bell: âm gốc và hai họa âm lệch', () => {
    const v = new FakeVoices();
    bell(v, 1, 88, 0.1, 1);
    expect(v.calls.map((c) => c.kind)).toEqual(['tone', 'tone', 'tone']);
    expect(v.calls.map((c) => c.f)).toEqual([hz(88), hz(88) * 2.76, hz(88) * 5.4]);
  });

  it('woodTick: một tiếng gõ trượt xuống và một tiếng lách cách', () => {
    const v = new FakeVoices();
    woodTick(v, 1, 1000, 0.2);
    expect(v.calls).toHaveLength(2);
    expect(v.calls[0]).toMatchObject({ kind: 'tone', f: 1000, to: 800 });
    expect(v.calls[1]).toMatchObject({ kind: 'noise', f: 2500 });
    expect(v.calls[1].gain).toBeCloseTo(0.06);
  });
});
