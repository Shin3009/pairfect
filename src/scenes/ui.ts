import Phaser from 'phaser';
import { playSfx } from '../audio/sound';
import { iconTexture, type IconName } from './icons';

/**
 * Game chỉ chơi màn ngang. Kích thước logic cao GAME_H, rộng theo tỉ lệ màn hình để lấp kín chiều ngang
 * (giới hạn GAME_MIN_W..GAME_MAX_W, ngoài khoảng đó sẽ có viền); Phaser tự co giãn (Scale.FIT).
 * Khi tỉ lệ màn hình đổi (chia đôi màn hình, kéo cửa sổ), main.ts đổi kích thước logic và các scene
 * sắp xếp lại bố cục, nên tọa độ theo chiều ngang luôn tính theo `scene.scale.width`.
 */
export const GAME_H = 720;
export const GAME_MIN_W = 1100;
export const GAME_MAX_W = 1600;

/** Kích thước logic hợp với khung hiển thị. */
export function sizeFor(viewW: number, viewH: number): { width: number; height: number } {
  const width = Phaser.Math.Clamp(Math.round((GAME_H * viewW) / viewH), GAME_MIN_W, GAME_MAX_W);
  return { width, height: GAME_H };
}

/** Gọi `fn` mỗi khi kích thước logic của game đổi. Tự gỡ khi scene tắt. */
export function onGameResize(scene: Phaser.Scene, fn: () => void): void {
  let { width, height } = scene.scale;
  const handler = () => {
    if (scene.scale.width === width && scene.scale.height === height) return;
    ({ width, height } = scene.scale);
    fn();
  };
  scene.scale.on(Phaser.Scale.Events.RESIZE, handler);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, handler));
}

export const FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Bảng màu giao diện dùng chung cho mọi màn hình. */
export const C = {
  bg: 0x1f3b4d,
  panel: 0x2c5266,
  accent: 0xffc857,
  disabled: 0x6b8796,
  iconDim: 0xb8d0dc,
  path: 0xffe066,
  select: 0xffc857,
  hint: 0x7ae582,
  badge: 0xe8505b,
  timeOk: 0x7ae582,
  timeLow: 0xe8505b,
  text: '#ffffff',
  textDim: '#b8d0dc',
  textDark: '#1f3b4d',
  textAccent: '#ffc857',
};

export function textStyle(size: number, color: string, weight = 'normal'): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: weight, resolution: 2 };
}

/**
 * Vùng chạm của nút. Chặn sự kiện để cú chạm không lọt xuống bàn chơi bên dưới.
 * Chạm có tác dụng thì phát tiếng bấm nút, sau khi `onTap` chạy xong (nút tắt / bật tiếng kêu theo cài đặt mới).
 * `onTap` trả về `false` nghĩa là lần chạm không làm gì (nút đang khóa), khi đó im; `sound` là false cho nút có tiếng riêng.
 */
export function tapZone(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  depth: number,
  onTap: () => unknown,
  sound = true,
): Phaser.GameObjects.Zone {
  const zone = scene.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).setDepth(depth);
  zone.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
    e.stopPropagation();
    if (onTap() !== false && sound) playSfx('tap');
  });
  return zone;
}

/** Nút bấm đơn giản: nền bo góc + chữ. */
export class Button {
  private bg: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private zone: Phaser.GameObjects.Zone;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    /** Trả về `false` nếu lần bấm không làm gì (không có tiếng bấm nút, xem tapZone). */
    onClick: () => unknown,
    depth = 1,
    fontSize = 28,
  ) {
    this.bg = scene.add.graphics().setDepth(depth);
    this.bg.fillStyle(C.accent, 1).fillRoundedRect(x - w / 2, y - h / 2, w, h, h / 2);
    this.label = scene.add.text(x, y, text, textStyle(fontSize, C.textDark, 'bold')).setOrigin(0.5).setDepth(depth);
    this.zone = tapZone(scene, x, y, w, h, depth, onClick);
  }

  destroy(): void {
    this.bg.destroy();
    this.label.destroy();
    this.zone.destroy();
  }
}

/** Nút vuông bo góc nhẹ có biểu tượng, kèm huy hiệu số lượt còn lại ở góc trên bên phải (có thể không có huy hiệu). */
export class IconButton {
  private bg: Phaser.GameObjects.Graphics;
  private icon: Phaser.GameObjects.Image;
  private badge: Phaser.GameObjects.Graphics;
  private count: Phaser.GameObjects.Text;
  private zone: Phaser.GameObjects.Zone;
  private enabled = true;

  constructor(
    private scene: Phaser.Scene,
    private x: number,
    private y: number,
    private size: number,
    icon: IconName,
    onClick: () => void,
    depth = 1,
    /** false cho nút đã có tiếng riêng (Gợi ý, Đảo bàn): không phát thêm tiếng bấm nút. */
    sound = true,
  ) {
    this.bg = scene.add.graphics().setDepth(depth);
    this.icon = scene.add
      .image(x, y, iconTexture(scene, icon))
      .setDisplaySize(size * 0.64, size * 0.64)
      .setTint(C.bg) // cùng màu chữ trên nút (C.textDark)
      .setDepth(depth);
    this.badge = scene.add.graphics().setDepth(depth);
    this.count = scene.add.text(0, 0, '', textStyle(15, C.text, 'bold')).setOrigin(0.5).setDepth(depth);
    // Nút đang khóa: không làm gì và không kêu
    this.zone = tapZone(scene, x, y, size, size, depth, () => (this.enabled ? onClick() : false), sound);
  }

  /** Đổi biểu tượng, giữ nguyên cỡ và màu. */
  setIcon(name: IconName): void {
    this.icon.setTexture(iconTexture(this.scene, name)).setDisplaySize(this.size * 0.64, this.size * 0.64);
  }

  /** Vẽ nút với số lượt `n` ở huy hiệu; `n` là null thì không có huy hiệu. */
  setCount(n: number | null, enabled: boolean): void {
    this.enabled = enabled;
    const s = this.size;
    this.bg.clear();
    this.bg.fillStyle(enabled ? C.accent : C.disabled, 1);
    this.bg.fillRoundedRect(this.x - s / 2, this.y - s / 2, s, s, 10);
    this.icon.setAlpha(enabled ? 1 : 0.6);

    this.badge.clear();
    this.count.setVisible(n !== null);
    if (n === null) return;
    // Huy hiệu hình viên thuốc giữ cố định mép phải, số nhiều chữ số thì dài sang trái đè lên góc nút.
    // Lượt cộng dồn qua nhiều màn có thể rất lớn: thu nhỏ chữ để huy hiệu không quá rộng.
    this.count.setText(String(n));
    this.count.setScale(Math.min(1, 22 / this.count.width));
    const h = 20;
    const w = Math.max(h, this.count.displayWidth + 10);
    const right = this.x + s / 2 + 6;
    const top = this.y - s / 2 - 6;
    this.badge.fillStyle(enabled ? C.badge : C.disabled, 1).fillRoundedRect(right - w, top, w, h, h / 2);
    // Viền màu nền HUD tách huy hiệu khỏi nút
    this.badge.lineStyle(2, C.panel, 1).strokeRoundedRect(right - w, top, w, h, h / 2);
    this.count.setPosition(right - w / 2, top + h / 2);
  }

  destroy(): void {
    for (const o of [this.bg, this.icon, this.badge, this.count, this.zone]) o.destroy();
  }
}

export interface DialogAction {
  label: string;
  onClick: () => void;
}

export interface DialogOptions {
  title: string;
  body?: string;
  actions: DialogAction[];
  /**
   * Việc làm khi bấm nút Back của Android lúc hộp thoại đang mở (scene tự gọi, xem native.ts).
   * Bỏ trống thì Back không làm gì, buộc người chơi chọn một nút.
   */
  back?: () => void;
  /** Độ đậm của lớp phủ tối phía sau hộp thoại. */
  shade?: number;
  /** Chiều rộng khung hộp thoại. */
  width?: number;
  /** Căn lề nội dung; mặc định giữa. Danh sách dài (như ghi công) đọc dễ hơn khi căn trái. */
  bodyAlign?: 'left' | 'center';
  depth?: number;
  /**
   * Bỏ qua chạm vào các nút trong chừng này mili giây đầu. Dùng cho hộp hiện bất ngờ lúc người chơi đang chạm
   * liên tục (kết quả trận đấu online), để cú chạm định dành cho bàn chơi không bấm nhầm nút.
   */
  ignoreTapsMs?: number;
}

/**
 * Hộp thoại giữa màn hình: tiêu đề, nội dung và các nút xếp dọc.
 * Lớp phủ chặn mọi thao tác chạm xuống bên dưới. Trả về hàm đóng hộp thoại.
 */
export function showDialog(scene: Phaser.Scene, opts: DialogOptions): () => void {
  const W = scene.scale.width;
  const H = scene.scale.height;
  const depth = opts.depth ?? 30;
  const PANEL_W = opts.width ?? 560;
  const PAD = 52;
  const BTN_W = 320;
  const BTN_H = 70;
  const BTN_GAP = 18;

  const shade = scene.add
    .rectangle(0, 0, W, H, 0x000000, opts.shade ?? 0.55)
    .setOrigin(0)
    .setDepth(depth)
    .setInteractive();
  const title = scene.add
    .text(W / 2, 0, opts.title, textStyle(56, C.textDark, 'bold'))
    .setOrigin(0.5, 0)
    .setDepth(depth + 2);
  const body = opts.body
    ? scene.add
        .text(opts.bodyAlign === 'left' ? (W - PANEL_W) / 2 + PAD : W / 2, 0, opts.body, {
          ...textStyle(30, '#2c5266'),
          align: opts.bodyAlign ?? 'center',
          lineSpacing: 8,
          wordWrap: { width: PANEL_W - PAD * 2 },
        })
        .setOrigin(opts.bodyAlign === 'left' ? 0 : 0.5, 0)
        .setDepth(depth + 2)
    : null;

  const n = opts.actions.length;
  const buttonsH = n * BTN_H + (n - 1) * BTN_GAP;
  const contentHeight = () => title.height + (body ? 24 + body.height : 0);
  const panelHeight = () => PAD + contentHeight() + 44 + buttonsH + PAD;
  // Nội dung dài trên màn ngang (thấp): thu nhỏ chữ cho tới khi vừa màn hình
  for (let size = 30; body && panelHeight() > H - 48 && size > 14; ) body.setFontSize((size -= 2));
  const contentH = contentHeight();
  const panelH = panelHeight();
  const top = Math.round((H - panelH) / 2);

  const panel = scene.add.graphics().setDepth(depth + 1);
  panel.fillStyle(0xfffaf0, 1).fillRoundedRect(Math.round((W - PANEL_W) / 2), top, PANEL_W, panelH, 28);
  title.setY(top + PAD);
  body?.setY(title.y + title.height + 24);

  const firstBtnY = top + PAD + contentH + 44 + BTN_H / 2;
  const armedAt = Date.now() + (opts.ignoreTapsMs ?? 0);
  const buttons = opts.actions.map(
    (a, i) =>
      new Button(
        scene,
        W / 2,
        firstBtnY + i * (BTN_H + BTN_GAP),
        BTN_W,
        BTN_H,
        a.label,
        // Lần chạm bị bỏ qua (hộp vừa hiện) trả về false: không làm gì và không kêu
        () => (Date.now() >= armedAt ? a.onClick() : false),
        depth + 2,
      ),
  );

  return () => {
    for (const o of [shade, title, body, panel]) o?.destroy();
    buttons.forEach((b) => b.destroy());
  };
}
