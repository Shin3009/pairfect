import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeVoices } from '../test/fakeVoices';
import { LOOKAHEAD, MusicPlayer, START_DELAY, type MusicOutput } from './music';
import { SOUND_SETS } from './sets';

/** Đồng hồ chỉnh tay, Voices giả, và các đầu ra nhạc giả đếm số lần tăng / giảm dần. */
function setup() {
  const clock = { now: 0 };
  const voices = new FakeVoices();
  const outputs: (MusicOutput & { fadeIn: ReturnType<typeof vi.fn>; fadeOut: ReturnType<typeof vi.fn> })[] = [];
  const player = new MusicPlayer({
    now: () => clock.now,
    voices,
    createOutput: () => {
      const o = { node: {} as AudioNode, fadeIn: vi.fn(), fadeOut: vi.fn() };
      outputs.push(o);
      return o;
    },
  });
  return { clock, voices, outputs, player };
}

afterEach(() => vi.restoreAllMocks());

describe('MusicPlayer', () => {
  it('cùng bộ hai lần chỉ tạo một đầu ra', () => {
    const { outputs, player } = setup();
    player.play('wood');
    player.play('wood');
    expect(outputs).toHaveLength(1);
    expect(outputs[0].fadeIn).toHaveBeenCalledTimes(1);
    expect(player.current).toBe('wood');
  });

  it('đổi bộ thì tắt dần đầu ra cũ', () => {
    const { outputs, player } = setup();
    player.play('wood');
    player.play('chip');
    expect(outputs).toHaveLength(2);
    expect(outputs[0].fadeOut).toHaveBeenCalledTimes(1);
    expect(outputs[1].fadeOut).not.toHaveBeenCalled();
    expect(player.current).toBe('chip');
  });

  it('play(null) thì tắt dần và im', () => {
    const { clock, voices, outputs, player } = setup();
    player.play('bubble');
    player.play(null);
    expect(outputs[0].fadeOut).toHaveBeenCalledTimes(1);
    expect(player.current).toBeNull();
    const before = voices.calls.length;
    clock.now = 5;
    player.pump();
    expect(voices.calls.length).toBe(before);
  });

  it('xếp lịch tới đúng tầm nhìn trước', () => {
    const { clock, voices, player } = setup();
    // Nhạc 8-bit có nốt ở mọi nốt móc kép (hợp âm rải), nên lần pump nào cũng thêm lời gọi
    player.play('chip');
    expect(voices.calls.length).toBeGreaterThan(0);
    expect(voices.calls.every((c) => c.t < LOOKAHEAD + 1e-9)).toBe(true);
    const before = voices.calls.length;
    clock.now = 1;
    player.pump();
    const added = voices.calls.slice(before);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((c) => c.t < 1 + LOOKAHEAD + 1e-9)).toBe(true);
  });

  it('đồng hồ nhảy xa thì không phát dồn', () => {
    const { clock, voices, player } = setup();
    const play = vi.spyOn(SOUND_SETS.chip.music, 'play');
    player.play('chip');
    const sd = 60 / SOUND_SETS.chip.music.bpm / 4;
    const steps = play.mock.calls.length;
    const before = voices.calls.length;
    clock.now = 30;
    player.pump();
    expect(voices.calls.slice(before).every((c) => c.t >= 30)).toBe(true);
    expect(play.mock.calls.length - steps).toBeLessThanOrEqual(Math.ceil((LOOKAHEAD + START_DELAY) / sd) + 1);
  });
});
