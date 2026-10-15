import Phaser from 'phaser';

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

/** Nút bấm đơn giản: nền bo góc + chữ. */
export class Button {
  private bg: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private zone: Phaser.GameObjects.Zone;
  private enabled = true;

  constructor(
    scene: Phaser.Scene,
    private x: number,
    private y: number,
    private w: number,
    private h: number,
    text: string,
    onClick: () => void,
    depth = 1,
    fontSize = 28,
  ) {
    this.bg = scene.add.graphics().setDepth(depth);
    this.label = scene.add.text(x, y, text, textStyle(fontSize, C.textDark, 'bold')).setOrigin(0.5).setDepth(depth);
    this.zone = scene.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).setDepth(depth);
    this.zone.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      if (this.enabled) onClick();
    });
    this.draw();
  }

  setLabel(text: string, enabled: boolean): void {
    this.label.setText(text);
    // Chữ dài hơn nút (vd. số lượt Gợi ý cộng dồn lớn) thì thu nhỏ cho vừa
    this.label.setScale(Math.min(1, (this.w - 16) / this.label.width));
    this.enabled = enabled;
    this.draw();
  }

  destroy(): void {
    this.bg.destroy();
    this.label.destroy();
    this.zone.destroy();
  }

  private draw(): void {
    this.bg.clear();
    this.bg.fillStyle(this.enabled ? C.accent : C.disabled, 1);
    this.bg.fillRoundedRect(this.x - this.w / 2, this.y - this.h / 2, this.w, this.h, this.h / 2);
    this.label.setAlpha(this.enabled ? 1 : 0.6);
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
  /** Độ đậm của lớp phủ tối phía sau hộp thoại. */
  shade?: number;
  /** Chiều rộng khung hộp thoại. */
  width?: number;
  depth?: number;
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
        .text(W / 2, 0, opts.body, {
          ...textStyle(30, '#2c5266'),
          align: 'center',
          lineSpacing: 8,
          wordWrap: { width: PANEL_W - PAD * 2 },
        })
        .setOrigin(0.5, 0)
        .setDepth(depth + 2)
    : null;

  const n = opts.actions.length;
  const buttonsH = n * BTN_H + (n - 1) * BTN_GAP;
  const contentHeight = () => title.height + (body ? 24 + body.height : 0);
  const panelHeight = () => PAD + contentHeight() + 44 + buttonsH + PAD;
  // Nội dung dài trên màn ngang (thấp): thu nhỏ chữ cho tới khi vừa màn hình
  for (let size = 30; body && panelHeight() > H - 48 && size > 18; ) body.setFontSize((size -= 2));
  const contentH = contentHeight();
  const panelH = panelHeight();
  const top = Math.round((H - panelH) / 2);

  const panel = scene.add.graphics().setDepth(depth + 1);
  panel.fillStyle(0xfffaf0, 1).fillRoundedRect(Math.round((W - PANEL_W) / 2), top, PANEL_W, panelH, 28);
  title.setY(top + PAD);
  body?.setY(title.y + title.height + 24);

  const firstBtnY = top + PAD + contentH + 44 + BTN_H / 2;
  const buttons = opts.actions.map(
    (a, i) => new Button(scene, W / 2, firstBtnY + i * (BTN_H + BTN_GAP), BTN_W, BTN_H, a.label, a.onClick, depth + 2),
  );

  return () => {
    for (const o of [shade, title, body, panel]) o?.destroy();
    buttons.forEach((b) => b.destroy());
  };
}
