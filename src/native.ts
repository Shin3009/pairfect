import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import Phaser from 'phaser';

/**
 * Cầu nối với app Android (Capacitor): nút Back và việc app bị đưa xuống nền.
 * main.ts gọi bindAppEvents một lần, chuyển chúng thành sự kiện trên game.events;
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
