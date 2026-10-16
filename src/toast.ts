/**
 * Thông báo nhỏ ở giữa mép trên màn hình, tự ẩn sau vài giây. Thông báo mới thay thông báo đang hiện.
 * Làm bằng HTML (#toast trong index.html) chứ không vẽ bằng Phaser, để hiện được ở mọi scene và không mất
 * khi scene khởi động lại (đổi màn, đổi kích thước). Thông báo không nhận chạm: chạm xuyên qua xuống game.
 */

/** Thời gian hiện, tính bằng mili giây. Thông báo lỗi dài hơn nên để lâu hơn. */
const DURATION = { ok: 3000, error: 4500 };

let timer = 0;

export function showToast(text: string, kind: 'ok' | 'error' = 'ok'): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.dataset.kind = kind;
  el.classList.add('show');
  clearTimeout(timer);
  timer = window.setTimeout(() => el.classList.remove('show'), DURATION[kind]);
}
