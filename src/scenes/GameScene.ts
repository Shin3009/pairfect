import Phaser from 'phaser';
import { Board, same, type Gravity, type Point } from '../game/Board';
import { getLevel, gravityFor, GRAVITY_LABEL, type LevelConfig } from '../game/levels';
import { createTileTextures, textureFor, TEXTURE_SIZE } from '../game/tileArt';
import { loadBest, saveBest, unlockLevel } from '../game/storage';
import { Button, C, onGameResize, showDialog, textStyle, type DialogOptions } from './ui';

// Thanh HUD phía trên gọn một hàng: màn ngang thấp nên nhường tối đa chiều cao cho bàn chơi.
const HUD_H = 128;
const MARGIN = 12;
/**
 * Bề rộng vòng ô trống quanh bàn (nơi đường nối đi vòng ra ngoài), tính theo cạnh ô.
 * Về logic vòng này vẫn là một hàng/cột ô trống của Board, nhưng chỉ vẽ hẹp lại
 * để ô hình chiếm gần hết chiều ngang màn hình.
 */
const RING = 0.4;
const HINTS_PER_LEVEL = 3;
const SHUFFLES_PER_LEVEL = 3;
const SCORE_PER_PAIR = 10;
const TIME_BONUS_PER_PAIR = 1; // giây cộng thêm mỗi lần ăn cặp

/** Mũi tên chỉ hướng dồn kế tiếp của kiểu Xoay vòng. */
const ARROW: Partial<Record<Gravity, string>> = { down: '↓', left: '←', up: '↑', right: '→' };

export interface SceneData {
  level?: number;
  score?: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class GameScene extends Phaser.Scene {
  private levelIndex = 0;
  private score = 0;
  private cfg!: LevelConfig;
  private board!: Board;

  private sprites: (Phaser.GameObjects.Image | null)[][] = [];
  private cell = 0;
  /** Bề rộng vòng ô trống quanh bàn, tính bằng điểm ảnh (xem RING). */
  private ring = 0;
  /** Góc trên bên trái của bàn, tính cả vòng ô trống. */
  private originX = 0;
  private originY = 0;

  private selected: Point | null = null;
  private hintMove: Point[] | null = null;
  private selectFrame!: Phaser.GameObjects.Graphics;
  private hintFrame!: Phaser.GameObjects.Graphics;
  private pathGfx!: Phaser.GameObjects.Graphics;

  private timeLeft = 0;
  private hints = HINTS_PER_LEVEL;
  private shuffles = SHUFFLES_PER_LEVEL;
  private ended = false;
  private paused = false;
  /** Số cặp đã ăn trong màn; quyết định hướng dồn của kiểu Xoay vòng. */
  private matches = 0;

  /** Mọi đối tượng của HUD, để dựng lại khi kích thước màn hình đổi. */
  private hud: { destroy(): void }[] = [];
  private scoreText!: Phaser.GameObjects.Text;
  private gravityText!: Phaser.GameObjects.Text;
  private timeBar!: Phaser.GameObjects.Graphics;
  private timeBarRect!: Rect;
  private hintBtn!: Button;
  private shuffleBtn!: Button;
  private toastText!: Phaser.GameObjects.Text;
  private dialog: { opts: DialogOptions; close: () => void } | null = null;

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
    this.hintMove = null;
    this.ended = false;
    this.matches = 0;
    this.hud = [];
    this.dialog = null;
  }

  create(): void {
    // Cờ tạm dừng của Clock và TweenManager không tự xóa khi scene khởi động lại
    this.setPaused(false);
    createTileTextures(this);
    this.cameras.main.setBackgroundColor(C.bg);

    this.board = new Board(this.cfg.rows, this.cfg.cols);
    this.board.generate(this.cfg.types, this.cfg.stones ?? 0);

    this.layoutBoard();
    this.createTiles();
    this.createHud();

    this.selectFrame = this.add.graphics().setDepth(5);
    this.hintFrame = this.add.graphics().setDepth(5);
    this.pathGfx = this.add.graphics().setDepth(10);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointer(p));
    this.time.addEvent({ delay: 100, loop: true, callback: () => this.tick(0.1) });
    onGameResize(this, () => this.relayout());
  }

  // ---------------- Bố cục & hiển thị ----------------

  private layoutBoard(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    // Vùng đặt bàn: toàn bộ phần dưới thanh HUD
    const area: Rect = { x: 0, y: HUD_H, w: W, h: H - HUD_H };
    const { rows, cols } = this.board;
    // Mỗi chiều có thêm hai vòng ô trống (mỗi vòng RING cạnh ô) để vẽ đường nối vòng ra ngoài
    this.cell = Math.floor(
      Math.min((area.w - MARGIN * 2) / (cols + 2 * RING), (area.h - MARGIN * 2) / (rows + 2 * RING)),
    );
    this.ring = Math.round(this.cell * RING);
    this.originX = Math.round(area.x + (area.w - (this.cell * cols + this.ring * 2)) / 2);
    this.originY = Math.round(area.y + (area.h - (this.cell * rows + this.ring * 2)) / 2);
  }

  /** Tỉ lệ màn hình đổi giữa màn (chia đôi màn hình, kéo cửa sổ): giữ nguyên trạng thái, chỉ sắp xếp lại bố cục. */
  private relayout(): void {
    this.layoutBoard();

    const scale = (this.cell - 2) / TEXTURE_SIZE;
    for (let r = 1; r <= this.board.rows; r++)
      for (let c = 1; c <= this.board.cols; c++) {
        const img = this.sprites[r][c];
        if (!img) continue;
        // Bỏ dở hiệu ứng đang chạy (xuất hiện, dồn ô, lật hình...) và đặt ô thẳng về trạng thái cuối
        this.tweens.killTweensOf(img);
        const { x, y } = this.cellCenter({ r, c });
        img.setPosition(x, y).setTexture(textureFor(this.board.grid[r][c])).setScale(scale).setAngle(0);
      }
    this.pathGfx.clear();
    this.select(this.selected);
    this.setHint(this.hintMove);

    this.tweens.killTweensOf(this.toastText);
    this.hud.forEach((o) => o.destroy());
    this.hud = [];
    this.createHud();

    if (this.dialog) this.openDialog(this.dialog.opts);
  }

  /** Tâm của ô (r, c) trên màn hình; hàng/cột 0 và rows+1/cols+1 nằm giữa vòng ô trống hẹp. */
  private cellCenter(p: Point): { x: number; y: number } {
    const axis = (i: number, n: number) => {
      if (i <= 0) return this.ring / 2;
      if (i > n) return this.ring + n * this.cell + this.ring / 2;
      return this.ring + (i - 0.5) * this.cell;
    };
    return {
      x: this.originX + axis(p.c, this.board.cols),
      y: this.originY + axis(p.r, this.board.rows),
    };
  }

  private createTiles(): void {
    const { rows, cols } = this.board;
    const size = this.cell - 2;
    this.sprites = Array.from({ length: rows + 2 }, () => new Array(cols + 2).fill(null));
    for (let r = 1; r <= rows; r++)
      for (let c = 1; c <= cols; c++) {
        const v = this.board.grid[r][c];
        if (!v) continue;
        const { x, y } = this.cellCenter({ r, c });
        const img = this.add.image(x, y, textureFor(v)).setDisplaySize(size, size);
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
    const W = this.scale.width;
    const keep = <T extends { destroy(): void }>(o: T): T => {
      this.hud.push(o);
      return o;
    };

    // Thanh HUD trải hết chiều ngang. Trái: màn + kiểu dồn; phải: điểm + kỷ lục.
    keep(this.add.graphics())
      .fillStyle(C.panel, 1)
      .fillRoundedRect(MARGIN, MARGIN, W - MARGIN * 2, HUD_H - MARGIN * 2, 20);
    keep(this.add.text(36, 20, `Màn ${this.levelIndex + 1}`, textStyle(40, C.text, 'bold')));
    this.gravityText = keep(this.add.text(36, 70, '', textStyle(24, C.textDim)));
    this.scoreText = keep(this.add.text(W - 36, 20, '', textStyle(40, C.text, 'bold')).setOrigin(1, 0));
    keep(this.add.text(W - 36, 70, `Kỷ lục: ${loadBest()}`, textStyle(24, C.textDim)).setOrigin(1, 0));

    // Giữa: Gợi ý | nút dừng | Đảo bàn, thanh thời gian ngay bên dưới
    keep(new Button(this, W / 2, 50, 60, 60, 'II', () => this.pause()));
    this.hintBtn = keep(new Button(this, W / 2 - 148, 50, 200, 52, '', () => this.useHint()));
    this.shuffleBtn = keep(new Button(this, W / 2 + 148, 50, 200, 52, '', () => this.useShuffle()));
    this.timeBar = keep(this.add.graphics());
    this.timeBarRect = { x: W / 2 - 248, y: 92, w: 496, h: 12 };

    this.toastText = keep(
      this.add
        .text(W / 2, HUD_H + 30, '', textStyle(28, C.textDark, 'bold'))
        .setOrigin(0.5)
        .setBackgroundColor('#ffc857')
        .setPadding(18, 8, 18, 8)
        .setDepth(20)
        .setAlpha(0),
    );

    this.refreshHud();
  }

  private refreshHud(): void {
    this.scoreText.setText(`${this.score} điểm`);
    this.gravityText.setText(this.gravityLabel());
    this.hintBtn.setLabel(`Gợi ý (${this.hints})`, this.hints > 0);
    this.shuffleBtn.setLabel(`Đảo bàn (${this.shuffles})`, this.shuffles > 0);
    this.drawTimeBar();
  }

  private drawTimeBar(): void {
    const { x, y, w, h } = this.timeBarRect;
    const ratio = Phaser.Math.Clamp(this.timeLeft / this.cfg.time, 0, 1);
    this.timeBar.clear();
    this.timeBar.fillStyle(0x163040, 1).fillRoundedRect(x, y, w, h, 6);
    if (ratio > 0) {
      this.timeBar
        .fillStyle(ratio > 0.25 ? C.timeOk : C.timeLow, 1)
        .fillRoundedRect(x, y, Math.max(h, w * ratio), h, 6);
    }
  }

  /** Tên kiểu dồn trên HUD; kiểu Xoay vòng kèm mũi tên hướng dồn ở lần ăn cặp tới. */
  private gravityLabel(): string {
    const mode = this.cfg.gravity;
    if (mode !== 'rotate') return GRAVITY_LABEL[mode];
    return `${GRAVITY_LABEL.rotate} ${ARROW[gravityFor(mode, this.matches)] ?? ''}`;
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
    if (this.ended || this.paused) return;
    // Chạm vào vòng ô trống cho ra hàng/cột 0 hoặc rows+1/cols+1, bị isInside loại ra
    const c = Math.floor((p.worldX - this.originX - this.ring) / this.cell) + 1;
    const r = Math.floor((p.worldY - this.originY - this.ring) / this.cell) + 1;
    const pt = { r, c };
    // Ô trống và đá không chọn được
    if (!this.board.isInside(pt) || this.board.get(pt) <= 0) return;

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

  private setHint(move: Point[] | null): void {
    this.hintMove = move;
    if (move) this.drawFrame(this.hintFrame, move, C.hint);
    else this.hintFrame.clear();
  }

  private matchPair(a: Point, b: Point, path: Point[]): void {
    this.select(null);
    this.setHint(null);
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
    const moves = this.board.remove(a, b, gravityFor(this.cfg.gravity, this.matches++));
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
        const broken = this.board.shuffle();
        this.syncTextures();
        this.breakStones(broken);
        this.toast(broken.length ? 'Hết nước đi – đá vỡ để mở đường' : 'Hết nước đi – tự động đảo bàn');
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
    this.setHint(move);
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
    this.setHint(null);
    const broken = this.board.shuffle();
    this.syncTextures();
    this.breakStones(broken);
    if (broken.length) this.toast('Đá vỡ để mở đường');
    this.refreshHud();
  }

  /** Sau khi xáo trộn: vị trí ô giữ nguyên, chỉ đổi hình hiển thị (đá đứng yên). */
  private syncTextures(): void {
    for (let r = 1; r <= this.board.rows; r++)
      for (let c = 1; c <= this.board.cols; c++) {
        const img = this.sprites[r][c];
        const v = this.board.grid[r][c];
        if (!img || v <= 0) continue;
        const sx = (this.cell - 2) / TEXTURE_SIZE;
        this.tweens.add({
          targets: img,
          scaleX: 0,
          duration: 120,
          yoyo: true,
          onYoyo: () => img.setTexture(textureFor(v)),
          onComplete: () => img.setScale(sx),
        });
      }
  }

  /** Đá bị phá khi bàn bế tắc (xem Board.shuffle): hiệu ứng vỡ rồi bỏ khỏi bàn. */
  private breakStones(points: Point[]): void {
    for (const p of points) {
      const img = this.sprites[p.r][p.c];
      this.sprites[p.r][p.c] = null;
      if (!img) continue;
      this.tweens.killTweensOf(img);
      this.tweens.add({
        targets: img,
        scaleX: img.scaleX * 1.25,
        scaleY: img.scaleY * 1.25,
        angle: 15,
        alpha: 0,
        duration: 300,
        onComplete: () => img.destroy(),
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
    unlockLevel(this.levelIndex + 1);
    this.refreshHud();
    this.openDialog({
      title: 'Qua màn!',
      body: `Thưởng thời gian: +${bonus}\nTổng: ${this.score} điểm`,
      actions: [
        { label: 'Màn tiếp theo', onClick: () => this.scene.restart({ level: this.levelIndex + 1, score: this.score }) },
        { label: 'Về menu', onClick: () => this.scene.start('Menu') },
      ],
    });
  }

  private loseLevel(): void {
    this.ended = true;
    this.select(null);
    saveBest(this.score);
    this.openDialog({
      title: 'Hết giờ!',
      body: `Bạn đạt ${this.score} điểm`,
      actions: [
        { label: 'Chơi lại', onClick: () => this.scene.restart({ level: this.levelIndex, score: 0 }) },
        { label: 'Về menu', onClick: () => this.scene.start('Menu') },
      ],
    });
  }

  /** Hộp thoại đang mở được ghi lại để dựng lại đúng vị trí khi xoay màn hình. */
  private openDialog(opts: DialogOptions): void {
    this.closeDialog();
    this.dialog = { opts, close: showDialog(this, opts) };
  }

  private closeDialog(): void {
    this.dialog?.close();
    this.dialog = null;
  }

  // ---------------- Tạm dừng ----------------

  /** Dừng đồng hồ đếm giờ, các hiệu ứng và thao tác trên bàn chơi. */
  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.time.paused = paused;
    this.tweens.paused = paused;
  }

  private pause(): void {
    if (this.ended || this.paused) return;
    this.setPaused(true);
    this.openDialog({
      title: 'Tạm dừng',
      shade: 0.92, // che gần kín bàn chơi để không xem trước nước đi khi đang dừng
      actions: [
        {
          label: 'Tiếp tục',
          onClick: () => {
            this.closeDialog();
            this.setPaused(false);
          },
        },
        { label: 'Chơi lại màn', onClick: () => this.leave({ level: this.levelIndex, score: 0 }) },
        { label: 'Về menu', onClick: () => this.leave() },
      ],
    });
  }

  /** Rời màn đang chơi dở: lưu kỷ lục rồi chơi lại màn (có `restart`) hoặc về menu. */
  private leave(restart?: SceneData): void {
    saveBest(this.score);
    if (restart) this.scene.restart(restart);
    else this.scene.start('Menu');
  }
}
