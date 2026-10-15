import Phaser from 'phaser';
import { GRAVITY_LABEL, LEVELS, orient } from '../game/levels';
import { loadUnlocked } from '../game/storage';
import { Button, C, isLandscape, onGameResize, textStyle } from './ui';

const SIDE = 48;
const GAP = 16;

/** Bố cục danh sách: một cột (màn dọc) hoặc lưới hai cột (màn ngang). */
const LAYOUT_PORTRAIT = { columns: 1, cardH: 120, titleY: 70, subtitleY: 148, listTop: 200, backY: 1200 };
const LAYOUT_LANDSCAPE = { columns: 2, cardH: 100, titleY: 36, subtitleY: 110, listTop: 160, backY: 670 };

/** Danh sách các màn trong LEVELS. Qua màn trước mới mở khóa màn sau. */
export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('Levels');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(C.bg).fadeIn(250, 31, 59, 77);
    onGameResize(this, () => this.scene.restart());

    const landscape = isLandscape(this);
    const L = landscape ? LAYOUT_LANDSCAPE : LAYOUT_PORTRAIT;
    const W = this.scale.width;
    this.add.text(W / 2, L.titleY, 'Chọn màn', textStyle(56, C.text, 'bold')).setOrigin(0.5, 0);
    this.add
      .text(W / 2, L.subtitleY, 'Qua màn trước để mở khóa màn sau', textStyle(24, C.textDim))
      .setOrigin(0.5, 0);

    const cardW = (W - SIDE * 2 - GAP * (L.columns - 1)) / L.columns;
    const unlocked = loadUnlocked();
    LEVELS.forEach((_, i) => {
      const x = SIDE + (i % L.columns) * (cardW + GAP);
      const y = L.listTop + Math.floor(i / L.columns) * (L.cardH + GAP);
      this.createCard(i, i <= unlocked, x, y, cardW, L.cardH, landscape);
    });

    new Button(this, W / 2, L.backY, 320, 70, 'Quay lại', () => this.scene.start('Menu'));
  }

  private createCard(index: number, open: boolean, x: number, y: number, w: number, h: number, landscape: boolean): void {
    const lv = LEVELS[index];
    const { rows, cols } = orient(lv, landscape);
    const cy = h / 2;

    const bg = this.add.graphics();
    bg.fillStyle(C.panel, 1).fillRoundedRect(0, 0, w, h, 20);
    bg.fillStyle(open ? C.accent : C.disabled, 1).fillCircle(70, cy, 40);
    // Chữ không được lấn sang biểu tượng bên phải; thẻ hẹp (màn ngang hẹp) thì thu nhỏ chữ lại
    const textW = w - 136 - 80;
    const name = this.add.text(136, cy - 40, GRAVITY_LABEL[lv.gravity], textStyle(32, C.text, 'bold'));
    const info = this.add.text(136, cy + 8, `${rows}×${cols} · ${lv.types} loại hình · ${formatTime(lv.time)}`, textStyle(24, C.textDim));
    for (const t of [name, info]) if (t.width > textW) t.setScale(textW / t.width);

    const card = this.add.container(x, y).setAlpha(open ? 1 : 0.5);
    card.add([
      bg,
      this.add.text(70, cy, String(index + 1), textStyle(40, C.textDark, 'bold')).setOrigin(0.5),
      name,
      info,
      open
        ? this.add.text(w - 32, cy, '›', textStyle(56, C.text, 'bold')).setOrigin(1, 0.5)
        : this.padlock(w - 48, cy),
    ]);

    const zone = this.add.zone(x + w / 2, y + cy, w, h).setInteractive({ useHandCursor: open });
    zone.on('pointerdown', () => {
      if (open) {
        this.scene.start('Game', { level: index, score: 0 });
        return;
      }
      // Màn chưa mở: rung nhẹ thẻ
      this.tweens.killTweensOf(card);
      card.x = x;
      this.tweens.add({ targets: card, x: x + 10, duration: 50, yoyo: true, repeat: 2 });
    });
  }

  /** Biểu tượng ổ khóa nhỏ (vẽ bằng code) cho màn chưa mở. */
  private padlock(x: number, y: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics({ x, y });
    g.lineStyle(5, C.iconDim, 1).beginPath().arc(0, -4, 10, Math.PI, 0).strokePath();
    g.lineBetween(-10, -4, -10, 2).lineBetween(10, -4, 10, 2);
    g.fillStyle(C.iconDim, 1).fillRoundedRect(-15, 0, 30, 22, 5);
    return g;
  }
}

function formatTime(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
