import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import Phaser from 'phaser';
import { restoreSavedGame, setSavedGameMirror } from './game/storage';

/**
 * Cầu nối với app Android (Capacitor): nút Back, việc app bị đưa xuống nền, và bản sao lượt chơi đang lưu.
 * main.ts gọi bindAppEvents một lần, chuyển nút Back và việc xuống nền thành sự kiện trên game.events;
 * các scene nghe qua onBack / onSuspend.
 */
const BACK = 'app-back';
const SUSPEND = 'app-suspend';

export function bindAppEvents(game: Phaser.Game): void {
  // Trang bị ẩn: về màn hình chính, chuyển app, tắt màn hình (hoặc chuyển tab trên trình duyệt)
  game.events.on(Phaser.Core.Events.HIDDEN, () => game.events.emit(SUSPEND));
  if (!Capacitor.isNativePlatform()) return;
  // Đã có người nghe thì Capacitor bỏ hành vi mặc định của nút Back (rời khỏi app)
  void App.addListener('backButton', () => game.events.emit(BACK));
  void App.addListener('pause', () => game.events.emit(SUSPEND));
}

/** Gọi `fn` khi bấm nút Back của Android (cả cử chỉ vuốt Back). Tự gỡ khi scene tắt. */
export function onBack(scene: Phaser.Scene, fn: () => void): void {
  listen(scene, BACK, fn);
}

/** Gọi `fn` khi app bị đưa xuống nền. Có thể gọi hai lần cho cùng một lần (trang ẩn + app tạm dừng). Tự gỡ khi scene tắt. */
export function onSuspend(scene: Phaser.Scene, fn: () => void): void {
  listen(scene, SUSPEND, fn);
}

function listen(scene: Phaser.Scene, event: string, fn: () => void): void {
  const events = scene.game.events;
  events.on(event, fn);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => events.off(event, fn));
}

/** Đóng app. Chỉ có trên Android; nút Back chỉ có ở đó nên chỉ cần gọi từ đó. */
export function exitApp(): void {
  void App.exitApp();
}

/** Khóa của bản sao lượt chơi đang lưu trong bộ nhớ riêng của app. */
const SAVE_BACKUP_KEY = 'saved-game';
/** Đọc bản sao quá lâu thì mở game luôn với bản trong localStorage. */
const SAVE_BACKUP_TIMEOUT_MS = 1500;

/**
 * Trên Android: giữ thêm một bản sao của lượt chơi đang lưu trong SharedPreferences (@capacitor/preferences).
 * WebView có thể giữ localStorage trong bộ nhớ vài giây rồi mới ghi xuống đĩa, nên app bị tắt ngay sau một lần lưu
 * có thể mất lần lưu đó; SharedPreferences thì Android ghi xong khi app xuống nền.
 * Lúc mở app, bản nào mới hơn (theo thời điểm lưu) được giữ ở cả hai nơi. main.ts chờ hàm này xong mới mở menu,
 * vì menu đọc bản lưu ngay khi hiện.
 */
export async function initSaveBackup(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const store = (value: string) =>
    void Preferences.set({ key: SAVE_BACKUP_KEY, value }).catch((e) => console.warn('Không sao lưu được lượt chơi', e));
  try {
    const { value } = await new Promise<{ value: string | null }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Đọc bản sao lượt chơi quá lâu')), SAVE_BACKUP_TIMEOUT_MS);
      Preferences.get({ key: SAVE_BACKUP_KEY }).then(resolve, reject).finally(() => clearTimeout(timer));
    });
    const newer = restoreSavedGame(value);
    if (newer) store(newer);
  } catch (e) {
    console.warn('Không đọc được bản sao lượt chơi', e);
  }
  setSavedGameMirror(store);
}
