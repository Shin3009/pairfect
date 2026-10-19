import { describe, expect, it, vi } from 'vitest';
import { unlockOnGesture } from './unlock';

/** AudioContext giả: resume() chuyển sang 'running' (hoặc bị từ chối nếu `allow` là false). */
function fakeContext(allow = true) {
  const ctx = {
    state: 'suspended' as AudioContextState,
    resume: vi.fn(async () => {
      if (!allow) throw new Error('chưa được phép');
      ctx.state = 'running';
    }),
  };
  return ctx;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('unlockOnGesture', () => {
  it('lần chạm đầu tiên gọi resume', () => {
    const target = new EventTarget();
    const ctx = fakeContext();
    unlockOnGesture(ctx, target);
    target.dispatchEvent(new Event('pointerdown'));
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('nghe cả phím và touchend', () => {
    for (const type of ['keydown', 'touchend']) {
      const target = new EventTarget();
      const ctx = fakeContext();
      unlockOnGesture(ctx, target);
      target.dispatchEvent(new Event(type));
      expect(ctx.resume).toHaveBeenCalledTimes(1);
    }
  });

  it('mở được rồi thì thôi nghe', async () => {
    const target = new EventTarget();
    const ctx = fakeContext();
    unlockOnGesture(ctx, target);
    target.dispatchEvent(new Event('pointerdown'));
    await flush();
    target.dispatchEvent(new Event('pointerdown'));
    target.dispatchEvent(new Event('keydown'));
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('chưa mở được thì lần chạm sau thử lại, không báo lỗi', async () => {
    const target = new EventTarget();
    const ctx = fakeContext(false);
    unlockOnGesture(ctx, target);
    target.dispatchEvent(new Event('pointerdown'));
    await flush();
    target.dispatchEvent(new Event('pointerdown'));
    expect(ctx.resume).toHaveBeenCalledTimes(2);
  });

  it('đang chạy sẵn thì không làm gì', () => {
    const target = new EventTarget();
    const ctx = fakeContext();
    ctx.state = 'running';
    unlockOnGesture(ctx, target);
    target.dispatchEvent(new Event('pointerdown'));
    expect(ctx.resume).not.toHaveBeenCalled();
  });
});
