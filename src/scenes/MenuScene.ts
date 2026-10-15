import Phaser from 'phaser';
import { loadBest } from '../game/storage';
import { createTileTextures, MAX_TYPES, TEXTURE_SIZE, tileKey } from '../game/tileArt';
import { Button, C, isLandscape, onGameResize, showDialog, textStyle } from './ui';

const HOW_TO_PLAY = [
  'Chạm hai ô có hình giống nhau để nối và xóa chúng.',
  'Đường nối chỉ đi qua ô trống, rẽ tối đa 2 lần và được vòng ra ngoài mép bàn.',
  'Xóa hết các cặp trước khi hết giờ. Mỗi cặp được cộng thêm 1 giây.',
  'Gợi ý chỉ ra một cặp nối được, Đảo bàn xáo lại các ô còn lại.',
].join('\n\n');

/** Vị trí các ô trang trí lơ lửng: trên và dưới (màn dọc), hai bên (màn ngang). */
const DECOR_PORTRAIT: [number, number][] = [
  [110, 150], [270, 105], [450, 125], [610, 165],
  [105, 1135], [265, 1185], [455, 1170], [615, 1125],
];
/** Màn ngang có chiều rộng thay đổi: [khoảng cách từ mép trái, y], bên phải lấy đối xứng. */
const DECOR_LANDSCAPE_SIDE: [number, number][] = [[130, 150], [280, 260], [140, 450], [280, 590]];
const DECOR_SIZE = 96;

/** Tọa độ y của các thành phần; màn ngang thấp hơn nên xếp sát nhau hơn. */
const Y_PORTRAIT = { title: 300, subtitle: 400, best: 470, play: 660, levels: 790, help: 900 };
const Y_LANDSCAPE = { title: 150, subtitle: 245, best: 305, play: 420, levels: 540, help: 640 };

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    createTileTextures(this);
    this.cameras.main.setBackgroundColor(C.bg).fadeIn(250, 31, 59, 77);
    onGameResize(this, () => this.scene.restart());

    const landscape = isLandscape(this);
    const W = this.scale.width;
    const x = W / 2;
    const y = landscape ? Y_LANDSCAPE : Y_PORTRAIT;
    this.createDecor(
      landscape
        ? [...DECOR_LANDSCAPE_SIDE, ...DECOR_LANDSCAPE_SIDE.map(([dx, dy]): [number, number] => [W - dx, dy])]
        : DECOR_PORTRAIT,
    );

    this.add.text(x, y.title, 'Pairfect', textStyle(120, C.text, 'bold')).setOrigin(0.5);
    this.add.text(x, y.subtitle, 'Tile Connect', textStyle(40, C.textAccent, 'bold')).setOrigin(0.5);
    this.add.text(x, y.best, `Kỷ lục: ${loadBest()}`, textStyle(30, C.textDim)).setOrigin(0.5);

    new Button(this, x, y.play, 420, 100, 'Chơi', () => this.scene.start('Game', { level: 0, score: 0 }), 1, 40);
    new Button(this, x, y.levels, 420, 84, 'Chọn màn', () => this.scene.start('Levels'), 1, 32);
    new Button(this, x, y.help, 420, 84, 'Cách chơi', () => this.showHowToPlay(landscape), 1, 32);
  }

  private showHowToPlay(landscape: boolean): void {
    const close = showDialog(this, {
      title: 'Cách chơi',
      body: HOW_TO_PLAY,
      width: landscape ? 900 : 560,
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
