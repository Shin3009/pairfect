import Phaser from 'phaser';
import { GRAVITY_LABEL, LEVELS } from '../game/levels';
import { loadUnlocked } from '../game/storage';
import { Button, C, GAME_W, textStyle } from './ui';

const CARD_X = 48;
const CARD_W = GAME_W - CARD_X * 2;
const CARD_H = 120;
const CARD_GAP = 16;
const LIST_TOP = 200;

/** Danh sách các màn trong LEVELS. Qua màn trước mới mở khóa màn sau. */
export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('Levels');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(C.bg).fadeIn(250, 31, 59, 77);
    this.add.text(GAME_W / 2, 70, 'Chọn màn', textStyle(56, C.text, 'bold')).setOrigin(0.5, 0);
    this.add
      .text(GAME_W / 2, 148, 'Qua màn trước để mở khóa màn sau', textStyle(24, C.textDim))
      .setOrigin(0.5, 0);

    const unlocked = loadUnlocked();
    LEVELS.forEach((_, i) => this.createCard(i, i <= unlocked));

    new Button(this, GAME_W / 2, 1200, 320, 70, 'Quay lại', () => this.scene.start('Menu'));
  }

  private createCard(index: number, open: boolean): void {
    const lv = LEVELS[index];
    const top = LIST_TOP + index * (CARD_H + CARD_GAP);
    const cy = CARD_H / 2;

    const bg = this.add.graphics();
    bg.fillStyle(C.panel, 1).fillRoundedRect(0, 0, CARD_W, CARD_H, 20);
    bg.fillStyle(open ? C.accent : C.disabled, 1).fillCircle(70, cy, 40);
    const card = this.add.container(CARD_X, top).setAlpha(open ? 1 : 0.5);
    card.add([
      bg,
      this.add.text(70, cy, String(index + 1), textStyle(40, C.textDark, 'bold')).setOrigin(0.5),
      this.add.text(136, 22, GRAVITY_LABEL[lv.gravity], textStyle(32, C.text, 'bold')),
      this.add.text(136, 70, `${lv.rows}×${lv.cols} · ${lv.types} loại hình · ${formatTime(lv.time)}`, textStyle(24, C.textDim)),
      open
        ? this.add.text(CARD_W - 32, cy, '›', textStyle(56, C.text, 'bold')).setOrigin(1, 0.5)
        : this.add.text(CARD_W - 32, cy, 'Chưa mở', textStyle(24, C.textDim)).setOrigin(1, 0.5),
    ]);

    const zone = this.add
      .zone(CARD_X + CARD_W / 2, top + cy, CARD_W, CARD_H)
      .setInteractive({ useHandCursor: open });
    zone.on('pointerdown', () => {
      if (open) {
        this.scene.start('Game', { level: index, score: 0 });
        return;
      }
      // Màn chưa mở: rung nhẹ thẻ
      this.tweens.killTweensOf(card);
      card.x = CARD_X;
      this.tweens.add({ targets: card, x: CARD_X + 10, duration: 50, yoyo: true, repeat: 2 });
    });
  }
}

function formatTime(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
