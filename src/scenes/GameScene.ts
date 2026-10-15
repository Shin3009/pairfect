import Phaser from 'phaser';
import { Board, same, type Point } from '../game/Board';
import { getLevel, GRAVITY_LABEL, type LevelConfig } from '../game/levels';
import { createTileTextures, tileKey, TEXTURE_SIZE } from '../game/tileArt';

export const GAME_W = 720;
export const GAME_H = 1280;

const HUD_H = 210;
const MARGIN = 12;
const FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const HINTS_PER_LEVEL = 3;
const SHUFFLES_PER_LEVEL = 3;
const SCORE_PER_PAIR = 10;
const TIME_BONUS_PER_PAIR = 1; // giây cộng thêm mỗi lần ăn cặp

const C = {
  bg: 0x1f3b4d,
  panel: 0x2c5266,
  accent: 0xffc857,
  path: 0xffe066,
  select: 0xffc857,
  hint: 0x7ae582,
  timeOk: 0x7ae582,
  timeLow: 0xe8505b,
  text: '#ffffff',
  textDim: '#b8d0dc',
};

interface SceneData {
  level?: number;
  score?: number;
}

export class GameScene extends Phaser.Scene {
  private levelIndex = 0;
  private score = 0;
  private cfg!: LevelConfig;
  private board!: Board;

  private sprites: (Phaser.GameObjects.Image | null)[][] = [];
  private cell = 0;
  private originX = 0;
  private originY = 0;

  private selected: Point | null = null;
  private selectFrame!: Phaser.GameObjects.Graphics;
  private hintFrame!: Phaser.GameObjects.Graphics;
  private pathGfx!: Phaser.GameObjects.Graphics;

  private timeLeft = 0;
  private hints = HINTS_PER_LEVEL;
  private shuffles = SHUFFLES_PER_LEVEL;
  private ended = false;

  private scoreText!: Phaser.GameObjects.Text;
  private timeBar!: Phaser.GameObjects.Graphics;
  private hintBtn!: Button;
  private shuffleBtn!: Button;
  private toastText!: Phaser.GameObjects.Text;

  constructor() {
    super('Game');
  }

  init(data: SceneData): void {
    this.levelIndex = data.level ?? 0;
    this.score = data.score ?? 0;
    this.cfg = getLevel(this.levelIndex);
    this.timeLeft = this.cfg.time;
    this.hints = HINTS_PER_LEVEL;
    this.shuffles = SHUFFLES_PER_LEVEL;
    this.selected = null;
    this.ended = false;
  }

  create(): void {
    createTileTextures(this);
    this.cameras.main.setBackgroundColor(C.bg);

    this.board = new Board(this.cfg.rows, this.cfg.cols);
    this.board.generate(this.cfg.types);

    this.layoutBoard();
    this.createTiles();
    this.createHud();

    this.selectFrame = this.add.graphics().setDepth(5);
    this.hintFrame = this.add.graphics().setDepth(5);
    this.pathGfx = this.add.graphics().setDepth(10);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointer(p));
    this.time.addEvent({ delay: 100, loop: true, callback: () => this.tick(0.1) });
  }

  // ---------------- Bố cục & hiển thị ----------------

  private layoutBoard(): void {
    const { rows, cols } = this.cfg;
    const availW = GAME_W - MARGIN * 2;
    const availH = GAME_H - HUD_H - MARGIN * 2;
    // +2 vì có viền ngoài để vẽ đường nối vòng
    this.cell = Math.floor(Math.min(availW / (cols + 2), availH / (rows + 2)));
    this.originX = Math.round((GAME_W - this.cell * (cols + 2)) / 2);
    this.originY = Math.round(HUD_H + (GAME_H - HUD_H - this.cell * (rows + 2)) / 2);
  }

  private cellCenter(p: Point): { x: number; y: number } {
    return {
      x: this.originX + (p.c + 0.5) * this.cell,
      y: this.originY + (p.r + 0.5) * this.cell,
    };
  }

  private createTiles(): void {
    const { rows, cols } = this.cfg;
    const size = this.cell - 2;
    this.sprites = Array.from({ length: rows + 2 }, () => new Array(cols + 2).fill(null));
    for (let r = 1; r <= rows; r++)
      for (let c = 1; c <= cols; c++) {
        const v = this.board.grid[r][c];
        if (!v) continue;
        const { x, y } = this.cellCenter({ r, c });
        const img = this.add.image(x, y, tileKey(v)).setDisplaySize(size, size);
        // Hiệu ứng xuất hiện
        img.setScale(0);
        this.tweens.add({
          targets: img,
          scale: size / TEXTURE_SIZE,
          duration: 250,
          delay: (r + c) * 18,
          ease: 'Back.Out',
        });
        this.sprites[r][c] = img;
      }
  }

  private createHud(): void {
    const panel = this.add.graphics();
    panel.fillStyle(C.panel, 1);
    panel.fillRoundedRect(MARGIN, MARGIN, GAME_W - MARGIN * 2, HUD_H - MARGIN * 2, 20);

    this.add.text(36, 30, `Màn ${this.levelIndex + 1}`, textStyle(40, C.text, 'bold'));
    this.add.text(36, 80, GRAVITY_LABEL[this.cfg.gravity], textStyle(24, C.textDim));
    this.scoreText = this.add
      .text(GAME_W - 36, 30, '', textStyle(40, C.text, 'bold'))
      .setOrigin(1, 0);
    this.add
      .text(GAME_W - 36, 80, `Kỷ lục: ${loadBest()}`, textStyle(24, C.textDim))
      .setOrigin(1, 0);

    this.timeBar = this.add.graphics();

    this.hintBtn = new Button(this, 200, 164, 300, 52, '', () => this.useHint());
    this.shuffleBtn = new Button(this, GAME_W - 200, 164, 300, 52, '', () => this.useShuffle());

    this.toastText = this.add
      .text(GAME_W / 2, HUD_H + 30, '', textStyle(28, '#1f3b4d', 'bold'))
      .setOrigin(0.5)
      .setBackgroundColor('#ffc857')
      .setPadding(18, 8, 18, 8)
      .setDepth(20)
      .setAlpha(0);

    this.refreshHud();
  }

  private refreshHud(): void {
    this.scoreText.setText(`${this.score} điểm`);
    this.hintBtn.setLabel(`Gợi ý (${this.hints})`, this.hints > 0);
    this.shuffleBtn.setLabel(`Đảo bàn (${this.shuffles})`, this.shuffles > 0);
    this.drawTimeBar();
  }

  private drawTimeBar(): void {
    const x = 36, y = 116, w = GAME_W - 72, h = 12;
    const ratio = Phaser.Math.Clamp(this.timeLeft / this.cfg.time, 0, 1);
    this.timeBar.clear();
    this.timeBar.fillStyle(0x163040, 1).fillRoundedRect(x, y, w, h, 6);
    if (ratio > 0) {
      this.timeBar
        .fillStyle(ratio > 0.25 ? C.timeOk : C.timeLow, 1)
        .fillRoundedRect(x, y, Math.max(h, w * ratio), h, 6);
    }
  }

  private toast(msg: string): void {
    this.tweens.killTweensOf(this.toastText);
    this.toastText.setText(msg).setAlpha(1);
    this.tweens.add({ targets: this.toastText, alpha: 0, delay: 1200, duration: 400 });
  }

  private drawFrame(g: Phaser.GameObjects.Graphics, points: Point[], color: number): void {
    g.clear();
    g.lineStyle(5, color, 1);
    for (const p of points) {
      const { x, y } = this.cellCenter(p);
      const s = this.cell - 2;
      g.strokeRoundedRect(x - s / 2, y - s / 2, s, s, 10);
    }
  }

  // ---------------- Tương tác ----------------

  private onPointer(p: Phaser.Input.Pointer): void {
    if (this.ended) return;
    const c = Math.floor((p.worldX - this.originX) / this.cell);
    const r = Math.floor((p.worldY - this.originY) / this.cell);
    const pt = { r, c };
    if (!this.board.isInside(pt) || this.board.get(pt) === 0) return;

    if (!this.selected) {
      this.select(pt);
      return;
    }
    if (same(this.selected, pt)) {
      this.select(null);
      return;
    }

    const path = this.board.findPath(this.selected, pt);
    if (path) {
      this.matchPair(this.selected, pt, path);
    } else {
      // Không nối được: chuyển chọn sang ô mới
      this.select(pt);
    }
  }

  private select(p: Point | null): void {
    this.selected = p;
    if (p) this.drawFrame(this.selectFrame, [p], C.select);
    else this.selectFrame.clear();
  }

  private matchPair(a: Point, b: Point, path: Point[]): void {
    this.select(null);
    this.hintFrame.clear();
    this.drawPath(path);

    // Ẩn hai ô vừa ăn
    for (const p of [a, b]) {
      const img = this.sprites[p.r][p.c];
      this.sprites[p.r][p.c] = null;
      if (img) {
        this.tweens.killTweensOf(img);
        this.tweens.add({
          targets: img,
          scale: 0,
          alpha: 0,
          duration: 220,
          delay: 120,
          onComplete: () => img.destroy(),
        });
      }
    }

    // Cập nhật logic + dồn ô
    const moves = this.board.remove(a, b, this.cfg.gravity);
    const moving = moves.map((m) => this.sprites[m.from.r][m.from.c]);
    moves.forEach((m) => (this.sprites[m.from.r][m.from.c] = null));
    moves.forEach((m, i) => {
      const img = moving[i];
      this.sprites[m.to.r][m.to.c] = img;
      if (!img) return;
      const { x, y } = this.cellCenter(m.to);
      this.tweens.add({ targets: img, x, y, duration: 180, delay: 200, ease: 'Quad.Out' });
    });

    this.score += SCORE_PER_PAIR;
    this.timeLeft = Math.min(this.cfg.time, this.timeLeft + TIME_BONUS_PER_PAIR);
    this.refreshHud();

    if (this.board.isCleared()) {
      this.time.delayedCall(450, () => this.winLevel());
    } else if (!this.board.hasMove()) {
      this.time.delayedCall(450, () => {
        if (this.ended) return;
        this.board.shuffle();
        this.syncTextures();
        this.toast('Hết nước đi – tự động đảo bàn');
      });
    }
  }

  private drawPath(path: Point[]): void {
    const g = this.pathGfx;
    this.tweens.killTweensOf(g);
    g.clear().setAlpha(1);
    g.lineStyle(8, C.path, 1);
    g.beginPath();
    path.forEach((p, i) => {
      const { x, y } = this.cellCenter(p);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.strokePath();
    this.tweens.add({ targets: g, alpha: 0, delay: 200, duration: 200 });
  }

  private useHint(): void {
    if (this.ended || this.hints <= 0) return;
    const move = this.board.findAnyMove();
    if (!move) return;
    this.hints--;
    this.drawFrame(this.hintFrame, move, C.hint);
    for (const p of move) {
      const img = this.sprites[p.r][p.c];
      if (img) this.tweens.add({ targets: img, angle: { from: -8, to: 8 }, duration: 80, yoyo: true, repeat: 3, onComplete: () => img.setAngle(0) });
    }
    this.refreshHud();
  }

  private useShuffle(): void {
    if (this.ended || this.shuffles <= 0) return;
    this.shuffles--;
    this.select(null);
    this.hintFrame.clear();
    this.board.shuffle();
    this.syncTextures();
    this.refreshHud();
  }

  /** Sau khi xáo trộn: vị trí ô giữ nguyên, chỉ đổi hình hiển thị. */
  private syncTextures(): void {
    for (let r = 1; r <= this.cfg.rows; r++)
      for (let c = 1; c <= this.cfg.cols; c++) {
        const img = this.sprites[r][c];
        const v = this.board.grid[r][c];
        if (!img || !v) continue;
        const sx = (this.cell - 2) / TEXTURE_SIZE;
        this.tweens.add({
          targets: img,
          scaleX: 0,
          duration: 120,
          yoyo: true,
          onYoyo: () => img.setTexture(tileKey(v)),
          onComplete: () => img.setScale(sx),
        });
      }
  }

  // ---------------- Thời gian & kết thúc ----------------

  private tick(dt: number): void {
    if (this.ended) return;
    this.timeLeft -= dt;
    this.drawTimeBar();
    if (this.timeLeft <= 0) this.loseLevel();
  }

  private winLevel(): void {
    if (this.ended) return;
    this.ended = true;
    const bonus = Math.ceil(this.timeLeft) * 2;
    this.score += bonus;
    saveBest(this.score);
    this.refreshHud();
    this.showOverlay('Qua màn!', `Thưởng thời gian: +${bonus}\nTổng: ${this.score} điểm`, 'Màn tiếp theo', () =>
      this.scene.restart({ level: this.levelIndex + 1, score: this.score }),
    );
  }

  private loseLevel(): void {
    this.ended = true;
    this.select(null);
    saveBest(this.score);
    this.showOverlay('Hết giờ!', `Bạn đạt ${this.score} điểm`, 'Chơi lại', () =>
      this.scene.restart({ level: 0, score: 0 }),
    );
  }

  private showOverlay(title: string, body: string, action: string, onAction: () => void): void {
    const shade = this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.55).setOrigin(0).setDepth(30);
    shade.setInteractive(); // chặn click xuống bàn chơi
    const panel = this.add.graphics().setDepth(31);
    panel.fillStyle(0xfffaf0, 1).fillRoundedRect(80, 460, GAME_W - 160, 360, 28);
    this.add.text(GAME_W / 2, 520, title, textStyle(56, '#1f3b4d', 'bold')).setOrigin(0.5, 0).setDepth(32);
    this.add
      .text(GAME_W / 2, 610, body, { ...textStyle(30, '#2c5266'), align: 'center' })
      .setOrigin(0.5, 0)
      .setDepth(32);
    new Button(this, GAME_W / 2, 750, 320, 70, action, onAction, 32);
  }
}

// ---------------- Tiện ích ----------------

function textStyle(size: number, color: string, weight = 'normal'): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: weight, resolution: 2 };
}

const BEST_KEY = 'pairfect-best';

function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(score: number): void {
  try {
    if (score > loadBest()) localStorage.setItem(BEST_KEY, String(score));
  } catch {
    /* bỏ qua nếu trình duyệt chặn lưu trữ */
  }
}

/** Nút bấm đơn giản: nền bo góc + chữ. */
class Button {
  private bg: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
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
  ) {
    this.bg = scene.add.graphics().setDepth(depth);
    this.label = scene.add.text(x, y, text, textStyle(28, '#1f3b4d', 'bold')).setOrigin(0.5).setDepth(depth);
    const zone = scene.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).setDepth(depth);
    zone.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      if (this.enabled) onClick();
    });
    this.draw();
  }

  setLabel(text: string, enabled: boolean): void {
    this.label.setText(text);
    this.enabled = enabled;
    this.draw();
  }

  private draw(): void {
    this.bg.clear();
    this.bg.fillStyle(this.enabled ? C.accent : 0x6b8796, 1);
    this.bg.fillRoundedRect(this.x - this.w / 2, this.y - this.h / 2, this.w, this.h, this.h / 2);
    this.label.setAlpha(this.enabled ? 1 : 0.6);
  }
}
