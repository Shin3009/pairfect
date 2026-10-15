import Phaser from 'phaser';
import { HARD_START } from '../game/levels';
import { loadBest } from '../game/storage';
import { createTileTextures, MAX_TYPES, TEXTURE_SIZE, tileKey } from '../game/tileArt';
import { Button, C, onGameResize, showDialog, textStyle } from './ui';

const HOW_TO_PLAY = [
  'Chạm hai ô có hình giống nhau để nối và xóa chúng.',
  'Đường nối chỉ đi qua ô trống, rẽ tối đa 2 lần và được vòng ra ngoài mép bàn.',
  'Xóa hết các cặp trước khi hết giờ. Mỗi cặp được cộng thêm 1 giây.',
  'Gợi ý chỉ ra một cặp nối được, Đảo bàn xáo lại các ô còn lại.',
  `Từ màn ${HARD_START + 1} có đá chắn đường; khi bàn bế tắc, đá sẽ vỡ để mở đường.`,
].join('\n\n');

/**
 * Các ô trang trí lơ lửng hai bên. Chiều rộng màn hình thay đổi nên lưu [khoảng cách từ mép trái, y];
 * bên phải lấy đối xứng.
 */
const DECOR_SIDE: [number, number][] = [[130, 150], [280, 260], [140, 450], [280, 590]];
const DECOR_SIZE = 96;

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    createTileTextures(this);
    this.cameras.main.setBackgroundColor(C.bg).fadeIn(250, 31, 59, 77);
    onGameResize(this, () => this.scene.restart());

    const W = this.scale.width;
    const x = W / 2;
    this.createDecor([...DECOR_SIDE, ...DECOR_SIDE.map(([dx, y]): [number, number] => [W - dx, y])]);

    this.add.text(x, 150, 'Pairfect', textStyle(120, C.text, 'bold')).setOrigin(0.5);
    this.add.text(x, 245, 'Tile Connect', textStyle(40, C.textAccent, 'bold')).setOrigin(0.5);
    this.add.text(x, 305, `Kỷ lục: ${loadBest()}`, textStyle(30, C.textDim)).setOrigin(0.5);

    new Button(this, x, 420, 420, 100, 'Chơi', () => this.scene.start('Game', { level: 0, score: 0 }), 1, 40);
    new Button(this, x, 540, 420, 84, 'Chọn màn', () => this.scene.start('Levels'), 1, 32);
    new Button(this, x, 640, 420, 84, 'Cách chơi', () => this.showHowToPlay(), 1, 32);
  }

  private showHowToPlay(): void {
    const close = showDialog(this, {
      title: 'Cách chơi',
      body: HOW_TO_PLAY,
      width: 900,
      actions: [{ label: 'Đã hiểu', onClick: () => close() }],
    });
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
