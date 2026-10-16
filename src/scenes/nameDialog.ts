import { cleanName, NAME_MAX, savePlayerName } from '../game/storage';
import { cleanCode, CODE_LENGTH } from '../pvp/protocol';

/**
 * Hộp nhập chữ: tên người chơi, và mã phòng khi vào phòng đấu online. Làm bằng HTML (khung có sẵn trong index.html)
 * chứ không vẽ bằng Phaser, để dùng bàn phím của hệ thống và gõ được tiếng Việt có dấu.
 * Hộp nằm ngoài các scene nên không đóng khi scene khởi động lại: bàn phím ảo hiện lên có thể làm đổi
 * kích thước game, và menu dựng lại khi đó.
 */

/**
 * Phaser nghe cả sự kiện chạm trên window và vẫn tìm đối tượng game nằm dưới điểm chạm,
 * nên chặn lại ở hộp để chạm vào hộp không bấm nhầm nút menu bên dưới.
 */
const BLOCKED_EVENTS = ['touchstart', 'touchend', 'touchcancel', 'mousedown', 'mouseup', 'keydown', 'keyup'];
const stop = (e: Event) => e.stopPropagation();

let open: {
  kind: AskOptions['kind'];
  cancellable: boolean;
  close: (value: string | null) => void;
  done: Promise<string | null>;
} | null = null;

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

interface AskOptions {
  /** Hộp đang mở mà hỏi lại cùng loại thì trả về lần mở đó; khác loại thì coi như hủy. */
  kind: 'name' | 'code';
  title: string;
  body: string;
  placeholder: string;
  value: string;
  maxLength: number;
  okLabel: string;
  cancellable: boolean;
  /** Mã phòng: hiện chữ hoa, bàn phím gợi ý chữ hoa. */
  upper: boolean;
  /** Chuẩn hóa chữ đã gõ; chuỗi rỗng là chưa hợp lệ (nút OK bị khóa). */
  clean: (raw: string) => string;
}

function ask(opts: AskOptions): Promise<string | null> {
  if (open) return open.kind === opts.kind ? open.done : Promise.resolve(null);

  const form = el<HTMLFormElement>('name-dialog');
  const input = el<HTMLInputElement>('name-input');
  const ok = el<HTMLButtonElement>('name-ok');
  const cancel = el<HTMLButtonElement>('name-cancel');
  el('name-title').textContent = opts.title;
  el('name-body').textContent = opts.body;
  input.placeholder = opts.placeholder;
  input.maxLength = opts.maxLength;
  input.value = opts.value;
  input.setAttribute('autocapitalize', opts.upper ? 'characters' : 'words');
  input.style.textTransform = opts.upper ? 'uppercase' : '';
  ok.textContent = opts.okLabel;
  cancel.hidden = !opts.cancellable;
  for (const type of BLOCKED_EVENTS) form.addEventListener(type, stop);

  const update = () => (ok.disabled = !opts.clean(input.value));
  update();
  input.oninput = update;

  let resolve!: (value: string | null) => void;
  const done = new Promise<string | null>((r) => (resolve = r));
  const close = (value: string | null) => {
    open = null;
    input.blur(); // đóng bàn phím ảo
    form.hidden = true;
    resolve(value);
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    const value = opts.clean(input.value);
    if (value) close(value);
  };
  cancel.onclick = () => close(null);
  open = { kind: opts.kind, cancellable: opts.cancellable, close, done };

  form.hidden = false;
  input.focus();
  input.select();
  return done;
}

/**
 * Hỏi tên người chơi. Có `current` là đổi tên: điền sẵn tên cũ và được hủy.
 * Không có là lần đầu mở game: bắt buộc nhập.
 * Trả về tên đã lưu (đã chuẩn hóa), hoặc null nếu hủy. Hộp đang mở thì trả về lần mở đó.
 */
export async function askPlayerName(current: string | null): Promise<string | null> {
  const name = await ask({
    kind: 'name',
    title: current ? 'Đổi tên' : 'Chào bạn!',
    body: current ? 'Tên mới sẽ thay tên cũ trên kỷ lục của bạn.' : 'Nhập tên của bạn để ghi kèm kỷ lục.',
    placeholder: 'Tên của bạn',
    value: current ?? '',
    maxLength: NAME_MAX,
    okLabel: 'Lưu',
    cancellable: !!current,
    upper: false,
    clean: cleanName,
  });
  return name && savePlayerName(name);
}

/** Hỏi mã phòng đấu online. Trả về mã đã chuẩn hóa (xem cleanCode), hoặc null nếu hủy. */
export function askRoomCode(): Promise<string | null> {
  return ask({
    kind: 'code',
    title: 'Vào phòng',
    body: `Nhập mã phòng ${CODE_LENGTH} ký tự đang hiện trên máy của bạn bè.`,
    placeholder: 'Mã phòng',
    value: '',
    // Chừa chỗ cho khoảng trắng / dấu gạch người chơi gõ thêm (cleanCode bỏ đi)
    maxLength: CODE_LENGTH + 2,
    okLabel: 'Vào',
    cancellable: true,
    upper: true,
    clean: cleanCode,
  });
}

/**
 * Nút Back của Android khi hộp đang mở: đóng hộp đổi tên / nhập mã; hộp nhập tên lần đầu thì bắt buộc nên Back
 * không làm gì. Trả về false nếu hộp không mở, để scene tự xử lý nút Back.
 */
export function nameDialogBack(): boolean {
  if (!open) return false;
  if (open.cancellable) open.close(null);
  return true;
}
