import Phaser from 'phaser';
import { startMusic } from '../audio/sound';
import { saveTileArt } from '../game/storage';
import { artTexture, selectedTileArt, TILE_ARTS, type TileArt } from '../game/tileArt';
import { onBack } from '../native';
import { Button, C, onGameResize, showDialog, tapZone, textStyle } from './ui';

/** Số ô mẫu trên mỗi thẻ: các loại đầu tiên, cũng là những hình xuất hiện ở màn 1. */
const SAMPLES = 5;
const LIST_TOP = 124;
const LIST_BOTTOM = 596;
const CARD_GAP = 16;
const CARD_MAX_H = 124;
const CARD_MAX_W = 980;

interface Card {
  art: TileArt;
  bg: Phaser.GameObjects.Graphics;
  name: Phaser.GameObjects.Text;
  note: Phaser.GameObjects.Text;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Chọn bộ hình cho các ô: mỗi bộ một thẻ có tên và vài ô mẫu; chạm để chọn. */
export class TileArtScene extends Phaser.Scene {
  private cards: Card[] = [];
  /** Đóng hộp ghi công đang mở, hoặc null nếu không mở. */
  private closeCredits: (() => void) | null = null;

  constructor() {
    super('TileArt');
  }

  create(): void {
    this.cards = [];
    this.closeCredits = null;
    this.cameras.main.setBackgroundColor(C.bg).fadeIn(250, 31, 59, 77);
    // Nhạc menu chạy liền qua các màn menu (xem audio/sound.ts)
    startMusic('menu');
    onGameResize(this, () => this.scene.restart());
    // Nút Back của Android: đóng hộp ghi công nếu đang mở, không thì về menu
    onBack(this, () => (this.closeCredits ? this.hideCredits() : this.back()));

    const W = this.scale.width;
    const x = W / 2;
    this.add.text(x, 62, 'Hình ô', textStyle(56, C.text, 'bold')).setOrigin(0.5);

    const n = TILE_ARTS.length;
    const h = Math.min(CARD_MAX_H, (LIST_BOTTOM - LIST_TOP - CARD_GAP * (n - 1)) / n);
    const w = Math.min(W - 120, CARD_MAX_W);
    const tile = h - 28;
    TILE_ARTS.forEach((art, i) => {
      const y = LIST_TOP + i * (h + CARD_GAP) + h / 2;
      const left = x - w / 2;
      const bg = this.add.graphics();
      // Ô mẫu xếp sát mép phải; tên bộ chiếm phần còn lại bên trái
      const tilesLeft = left + w - 24 - SAMPLES * tile - (SAMPLES - 1) * 8;
      for (let k = 0; k < SAMPLES; k++)
        this.add
          .image(tilesLeft + k * (tile + 8) + tile / 2, y, artTexture(this, art, k + 1))
          .setDisplaySize(tile, tile);
      // Bộ ảnh có ghi công tác giả: nút "Ghi công" nằm ngay trước các ô mẫu
      let nameRight = tilesLeft - 24;
      if (art.credits) {
        const label = this.add
          .text(nameRight - 18, y, 'Ghi công', textStyle(20, C.textDim, 'bold'))
          .setOrigin(1, 0.5)
          .setDepth(1);
        const bw = label.width + 36;
        this.add.graphics().fillStyle(C.bg, 1).fillRoundedRect(nameRight - bw, y - 20, bw, 40, 20);
        tapZone(this, nameRight - bw / 2, y, bw, 40, 2, () => this.showCredits(art));
        nameRight -= bw + 16;
      }
      const name = this.add.text(left + 32, y - 14, art.name, textStyle(30, C.text, 'bold')).setOrigin(0, 0.5);
      name.setScale(Math.min(1, (nameRight - name.x) / name.width));
      const note = this.add.text(left + 32, y + 22, 'Đang dùng', textStyle(20, C.textAccent)).setOrigin(0, 0.5);
      tapZone(this, x, y, w, h, 1, () => this.choose(art.id));
      this.cards.push({ art, bg, name, note, x: left, y: y - h / 2, w, h });
    });
    this.highlight();

    new Button(this, x, 652, 320, 76, 'Quay lại', () => this.back(), 1, 30);
  }

  private choose(id: string): void {
    saveTileArt(id);
    this.highlight();
  }

  /** Thẻ của bộ đang chọn có viền và tên màu nhấn, kèm dòng "Đang dùng". */
  private highlight(): void {
    const selected = selectedTileArt().id;
    for (const c of this.cards) {
      const on = c.art.id === selected;
      c.bg.clear().fillStyle(C.panel, 1).fillRoundedRect(c.x, c.y, c.w, c.h, 20);
      if (on) c.bg.lineStyle(5, C.accent, 1).strokeRoundedRect(c.x, c.y, c.w, c.h, 20);
      c.name.setColor(on ? C.textAccent : C.text);
      // Có dòng "Đang dùng" thì tên nhích lên; không có thì tên nằm giữa thẻ
      c.note.setVisible(on);
      c.name.setY(c.y + c.h / 2 - (on ? 14 : 0));
    }
  }

  private showCredits(art: TileArt): void {
    this.hideCredits();
    this.closeCredits = showDialog(this, {
      title: 'Ghi công',
      body: art.credits,
      bodyAlign: 'left',
      width: Math.min(this.scale.width - 80, 1100),
      actions: [{ label: 'Đóng', onClick: () => this.hideCredits() }],
      back: () => this.hideCredits(),
    });
  }

  private hideCredits(): void {
    this.closeCredits?.();
    this.closeCredits = null;
  }

  private back(): void {
    this.scene.start('Menu');
  }
}
