import Phaser from 'phaser';
import { HARD_START } from '../game/levels';
import { loadBest, loadPlayerName } from '../game/storage';
import { createTileTextures, MAX_TYPES, TEXTURE_SIZE, tileKey } from '../game/tileArt';
import { exitApp, onBack } from '../native';
import { syncBest } from '../online';
import { iconTexture } from './icons';
import { askPlayerName, nameDialogBack } from './nameDialog';
import { Button, C, onGameResize, showDialog, tapZone, textStyle, type DialogOptions } from './ui';

const HOW_TO_PLAY = [
  'Chạm hai ô có hình giống nhau để nối và xóa chúng.',
  'Đường nối chỉ đi qua ô trống, rẽ tối đa 2 lần và được vòng ra ngoài mép bàn.',
  'Xóa hết các cặp trước khi hết giờ. Mỗi cặp được cộng thêm 1 giây.',
  'Nút bóng đèn (Gợi ý) chỉ ra một cặp nối được, nút mũi tên bắt chéo (Đảo bàn) xáo lại các ô còn lại.',
  `Từ màn ${HARD_START + 1} có đá chắn đường; khi bàn bế tắc, đá sẽ vỡ để mở đường.`,
].join('\n\n');

/**
 * Các ô trang trí lơ lửng hai bên. Chiều rộng màn hình thay đổi nên lưu [khoảng cách từ mép trái, y];
 * bên phải lấy đối xứng.
 */
const DECOR_SIDE: [number, number][] = [[130, 150], [280, 260], [140, 450], [280, 590]];
const DECOR_SIZE = 96;

/** Thẻ tên người chơi ở góc trên bên trái; chạm vào để đổi tên. */
const CHIP_H = 52;
const CHIP_ICON = 26;

export class MenuScene extends Phaser.Scene {
  private dialog: { opts: DialogOptions; close: () => void } | null = null;
  private chip: { destroy(): void }[] = [];

  constructor() {
    super('Menu');
  }

  create(): void {
    this.dialog = null;
    this.chip = [];
    createTileTextures(this);
    this.cameras.main.setBackgroundColor(C.bg).fadeIn(250, 31, 59, 77);
    onGameResize(this, () => this.scene.restart());
    // Nút Back của Android: làm việc của hộp nhập tên hay hộp thoại đang mở, không có hộp nào thì hỏi thoát game
    onBack(this, () => {
      if (nameDialogBack()) return;
      if (this.dialog) this.dialog.opts.back?.();
      else this.confirmExit();
    });

    const W = this.scale.width;
    const x = W / 2;
    this.createDecor([...DECOR_SIDE, ...DECOR_SIDE.map(([dx, y]): [number, number] => [W - dx, y])]);

    this.add.text(x, 150, 'Pairfect', textStyle(120, C.text, 'bold')).setOrigin(0.5);
    this.add.text(x, 245, 'Tile Connect', textStyle(40, C.textAccent, 'bold')).setOrigin(0.5);
    this.add.text(x, 305, `Kỷ lục: ${loadBest()}`, textStyle(30, C.textDim)).setOrigin(0.5);

    new Button(this, x, 420, 420, 96, 'Chơi', () => this.scene.start('Game', { level: 0, score: 0 }), 1, 40);
    new Button(this, x, 530, 420, 80, 'Bảng xếp hạng', () => this.scene.start('Leaderboard'), 1, 32);
    new Button(this, x, 630, 420, 80, 'Cách chơi', () => this.showHowToPlay(), 1, 32);

    this.drawPlayerChip();
    this.drawArtChip();
    // Lần đầu mở game: hỏi tên người chơi để ghi kèm kỷ lục
    if (!loadPlayerName()) this.askName();
  }

  /** Hỏi tên (lần đầu) hoặc đổi tên, rồi vẽ lại thẻ tên và cập nhật tên trên kỷ lục online. */
  private askName(): void {
    void askPlayerName(loadPlayerName()).then((name) => {
      if (!name) return;
      void syncBest();
      if (this.sys.isActive()) this.drawPlayerChip();
    });
  }

  private drawPlayerChip(): void {
    this.chip.forEach((o) => o.destroy());
    this.chip = [];
    const playerName = loadPlayerName();
    if (!playerName) return;
    const x = 24;
    const cy = 24 + CHIP_H / 2;
    const bg = this.add.graphics();
    const name = this.add.text(x + 22, cy, playerName, textStyle(24, C.text, 'bold')).setOrigin(0, 0.5);
    const iconX = name.x + name.width + 12;
    const icon = this.add
      .image(iconX + CHIP_ICON / 2, cy, iconTexture(this, 'edit'))
      .setDisplaySize(CHIP_ICON, CHIP_ICON)
      .setTint(C.iconDim);
    const w = iconX + CHIP_ICON + 18 - x;
    bg.fillStyle(C.panel, 1).fillRoundedRect(x, cy - CHIP_H / 2, w, CHIP_H, CHIP_H / 2);
    const zone = tapZone(this, x + w / 2, cy, w, CHIP_H, 1, () => this.askName());
    this.chip = [bg, name, icon, zone];
  }

  /** Thẻ chọn bộ hình ô ở góc trên bên phải, đối xứng với thẻ tên: một ô của bộ đang dùng kèm chữ "Hình ô". */
  private drawArtChip(): void {
    const right = this.scale.width - 24;
    const cy = 24 + CHIP_H / 2;
    const thumb = CHIP_H - 8;
    const bg = this.add.graphics();
    const label = this.add.text(right - 22, cy, 'Hình ô', textStyle(24, C.text, 'bold')).setOrigin(1, 0.5);
    const x = label.x - label.width - 12 - thumb - 6;
    const w = right - x;
    bg.fillStyle(C.panel, 1).fillRoundedRect(x, cy - CHIP_H / 2, w, CHIP_H, CHIP_H / 2);
    this.add.image(x + 6 + thumb / 2, cy, tileKey(1)).setDisplaySize(thumb, thumb);
    tapZone(this, x + w / 2, cy, w, CHIP_H, 1, () => this.scene.start('TileArt'));
  }

  private showHowToPlay(): void {
    this.openDialog({
      title: 'Cách chơi',
      body: HOW_TO_PLAY,
      width: 900,
      actions: [{ label: 'Đã hiểu', onClick: () => this.closeDialog() }],
      back: () => this.closeDialog(),
    });
  }

  private confirmExit(): void {
    this.openDialog({
      title: 'Thoát game?',
      actions: [
        { label: 'Thoát', onClick: () => exitApp() },
        { label: 'Ở lại', onClick: () => this.closeDialog() },
      ],
      back: () => this.closeDialog(),
    });
  }

  private openDialog(opts: DialogOptions): void {
    this.closeDialog();
    this.dialog = { opts, close: showDialog(this, opts) };
  }

  private closeDialog(): void {
    this.dialog?.close();
    this.dialog = null;
  }

  /** Mỗi lần mở menu chọn ngẫu nhiên 4 loại hình, mỗi loại hai ô (một cặp). */
  private createDecor(positions: [number, number][]): void {
    const types = Phaser.Utils.Array.Shuffle(Phaser.Utils.Array.NumberArray(1, MAX_TYPES) as number[]).slice(0, 4);
    const tiles = Phaser.Utils.Array.Shuffle([...types, ...types]);
    positions.forEach(([x, y], i) => {
      const img = this.add
        .image(x, y, tileKey(tiles[i]))
        .setScale(DECOR_SIZE / TEXTURE_SIZE)
        .setAngle(Phaser.Math.Between(-10, 10))
        .setAlpha(0.9);
      this.tweens.add({
        targets: img,
        y: y + 14,
        angle: -img.angle,
        duration: Phaser.Math.Between(1600, 2400),
        delay: Phaser.Math.Between(0, 600),
        ease: 'Sine.InOut',
        yoyo: true,
        repeat: -1,
      });
    });
  }
}
