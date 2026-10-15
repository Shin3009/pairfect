import { cleanName, NAME_MAX, savePlayerName } from '../game/storage';

/**
 * Hộp nhập tên người chơi. Làm bằng HTML (khung có sẵn trong index.html) chứ không vẽ bằng Phaser,
 * để dùng bàn phím của hệ thống và gõ được tiếng Việt có dấu.
 * Hộp nằm ngoài các scene nên không đóng khi scene khởi động lại: bàn phím ảo hiện lên có thể làm đổi
 * kích thước game, và menu dựng lại khi đó.
 */

/**
 * Phaser nghe cả sự kiện chạm trên window và vẫn tìm đối tượng game nằm dưới điểm chạm,
 * nên chặn lại ở hộp để chạm vào hộp không bấm nhầm nút menu bên dưới.
 */
const BLOCKED_EVENTS = ['touchstart', 'touchend', 'touchcancel', 'mousedown', 'mouseup', 'keydown', 'keyup'];
const stop = (e: Event) => e.stopPropagation();

let open: { cancellable: boolean; close: (name: string | null) => void; done: Promise<string | null> } | null = null;

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/**
 * Hỏi tên người chơi. Có `current` là đổi tên: điền sẵn tên cũ và được hủy.
 * Không có là lần đầu mở game: bắt buộc nhập.
 * Trả về tên đã lưu (đã chuẩn hóa), hoặc null nếu hủy. Hộp đang mở thì trả về lần mở đó.
 */
export function askPlayerName(current: string | null): Promise<string | null> {
  if (open) return open.done;

  const form = el<HTMLFormElement>('name-dialog');
  const input = el<HTMLInputElement>('name-input');
  const ok = el<HTMLButtonElement>('name-ok');
  const cancel = el<HTMLButtonElement>('name-cancel');
  el('name-title').textContent = current ? 'Đổi tên' : 'Chào bạn!';
  el('name-body').textContent = current
    ? 'Tên mới sẽ thay tên cũ trên kỷ lục của bạn.'
    : 'Nhập tên của bạn để ghi kèm kỷ lục.';
  input.maxLength = NAME_MAX;
  input.value = current ?? '';
  cancel.hidden = !current;
  for (const type of BLOCKED_EVENTS) form.addEventListener(type, stop);

  const update = () => (ok.disabled = !cleanName(input.value));
  update();
  input.oninput = update;

  let resolve!: (name: string | null) => void;
  const done = new Promise<string | null>((r) => (resolve = r));
  const close = (name: string | null) => {
    open = null;
    input.blur(); // đóng bàn phím ảo
    form.hidden = true;
    resolve(name);
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    const name = cleanName(input.value);
    if (name) close(savePlayerName(name));
  };
  cancel.onclick = () => close(null);
  open = { cancellable: !!current, close, done };

  form.hidden = false;
  input.focus();
  input.select();
  return done;
}

/**
 * Nút Back của Android khi hộp đang mở: đóng hộp đổi tên; hộp nhập tên lần đầu thì bắt buộc nên Back không làm gì.
 * Trả về false nếu hộp không mở, để scene tự xử lý nút Back.
 */
export function nameDialogBack(): boolean {
  if (!open) return false;
  if (open.cancellable) open.close(null);
  return true;
}
