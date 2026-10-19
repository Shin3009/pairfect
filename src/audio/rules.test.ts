import { describe, expect, it } from 'vitest';
import { muteToggled, nextCombo, pitchStep, timeCues } from './rules';

describe('báo giờ', () => {
  // Màn 240 giây: thanh giờ đỏ từ 60 giây trở xuống
  const cue = (prev: number, left: number, warned = false) => timeCues(prev, left, 240, warned);

  it('báo một lần khi thời gian vừa xuống ngưỡng đỏ', () => {
    expect(cue(60.05, 59.95).warn).toBe(true);
    expect(cue(60.05, 60).warn).toBe(true);
    expect(cue(59, 58.9).warn).toBe(false);
    expect(cue(60.05, 59.95, true).warn).toBe(false);
  });

  it('tích mỗi giây trong 10 giây cuối, gấp ở 3 giây cuối', () => {
    expect(cue(10.05, 9.95, true).tick).toBe('normal');
    expect(cue(3.05, 2.95, true).tick).toBe('urgent');
    expect(cue(11.05, 10.95, true).tick).toBeNull();
    expect(cue(0.05, -0.05, true).tick).toBeNull();
    expect(cue(9.5, 9.4, true).tick).toBeNull();
  });

  it('được thưởng giờ thì không tích, giảm xuống lại thì tích tiếp', () => {
    expect(cue(5.2, 6.2, true).tick).toBeNull();
    expect(cue(6.05, 5.95, true).tick).toBe('normal');
  });

  it('nhảy nhiều giây một lúc thì chỉ một tiếng', () => {
    expect(cue(9.05, 6.95, true).tick).toBe('normal');
  });
});

describe('chuỗi', () => {
  it('nextCombo nối chuỗi khi cách nhau tối đa COMBO_MS', () => {
    expect(nextCombo(null, 5000, 0)).toBe(1);
    expect(nextCombo(1000, 3000, 2)).toBe(3);
    expect(nextCombo(1000, 3001, 5)).toBe(1);
  });

  it('pitchStep bắt đầu từ 0 và dừng ở 7', () => {
    expect([1, 3, 8, 20, 0].map(pitchStep)).toEqual([0, 2, 7, 7, 0]);
  });
});

describe('nút tắt tiếng', () => {
  it('đang có tiếng thì tắt hết và nhớ trạng thái cũ', () => {
    expect(muteToggled({ sfx: true, music: false }, null)).toEqual({
      next: { sfx: false, music: false },
      remembered: { sfx: true, music: false },
    });
  });

  it('đang tắt thì trả lại trạng thái đã nhớ', () => {
    expect(muteToggled({ sfx: false, music: false }, { sfx: true, music: false })).toEqual({
      next: { sfx: true, music: false },
      remembered: null,
    });
  });

  it('đang tắt mà không nhớ gì thì bật cả hai', () => {
    expect(muteToggled({ sfx: false, music: false }, null).next).toEqual({ sfx: true, music: true });
    expect(muteToggled({ sfx: false, music: false }, { sfx: false, music: false }).next).toEqual({ sfx: true, music: true });
  });
});
