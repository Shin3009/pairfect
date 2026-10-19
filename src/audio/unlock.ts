/** Các sự kiện trình duyệt coi là thao tác của người dùng, đủ để cho phép phát âm thanh. */
const GESTURES = ['pointerdown', 'pointerup', 'mousedown', 'touchend', 'keydown'];

/**
 * Mở khóa âm thanh ở lần chạm / bấm phím đầu tiên trên bất kỳ chỗ nào của trang.
 * Phaser chỉ nghe trên document.body, nên lần chạm vào hộp HTML có chặn sự kiện (hộp nhập tên lúc mới mở game)
 * không mở khóa được. Ở đây nghe trên window ở pha capture, chạy trước khi hộp đó chặn sự kiện.
 * Mở được rồi thì thôi nghe; chưa được (trình duyệt từ chối) thì lần sau thử lại.
 */
export function unlockOnGesture(
  ctx: { readonly state: AudioContextState; resume(): Promise<void> },
  target: EventTarget = window,
): void {
  const done = () => {
    for (const type of GESTURES) target.removeEventListener(type, onGesture, true);
  };
  function onGesture(): void {
    if (ctx.state === 'running') {
      done();
      return;
    }
    ctx.resume().then(
      () => {
        if (ctx.state === 'running') done();
      },
      () => {},
    );
  }
  for (const type of GESTURES) target.addEventListener(type, onGesture, true);
}
