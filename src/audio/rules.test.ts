import { describe, expect, it } from 'vitest';
import { muteToggled, nextCombo, pitchStep } from './rules';

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
