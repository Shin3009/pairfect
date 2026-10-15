import Phaser from 'phaser';
import { LEADERBOARD_SIZE, loadLeaderboard } from '../game/storage';
import { onBack } from '../native';
import { Button, C, onGameResize, textStyle } from './ui';

const PANEL_W = 760;
const PANEL_TOP = 120;
const HEADER_Y = 152;
const FIRST_ROW_Y = 206;
const ROW_H = 38;
const PANEL_BOTTOM = FIRST_ROW_Y + (LEADERBOARD_SIZE - 0.5) * ROW_H + 16;

/** Các cột của bảng: vị trí x so với giữa màn hình và điểm neo của chữ (0.5 giữa, 1 căn phải). */
const COLS = [
  { title: 'Hạng', dx: -300, origin: 0.5 },
  { title: 'Điểm', dx: -60, origin: 1 },
  { title: 'Màn', dx: 80, origin: 0.5 },
  { title: 'Ngày', dx: 330, origin: 1 },
];

function formatDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Bảng xếp hạng: các lượt chơi điểm cao nhất, mỗi lượt kèm màn đang chơi lúc thua. */
export class LeaderboardScene extends Phaser.Scene {
  constructor() {
    super('Leaderboard');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(C.bg).fadeIn(250, 31, 59, 77);
    onGameResize(this, () => this.scene.restart());
    onBack(this, () => this.back());

    const x = this.scale.width / 2;
    const entries = loadLeaderboard();

    this.add.text(x, 62, 'Bảng xếp hạng', textStyle(56, C.text, 'bold')).setOrigin(0.5);

    const panel = this.add.graphics();
    panel.fillStyle(C.panel, 1).fillRoundedRect(x - PANEL_W / 2, PANEL_TOP, PANEL_W, PANEL_BOTTOM - PANEL_TOP, 24);

    if (entries.length === 0) {
      this.add
        .text(x, (PANEL_TOP + PANEL_BOTTOM) / 2, 'Chưa có lượt chơi nào.\nĐiểm được ghi khi bạn hết giờ hoặc hết nước đi.', {
          ...textStyle(28, C.textDim),
          align: 'center',
          lineSpacing: 10,
        })
        .setOrigin(0.5);
    } else {
      for (const col of COLS)
        this.add.text(x + col.dx, HEADER_Y, col.title, textStyle(22, C.textDim, 'bold')).setOrigin(col.origin, 0.5);
      panel.fillStyle(C.bg, 1).fillRect(x - PANEL_W / 2 + 32, HEADER_Y + 22, PANEL_W - 64, 2);

      entries.forEach((e, i) => {
        const y = FIRST_ROW_Y + i * ROW_H;
        // Ba hạng đầu tô màu nhấn
        const color = i < 3 ? C.textAccent : C.text;
        const cells = [String(i + 1), String(e.score), String(e.stage), formatDate(e.date)];
        cells.forEach((text, j) =>
          this.add
            .text(x + COLS[j].dx, y, text, textStyle(26, j === 3 ? C.textDim : color, j < 2 ? 'bold' : 'normal'))
            .setOrigin(COLS[j].origin, 0.5),
        );
      });
    }

    new Button(this, x, 652, 320, 76, 'Quay lại', () => this.back(), 1, 30);
  }

  private back(): void {
    this.scene.start('Menu');
  }
}
