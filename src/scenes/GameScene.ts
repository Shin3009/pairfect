import Phaser from 'phaser';
import { audible, nextCombo, pitchStep } from '../audio/rules';
import { playHit, playSfx, soundSettings, startMusic, stopMusic, toggleMute } from '../audio/sound';
import { Board, same, STONE, type Gravity, type Move, type Point } from '../game/Board';
import { getLevel, gravityFor, GRAVITY_LABEL, type LevelConfig } from '../game/levels';
import { createTileTextures, ensureTileTextures, MAX_TYPES, textureFor, textureHeight, TEXTURE_SIZE } from '../game/tileArt';
import { POINTS_PER_SECOND_LEFT, SCORE_PER_PAIR } from '../game/scoring';
import {
  addToLeaderboard,
  clearSavedGame,
  rankFor,
  saveGame,
  type LoseReason,
  type SavedGame,
  type SavedPlay,
} from '../game/storage';
import { onBack, onSuspend } from '../native';
import { syncBest } from '../online';
import { FOG_MS, type AttackKind, type HitEffect } from '../pvp/attacks';
import { PVP_HINTS, PVP_SHUFFLES, type Match, type Outcome } from '../pvp/match';
import type { PvpSession } from '../pvp/session';
import { Button, C, IconButton, onGameResize, showDialog, textStyle, type DialogOptions } from './ui';

/**
 * Thanh HUD mỏng một hàng phía trên, nhường tối đa chiều cao cho bàn chơi:
 * [Màn][Kiểu dồn][Gợi ý][Đảo bàn][Dừng][Loa][Thanh thời gian][Điểm].
 * Đấu online: [Số cặp còn lại][Kiểu dồn][Gợi ý][Đảo bàn][Đầu hàng][Loa][Thanh thời gian][Tên, số cặp và bàn thu nhỏ của đối thủ].
 * Gợi ý (bóng đèn) và Đảo bàn (mũi tên bắt chéo) là nút biểu tượng, số lượt còn lại hiện ở huy hiệu góc nút.
 * Loa tắt / bật lại mọi âm thanh (xem audio/rules.muteToggled), không có huy hiệu.
 * Kỷ lục (điểm cao nhất trên bảng xếp hạng) không hiện trong HUD, chỉ hiện ở menu.
 */
const HUD_H = 80;
/** Cạnh các nút vuông trên HUD. */
const HUD_BTN = 44;
/** Chỗ dành sẵn cho điểm ở góc phải, để thanh thời gian không co giãn khi điểm tăng. */
const SCORE_W = 160;
/** Đấu online: chỗ dành cho đối thủ ở góc phải, và khung tối đa của bàn thu nhỏ của họ. */
const OPP_W = 320;
const MINI_W = 120;
const MINI_H = 46;
const MARGIN = 12;
/**
 * Bề rộng vòng ô trống quanh bàn (nơi đường nối đi vòng ra ngoài), tính theo cạnh ô.
 * Về logic vòng này vẫn là một hàng/cột ô trống của Board, nhưng chỉ vẽ hẹp lại
 * để ô hình chiếm gần hết chiều ngang màn hình.
 */
const RING = 0.4;
/**
 * Ô cao nhất bao nhiêu lần bề rộng. Bàn chơi rộng và thấp nên trên màn hình không quá dài
 * (máy tính bảng 5:3, 16:10) ô vuông chạm hai mép trái phải mà trên dưới còn trống nhiều:
 * khi đó ô được kéo cao lên (như quân mạt chược) để lấp chỗ trống. Hình trên ô vẫn giữ vuông.
 */
const MAX_TILE_ASPECT = 1.25;
/** Lượt Gợi ý / Đảo bàn được cộng thêm khi vào mỗi màn; lượt chưa dùng mang sang màn sau. */
const HINTS_PER_LEVEL = 3;
const SHUFFLES_PER_LEVEL = 3;
/** Số lần được chơi lại màn vừa thua trong cả lượt chơi; hết thì thua là kết thúc lượt chơi. */
const RETRIES_PER_RUN = 3;
// Điểm mỗi cặp và điểm thưởng thời gian nằm trong game/scoring.ts (firestore.rules dựa vào chúng)
const TIME_BONUS_PER_PAIR = 1; // giây cộng thêm mỗi lần ăn cặp
/**
 * Khoảng lưu màn đang chơi dở, ngoài các lần lưu khi vào màn, tạm dừng (cả khi app xuống nền), thắng, thua.
 * App bị tắt ngang (lỗi, hết pin) thì mất tối đa chừng này thời gian chơi.
 */
const AUTOSAVE_MS = 1000;

/** Mũi tên chỉ hướng dồn kế tiếp của kiểu Xoay vòng. */
const ARROW: Partial<Record<Gravity, string>> = { down: '↓', left: '←', up: '↑', right: '→' };

const LOSE_TEXT: Record<LoseReason, { title: string; reason?: string }> = {
  time: { title: 'Hết giờ!' },
  moves: { title: 'Hết nước đi!', reason: 'Không còn cặp nào nối được và đã hết lượt Đảo bàn.' },
};

/**
 * Dữ liệu vào màn (xem SavedGame): điểm, lượt mang sang, lượt chơi lại, và màn chơi dở khi chơi tiếp từ bản lưu.
 * Trường bỏ trống là của lượt chơi mới: 0 điểm, không lượt mang sang, RETRIES_PER_RUN lượt chơi lại.
 * Có `pvp` là đấu online: chơi trận hiện tại của phiên (pvp.match), các trường khác bị bỏ qua.
 */
export type SceneData = Partial<SavedGame> & { pvp?: PvpSession };

/** Đấu online: thông báo khi mình đánh đối thủ (sau "Chuỗi N!") và khi bị đối thủ đánh. */
const ATTACK_SENT: Record<AttackKind, (opp: string) => string> = {
  stone: (opp) => `Thả đá lên bàn ${opp}`,
  tilt: (opp) => `Nghiêng bàn của ${opp}`,
  fog: (opp) => `Che mắt ${opp}`,
  shuffle: (opp) => `Đảo bàn của ${opp}`,
};
const ATTACK_TAKEN: Record<AttackKind, (opp: string) => string> = {
  stone: (opp) => `${opp} thả đá lên bàn bạn!`,
  tilt: (opp) => `${opp} nghiêng bàn của bạn!`,
  fog: (opp) => `${opp} che mắt bạn!`,
  shuffle: (opp) => `${opp} đảo bàn của bạn!`,
};

/** Câu giải thích kết quả trận đấu online. */
function outcomeText(o: Outcome, opp: string): string {
  switch (o.why) {
    case 'clear':
      return o.result === 'win' ? 'Bạn dọn sạch bàn trước!' : o.result === 'lose' ? `${opp} dọn sạch bàn trước.` : 'Hai bên dọn sạch bàn cùng lúc.';
    case 'time':
      return o.result === 'win'
        ? 'Hết giờ, bạn còn ít cặp hơn.'
        : o.result === 'lose'
          ? `Hết giờ, ${opp} còn ít cặp hơn.`
          : 'Hết giờ, hai bên còn bằng số cặp.';
    case 'surrender':
      return o.result === 'win' ? `${opp} đã đầu hàng.` : 'Bạn đã đầu hàng.';
    case 'left':
      return `${opp} đã rời trận hoặc mất kết nối.`;
    case 'cheat':
      // Thường là do hai máy khác phiên bản game (bàn không còn khớp nhau)
      return o.result === 'win'
        ? `Máy của ${opp} gửi nước đi không hợp lệ.`
        : `Máy của ${opp} báo nước đi của bạn không hợp lệ. Hãy cập nhật game.`;
  }
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface OpponentHud {
  gfx: Phaser.GameObjects.Graphics;
  pairs: Phaser.GameObjects.Text;
  x: number;
  y: number;
  cell: number;
}

export class GameScene extends Phaser.Scene {
  private levelIndex = 0;
  private score = 0;
  private cfg!: LevelConfig;
  private board!: Board;

  private sprites: (Phaser.GameObjects.Image | null)[][] = [];
  /** Cỡ một ô trên màn hình; ô có thể cao hơn rộng (xem MAX_TILE_ASPECT). */
  private cellW = 0;
  private cellH = 0;
  /** Chiều cao texture ô đang dùng (rộng luôn là TEXTURE_SIZE), khớp tỉ lệ cellH / cellW. */
  private texH = TEXTURE_SIZE;
  /** Bề rộng vòng ô trống quanh bàn ở cạnh trái/phải và trên/dưới, tính bằng điểm ảnh (xem RING). */
  private ringX = 0;
  private ringY = 0;
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
  private retries = RETRIES_PER_RUN;
  /** Chỗ vào màn (không có `play`): để chơi lại màn đúng như lúc mới vào, và là phần đầu của bản lưu. */
  private entry!: SavedGame;
  /** Màn chơi dở đọc từ bản lưu, nạp vào bàn trong create(). */
  private resumePlay: SavedPlay | null = null;
  /** Đã thua màn (đang hiện hộp thoại thua), để bản lưu dựng lại đúng hộp thoại đó. */
  private lost: LoseReason | null = null;
  private ended = false;
  /** Đã ghi lượt chơi lên bảng xếp hạng: chạm hai lần cùng lúc không ghi hai dòng. */
  private recorded = false;
  private paused = false;
  /** Số cặp đã ăn trong màn; quyết định hướng dồn của kiểu Xoay vòng. */
  private matches = 0;
  /** Chơi một mình: độ dài chuỗi và lúc ăn cặp gần nhất (Date.now()), để tiếng nối cặp cao dần (xem audio/rules). */
  private combo = 0;
  private comboAt: number | null = null;
  /** Đấu online: đã phát tiếng thắng / thua của trận này (hộp kết quả mở lại nhiều lần). */
  private resultSounded = false;

  /**
   * Đấu online: phiên và trận đang chơi; null khi chơi một mình. Bàn của trận (match.me.board) chính là this.board,
   * nhưng mọi thay đổi trên bàn đi qua match (play / shuffle) để được gửi cho đối thủ.
   */
  private pvp: PvpSession | null = null;
  private match: Match | null = null;
  /** Đấu online: đã hết đếm ngược và hiện các ô. */
  private started = false;

  /** Mọi đối tượng của HUD, để dựng lại khi kích thước màn hình đổi. */
  private hud: { destroy(): void }[] = [];
  /** Số màn, hoặc số cặp còn lại khi đấu online. */
  private stageText!: Phaser.GameObjects.Text;
  private scoreText: Phaser.GameObjects.Text | null = null;
  /** Đấu online: bàn thu nhỏ (góc trên bên trái ở x, y; cạnh ô `cell`) và số cặp còn lại của đối thủ. */
  private opp: OpponentHud | null = null;
  /** Đấu online: số đếm ngược giữa màn hình lúc bắt đầu trận. */
  private countdownText: Phaser.GameObjects.Text | null = null;
  /** Đấu online: bị che mắt tới lúc này (Date.now()), và lớp che phủ kín bàn chơi đang hiện. */
  private fogUntil = 0;
  private fogCover: { destroy(): void }[] = [];
  private gravityArrow: Phaser.GameObjects.Text | null = null;
  private timeBar!: Phaser.GameObjects.Graphics;
  private timeBarRect!: Rect;
  private hintBtn!: IconButton;
  private shuffleBtn!: IconButton;
  private muteBtn!: IconButton;
  private toastText!: Phaser.GameObjects.Text;
  private dialog: { opts: DialogOptions; close: () => void } | null = null;

  constructor() {
    super('Game');
  }

  init(data: SceneData): void {
    this.entry = {
      level: data.level ?? 0,
      score: data.score ?? 0,
      hints: data.hints ?? 0,
      shuffles: data.shuffles ?? 0,
      retries: data.retries ?? RETRIES_PER_RUN,
    };
    this.resumePlay = data.play ?? null;
    this.match = data.pvp?.match ?? null;
    this.pvp = this.match ? data.pvp! : null;
    this.started = false;
    this.fogUntil = 0;
    this.fogCover = [];
    this.levelIndex = this.entry.level;
    this.score = this.entry.score;
    this.cfg = this.match ? this.match.cfg : getLevel(this.levelIndex);
    this.timeLeft = this.cfg.time;
    this.hints = this.match ? PVP_HINTS : this.entry.hints + HINTS_PER_LEVEL;
    this.shuffles = this.match ? PVP_SHUFFLES : this.entry.shuffles + SHUFFLES_PER_LEVEL;
    this.retries = this.entry.retries;
    this.lost = null;
    this.selected = null;
    this.hintMove = null;
    this.ended = false;
    this.recorded = false;
    this.matches = 0;
    this.combo = 0;
    this.comboAt = null;
    this.resultSounded = false;
    this.hud = [];
    this.dialog = null;
  }

  create(): void {
    // Cờ tạm dừng của Clock và TweenManager không tự xóa khi scene khởi động lại
    this.setPaused(false);
    createTileTextures(this);
    this.cameras.main.setBackgroundColor(C.bg);

    let play: SavedPlay | null = null;
    if (this.match) {
      this.board = this.match.me.board;
    } else {
      this.board = new Board(this.cfg.rows, this.cfg.cols);
      // Chơi tiếp màn đang lưu dở. Bàn đã lưu không khớp màn (bản cập nhật game đổi các màn) thì chơi màn này từ đầu
      play = this.resumePlay && this.board.load(this.resumePlay.grid, MAX_TYPES) ? this.resumePlay : null;
      if (play) this.restore(play);
      else this.board.generate(this.cfg.types, this.cfg.stones ?? 0);
    }

    this.layoutBoard();
    // Đấu online: các ô chỉ hiện khi hết đếm ngược (xem tickPvp), để không ai xem trước bàn
    this.sprites = Array.from({ length: this.board.rows + 2 }, () => new Array(this.board.cols + 2).fill(null));
    if (!this.match) this.createTiles();
    this.createHud();

    this.selectFrame = this.add.graphics().setDepth(5);
    this.hintFrame = this.add.graphics().setDepth(5);
    this.pathGfx = this.add.graphics().setDepth(10);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointer(p));
    this.time.addEvent({ delay: 100, loop: true, callback: () => this.tick(0.1) });
    onGameResize(this, () => this.relayout());
    if (this.match) {
      this.startPvp(this.pvp!, this.match);
      return;
    }
    // Thắng / thua đã lưu lúc kết thúc màn, không lưu đè
    this.time.addEvent({
      delay: AUTOSAVE_MS,
      loop: true,
      callback: () => {
        if (!this.ended) this.saveProgress();
      },
    });
    // Nút Back của Android: làm việc của hộp thoại đang mở, không có hộp thoại thì tạm dừng
    onBack(this, () => (this.dialog ? this.dialog.opts.back?.() : this.pause()));
    // App bị đưa xuống nền: tạm dừng (và lưu), để khi quay lại đồng hồ không chạy tiếp ngay,
    // còn nếu app bị tắt hẳn (vuốt khỏi danh sách app gần đây) thì vẫn chơi tiếp được từ menu
    onSuspend(this, () => this.pause());

    if (play?.lost) {
      // App bị tắt lúc đang hiện hộp thoại thua: hiện lại đúng hộp thoại đó, không phát lại tiếng thua
      this.loseLevel(play.lost, true);
      return;
    }
    // Sang màn sau hay chơi lại màn thì nhạc đang phát chạy tiếp (xem audio/sound.ts)
    startMusic();
    // Bản lưu có thể rơi đúng lúc bàn vừa dọn sạch hay vừa bế tắc, trước khi kịp qua màn / tự đảo bàn
    if (play) this.checkBoard();
    this.saveProgress();
  }

  /** Lấy lại trạng thái màn chơi dở từ bản lưu (bàn đã nạp xong bằng Board.load). */
  private restore(play: SavedPlay): void {
    this.score = play.score;
    this.hints = play.hints;
    this.shuffles = play.shuffles;
    this.timeLeft = Math.min(play.timeLeft, this.cfg.time);
    this.matches = play.matches;
  }

  /**
   * Lưu lượt chơi để chơi tiếp được từ menu, kể cả khi app bị tắt ngang: chỗ vào màn kèm màn đang chơi dở.
   * Gọi khi vào màn, mỗi AUTOSAVE_MS, khi tạm dừng (cả khi app xuống nền), khi thua và khi về menu.
   */
  private saveProgress(): void {
    // Trận đấu online không lưu, và không được đè lên lượt chơi một mình đang lưu
    if (this.match) return;
    saveGame({
      ...this.entry,
      play: {
        score: this.score,
        hints: this.hints,
        shuffles: this.shuffles,
        timeLeft: this.timeLeft,
        matches: this.matches,
        grid: this.board.grid,
        ...(this.lost ? { lost: this.lost } : {}),
      },
    });
  }

  // ---------------- Bố cục & hiển thị ----------------

  private layoutBoard(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    // Vùng đặt bàn: toàn bộ phần dưới thanh HUD
    const area: Rect = { x: 0, y: HUD_H, w: W, h: H - HUD_H };
    const { rows, cols } = this.board;
    // Mỗi chiều có thêm hai vòng ô trống (mỗi vòng RING cạnh ô) để vẽ đường nối vòng ra ngoài
    const fitW = (area.w - MARGIN * 2) / (cols + 2 * RING);
    const fitH = (area.h - MARGIN * 2) / (rows + 2 * RING);
    this.cellW = Math.floor(Math.min(fitW, fitH));
    // Còn dư chiều cao thì kéo ô cao lên; texture cao theo bậc nên tỉ lệ làm tròn xuống theo texture
    this.texH = textureHeight(Math.min(MAX_TILE_ASPECT, fitH / this.cellW));
    this.cellH = Math.floor((this.cellW * this.texH) / TEXTURE_SIZE);
    ensureTileTextures(this, this.texH);
    this.ringX = Math.round(this.cellW * RING);
    this.ringY = Math.round(this.cellH * RING);
    this.originX = Math.round(area.x + (area.w - (this.cellW * cols + this.ringX * 2)) / 2);
    this.originY = Math.round(area.y + (area.h - (this.cellH * rows + this.ringY * 2)) / 2);
  }

  /** Tỉ lệ phóng (đều hai chiều) của texture ô: chừa 1 điểm ảnh mỗi bên giữa hai ô cạnh nhau. */
  private tileScale(): number {
    return (this.cellW - 2) / TEXTURE_SIZE;
  }

  /** Tỉ lệ màn hình đổi giữa màn (chia đôi màn hình, kéo cửa sổ): giữ nguyên trạng thái, chỉ sắp xếp lại bố cục. */
  private relayout(): void {
    this.layoutBoard();

    const scale = this.tileScale();
    for (let r = 1; r <= this.board.rows; r++)
      for (let c = 1; c <= this.board.cols; c++) {
        const img = this.sprites[r][c];
        if (!img) continue;
        // Bỏ dở hiệu ứng đang chạy (xuất hiện, dồn ô, lật hình...) và đặt ô thẳng về trạng thái cuối
        this.tweens.killTweensOf(img);
        const { x, y } = this.cellCenter({ r, c });
        img.setPosition(x, y).setTexture(textureFor(this.board.grid[r][c], this.texH)).setScale(scale).setAngle(0);
      }
    this.pathGfx.clear();
    this.select(this.selected);
    this.setHint(this.hintMove);
    this.drawFog();

    this.tweens.killTweensOf(this.toastText);
    this.hud.forEach((o) => o.destroy());
    this.hud = [];
    this.createHud();

    if (this.dialog) this.openDialog(this.dialog.opts);
  }

  /** Tâm của ô (r, c) trên màn hình; hàng/cột 0 và rows+1/cols+1 nằm giữa vòng ô trống hẹp. */
  private cellCenter(p: Point): { x: number; y: number } {
    const axis = (i: number, n: number, cell: number, ring: number) => {
      if (i <= 0) return ring / 2;
      if (i > n) return ring + n * cell + ring / 2;
      return ring + (i - 0.5) * cell;
    };
    return {
      x: this.originX + axis(p.c, this.board.cols, this.cellW, this.ringX),
      y: this.originY + axis(p.r, this.board.rows, this.cellH, this.ringY),
    };
  }

  private createTiles(): void {
    const { rows, cols } = this.board;
    this.sprites = Array.from({ length: rows + 2 }, () => new Array(cols + 2).fill(null));
    for (let r = 1; r <= rows; r++)
      for (let c = 1; c <= cols; c++) {
        const v = this.board.grid[r][c];
        if (!v) continue;
        const { x, y } = this.cellCenter({ r, c });
        // Hiệu ứng xuất hiện
        const img = this.add.image(x, y, textureFor(v, this.texH)).setScale(0);
        this.tweens.add({
          targets: img,
          scale: this.tileScale(),
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

    const cy = HUD_H / 2; // giữa thanh HUD

    keep(this.add.graphics())
      .fillStyle(C.panel, 1)
      .fillRoundedRect(MARGIN, MARGIN, W - MARGIN * 2, HUD_H - MARGIN * 2, 16);

    // Xếp từ trái sang phải theo bề rộng thật của chữ; thanh thời gian lấp phần còn lại
    let x = 32;
    const label = this.match ? this.pairsText(this.match.me.pairsLeft()) : `Màn ${this.levelIndex + 1}`;
    const stage = keep(this.add.text(x, cy, label, textStyle(28, C.text, 'bold')));
    stage.setOrigin(0, 0.5);
    this.stageText = stage;
    x += stage.width + 16;
    const gravity = keep(this.add.text(x, cy, GRAVITY_LABEL[this.cfg.gravity], textStyle(20, C.textDim)));
    gravity.setOrigin(0, 0.5);
    x += gravity.width;
    this.gravityArrow = null;
    if (this.cfg.gravity === 'rotate') {
      // Mũi tên là chữ riêng, đổi sau mỗi lần ăn cặp mà không xô lệch các nút phía sau
      this.gravityArrow = keep(this.add.text(x + 6, cy, '', textStyle(22, C.text, 'bold')).setOrigin(0, 0.5));
      x += 6 + 24;
    }
    x += 20;
    // Huy hiệu số lượt nhô ra mép phải nút Gợi ý / Đảo bàn, nên chừa khoảng cách rộng hơn
    // Gợi ý và Đảo bàn có tiếng riêng, không phát thêm tiếng bấm nút
    this.hintBtn = keep(new IconButton(this, x + HUD_BTN / 2, cy, HUD_BTN, 'hint', () => this.useHint(), 1, false));
    x += HUD_BTN + 16;
    this.shuffleBtn = keep(new IconButton(this, x + HUD_BTN / 2, cy, HUD_BTN, 'shuffle', () => this.useShuffle(), 1, false));
    x += HUD_BTN + 16;
    // Đấu online không tạm dừng được: nút này mở hộp hỏi đầu hàng
    keep(new Button(this, x + HUD_BTN / 2, cy, HUD_BTN, HUD_BTN, 'II', () => this.pause(), 1, 22));
    x += HUD_BTN + 16;
    this.muteBtn = keep(new IconButton(this, x + HUD_BTN / 2, cy, HUD_BTN, this.soundIcon(), () => this.onMute()));
    this.muteBtn.setCount(null, true);
    x += HUD_BTN + 20;

    this.scoreText = null;
    this.opp = null;
    if (this.match) this.createOpponentHud(keep, W - 32, cy);
    else this.scoreText = keep(this.add.text(W - 32, cy, '', textStyle(28, C.text, 'bold')).setOrigin(1, 0.5));
    this.timeBar = keep(this.add.graphics());
    const barRight = W - 32 - (this.match ? OPP_W : SCORE_W) - 20;
    this.timeBarRect = { x, y: cy - 7, w: Math.max(60, barRight - x), h: 14 };

    // Đấu online: số đếm ngược giữa bàn chơi, tới khi trận bắt đầu
    this.countdownText = null;
    if (this.match && !this.started) {
      this.countdownText = keep(
        this.add.text(W / 2, HUD_H + (this.scale.height - HUD_H) / 2, '', textStyle(160, C.textAccent, 'bold')).setOrigin(0.5),
      );
      this.updateCountdown();
    }

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
    if (this.scoreText) {
      this.scoreText.setText(`${this.score} điểm`);
      // Điểm rất lớn thì thu nhỏ chữ cho vừa chỗ dành sẵn
      this.scoreText.setScale(Math.min(1, SCORE_W / this.scoreText.width));
    }
    if (this.match) {
      this.stageText.setText(this.pairsText(this.match.me.pairsLeft()));
      this.drawOpponent();
    }
    // Xoay vòng: mũi tên chỉ hướng dồn ở lần ăn cặp tới
    this.gravityArrow?.setText(ARROW[gravityFor(this.cfg.gravity, this.matches)] ?? '');
    this.hintBtn.setCount(this.hints, this.hints > 0);
    this.shuffleBtn.setCount(this.shuffles, this.shuffles > 0);
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

  private toast(msg: string): void {
    this.tweens.killTweensOf(this.toastText);
    this.toastText.setText(msg).setAlpha(1);
    this.tweens.add({ targets: this.toastText, alpha: 0, delay: 1200, duration: 400 });
  }

  private drawFrame(g: Phaser.GameObjects.Graphics, points: Point[], color: number): void {
    g.clear();
    g.lineStyle(5, color, 1);
    // Khung ôm đúng ô đang hiện (cả phần bóng đổ ở đáy texture)
    const w = TEXTURE_SIZE * this.tileScale();
    const h = this.texH * this.tileScale();
    for (const p of points) {
      const { x, y } = this.cellCenter(p);
      g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 10);
    }
  }

  // ---------------- Tương tác ----------------

  /** Không thao tác được trên bàn: màn đã kết thúc, hoặc (đấu online) chưa bắt đầu, đã dọn xong hay hết giờ. */
  private locked(): boolean {
    return this.ended || (this.match !== null && !this.match.canPlay());
  }

  private onPointer(p: Phaser.Input.Pointer): void {
    if (this.locked() || this.paused) return;
    // Chạm vào vòng ô trống cho ra hàng/cột 0 hoặc rows+1/cols+1, bị isInside loại ra
    const c = Math.floor((p.worldX - this.originX - this.ringX) / this.cellW) + 1;
    const r = Math.floor((p.worldY - this.originY - this.ringY) / this.cellH) + 1;
    const pt = { r, c };
    // Ô trống và đá không chọn được
    if (!this.board.isInside(pt) || this.board.get(pt) <= 0) return;

    if (!this.selected) {
      playSfx('select');
      this.select(pt);
      return;
    }
    if (same(this.selected, pt)) {
      playSfx('deselect');
      this.select(null);
      return;
    }

    const path = this.board.findPath(this.selected, pt);
    if (path) {
      this.matchPair(this.selected, pt, path);
    } else {
      // Không nối được: chuyển chọn sang ô mới. Cùng hình mà bị chặn thì báo "không nối được"; khác hình chỉ là đổi ý
      playSfx(this.board.get(this.selected) === this.board.get(pt) ? 'wrong' : 'select');
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
    // Cập nhật logic + dồn ô. Đấu online: qua Match, để nước đi được gửi cho đối thủ (kèm đòn nếu thành chuỗi)
    let moves: Move[];
    let combo: number;
    if (this.match) {
      const played = this.match.play(a, b);
      if (!played) return;
      moves = played.moves;
      combo = played.combo;
      this.showCombo(played.combo, played.attack);
    } else {
      moves = this.board.remove(a, b, gravityFor(this.cfg.gravity, this.matches));
      const now = Date.now();
      combo = this.combo = nextCombo(this.comboAt, now, this.combo);
      this.comboAt = now;
    }
    this.matches++;
    // Ăn cặp liên tiếp thật nhanh thì tiếng nối cặp cao dần
    playSfx('match', pitchStep(combo));

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

    this.moveSprites(moves);

    // Đấu online không có điểm, và không cộng giờ: hai bên hết giờ cùng lúc
    if (!this.match) {
      this.score += SCORE_PER_PAIR;
      this.timeLeft = Math.min(this.cfg.time, this.timeLeft + TIME_BONUS_PER_PAIR);
    }
    this.refreshHud();
    this.checkBoard();
  }

  /**
   * Dời các ô bị dồn (sau khi ăn cặp, hay bị đối thủ nghiêng bàn) tới chỗ mới, theo danh sách của Board.
   * Mọi lần dời đều chờ cùng một khoảng và chạy cùng thời gian, nên lần dời sau luôn kết thúc sau lần trước:
   * ô bị dời hai lần liền vẫn dừng đúng chỗ cuối.
   */
  private moveSprites(moves: Move[]): void {
    const moving = moves.map((m) => this.sprites[m.from.r][m.from.c]);
    moves.forEach((m) => (this.sprites[m.from.r][m.from.c] = null));
    moves.forEach((m, i) => {
      const img = moving[i];
      this.sprites[m.to.r][m.to.c] = img;
      if (!img) return;
      const { x, y } = this.cellCenter(m.to);
      this.tweens.add({ targets: img, x, y, duration: 180, delay: 200, ease: 'Quad.Out' });
    });
  }

  /**
   * Sau khi bàn đổi: dọn sạch thì qua màn, bế tắc thì tự đảo bàn (chờ hiệu ứng ăn cặp chạy xong).
   * Đấu online thì dọn sạch là xong phần mình: Match phân xử và báo kết quả (xem showResult).
   */
  private checkBoard(): void {
    if (this.board.isCleared()) {
      if (this.match) this.waitForResult();
      else this.time.delayedCall(450, () => this.winLevel());
    } else if (!this.board.hasMove()) {
      this.time.delayedCall(450, () => this.autoShuffle());
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
    if (this.locked() || this.hints <= 0) return;
    const move = this.board.findAnyMove();
    if (!move) return;
    this.hints--;
    this.setHint(move);
    playSfx('hint');
    for (const p of move) {
      const img = this.sprites[p.r][p.c];
      if (img) this.tweens.add({ targets: img, angle: { from: -8, to: 8 }, duration: 80, yoyo: true, repeat: 3, onComplete: () => img.setAngle(0) });
    }
    this.refreshHud();
  }

  private useShuffle(): void {
    if (this.locked() || this.shuffles <= 0) return;
    this.shuffleBoard(false);
  }

  /**
   * Bàn hết nước đi: tự dùng một lượt Đảo bàn của người chơi; hết lượt thì thua màn.
   * Đấu online thì tự đảo không tốn lượt (xem pvp/match.ts), nên không ai thua vì bế tắc.
   */
  private autoShuffle(): void {
    // Người chơi có thể đã tự bấm Đảo bàn trong lúc chờ
    if (this.locked() || this.board.hasMove()) return;
    if (this.shuffles <= 0 && !this.match) {
      this.loseLevel('moves');
      return;
    }
    this.shuffleBoard(true);
  }

  private shuffleBoard(auto: boolean): void {
    // Đấu online: qua Match, để lần đảo được gửi cho đối thủ
    const broken = this.match ? this.match.shuffle(auto) : this.board.shuffle();
    if (!broken) return;
    playSfx('shuffle');
    if (!auto || !this.match) this.shuffles--;
    this.select(null);
    this.setHint(null);
    this.syncTextures();
    this.breakStones(broken);
    if (auto && this.match) this.toast('Hết nước đi – tự đảo bàn');
    else if (auto) this.toast(broken.length ? 'Hết nước đi – đá vỡ để mở đường' : 'Hết nước đi – tự dùng 1 lượt Đảo bàn');
    else if (broken.length) this.toast('Đá vỡ để mở đường');
    this.refreshHud();
  }

  /** Sau khi xáo trộn: vị trí ô giữ nguyên, chỉ đổi hình hiển thị (đá đứng yên). */
  private syncTextures(): void {
    for (let r = 1; r <= this.board.rows; r++)
      for (let c = 1; c <= this.board.cols; c++) {
        const img = this.sprites[r][c];
        const v = this.board.grid[r][c];
        if (!img || v <= 0) continue;
        const sx = this.tileScale();
        this.tweens.add({
          targets: img,
          scaleX: 0,
          duration: 120,
          yoyo: true,
          onYoyo: () => img.setTexture(textureFor(v, this.texH)),
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
    if (this.match) {
      this.tickPvp(this.match);
      return;
    }
    if (this.ended) return;
    this.timeLeft -= dt;
    this.drawTimeBar();
    if (this.timeLeft <= 0) this.loseLevel('time');
  }

  private winLevel(): void {
    if (this.ended) return;
    this.ended = true;
    const bonus = Math.ceil(this.timeLeft) * POINTS_PER_SECOND_LEFT;
    this.score += bonus;
    this.refreshHud();
    const next: SavedGame = {
      level: this.levelIndex + 1,
      score: this.score,
      hints: this.hints,
      shuffles: this.shuffles,
      retries: this.retries,
    };
    // Lưu ngay chỗ vào màn sau: app bị tắt lúc đang hiện hộp thoại này thì chơi tiếp từ màn sau
    saveGame(next);
    // Nhạc nền nhỏ lại trong lúc phát rồi chạy tiếp sang màn sau
    playSfx('clear');
    this.openDialog({
      title: 'Qua màn!',
      body:
        `Thưởng thời gian: +${bonus}\nTổng: ${this.score} điểm\n` +
        `Gợi ý: ${this.hints} + ${HINTS_PER_LEVEL} = ${this.hints + HINTS_PER_LEVEL}\n` +
        `Đảo bàn: ${this.shuffles} + ${SHUFFLES_PER_LEVEL} = ${this.shuffles + SHUFFLES_PER_LEVEL}`,
      actions: [
        { label: 'Màn tiếp theo', onClick: () => this.scene.restart(next) },
        { label: 'Lưu và về menu', onClick: () => this.scene.start('Menu') },
      ],
      // Không có `back`: bấm nhầm Back không rời màn, người chơi tự chọn một nút
    });
  }

  /**
   * Thua màn (hết giờ / hết nước đi). Còn lượt chơi lại thì được chơi lại màn này với điểm và lượt trợ giúp
   * như lúc mới vào màn (cả lượt chơi chỉ có RETRIES_PER_RUN lượt); hết lượt thì chỉ còn nút về menu.
   * Lượt chơi chỉ được ghi lên bảng xếp hạng khi về menu từ đây (nút hoặc Back), xem finishRun.
   * Trước đó trạng thái thua được lưu lại, nên app bị tắt lúc này thì chơi tiếp sẽ hiện lại hộp thoại này
   * (`restored`: khi đó không phát lại tiếng thua). Nhạc nền tắt trong lúc hộp thoại mở.
   */
  private loseLevel(why: LoseReason, restored = false): void {
    if (this.ended) return;
    this.ended = true;
    if (!restored) playSfx('lose');
    stopMusic();
    this.lost = why;
    this.select(null);
    this.saveProgress();
    const { title, reason } = LOSE_TEXT[why];
    const canRetry = this.retries > 0;
    // Chưa ghi: đây là hạng lượt chơi sẽ có nếu về menu lúc này
    const rank = rankFor(this.score, this.levelIndex + 1);
    let body = (reason ? `${reason}\n` : '') + `Bạn đạt ${this.score} điểm`;
    if (rank) body += canRetry ? `\nVề menu: xếp hạng ${rank}` : `\nHạng ${rank} trên bảng xếp hạng!`;
    body += `\n${this.retriesText()}`;
    const retry = { label: 'Chơi lại', onClick: () => this.retryLevel() };
    this.openDialog({
      title,
      body,
      actions: [...(canRetry ? [retry] : []), { label: 'Về menu', onClick: () => this.finishRun() }],
      back: () => this.finishRun(),
    });
  }

  /**
   * Dùng một lượt chơi lại: chơi lại màn này với điểm và lượt trợ giúp như lúc mới vào màn.
   * Cả hộp thoại thua lẫn menu tạm dừng đều đi qua đây, nên cả lượt chơi chỉ có RETRIES_PER_RUN lần.
   */
  private retryLevel(): void {
    this.scene.restart({ ...this.entry, retries: this.retries - 1 });
  }

  private retriesText(): string {
    return this.retries > 0 ? `Còn ${this.retries} lượt chơi lại` : 'Đã hết lượt chơi lại';
  }

  /**
   * Kết thúc lượt chơi sau khi thua: ghi điểm cuối cùng lên bảng xếp hạng, xóa bản lưu rồi về menu.
   * Đây là cách duy nhất một lượt chơi kết thúc và được ghi; "Lưu và về menu" giữ lượt chơi để chơi tiếp.
   */
  private finishRun(): void {
    if (this.recorded) return;
    this.recorded = true;
    clearSavedGame();
    addToLeaderboard(this.score, this.levelIndex + 1);
    // Có kỷ lục mới thì gửi lên mạng (cũng gửi lại nếu lần trước gửi lỗi)
    void syncBest();
    this.scene.start('Menu');
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

  // ---------------- Đấu online ----------------

  /**
   * Vào trận đấu online: nghe Match (bàn đối thủ đổi, kết quả) và phiên (trận mới khi đấu lại, đối thủ rời đi).
   * Không có tạm dừng hay lưu: Back mở hộp hỏi đầu hàng, app xuống nền thì trận vẫn chạy
   * (đồng hồ tính theo giờ bắt đầu, nên quay lại vẫn đúng giờ; đi lâu quá thì đối thủ được xử thắng).
   */
  private startPvp(session: PvpSession, match: Match): void {
    match.onOpponent = () => this.drawOpponent();
    match.onHit = (effect) => this.showHit(effect);
    match.onEnd = () => this.showResult();
    const listener = {
      onStart: () => this.scene.restart({ pvp: session }),
      onRematch: () => this.showResult(),
      onClosed: () => this.showResult(),
      onLink: (ok: boolean) => this.toast(ok ? 'Đã kết nối lại' : 'Mất kết nối, đang thử lại…'),
    };
    session.listener = listener;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (session.listener === listener) session.listener = null;
      match.onOpponent = null;
      match.onHit = null;
      match.onEnd = null;
    });
    onBack(this, () => (this.dialog ? this.dialog.opts.back?.() : this.confirmSurrender()));
    if (session.relayed) this.toast('Kết nối qua máy chủ chuyển tiếp');
    // Trận có thể đã kết thúc trong lúc chuyển màn hình (đối thủ đầu hàng ngay, rời đi...)
    if (match.outcome || session.closed) this.showResult();
  }

  private tickPvp(m: Match): void {
    m.tick();
    if (!this.started) {
      if (m.elapsed() < 0) {
        this.updateCountdown();
        return;
      }
      this.started = true;
      this.countdownText?.destroy();
      this.countdownText = null;
      this.createTiles();
      this.toast('Bắt đầu!');
      // Trận có thể đã xong ngay trong lúc đếm ngược (đầu hàng, đối thủ rời đi): khi đó không bật nhạc dưới hộp kết quả
      if (!m.outcome) startMusic();
    }
    this.timeLeft = m.timeLeft();
    this.drawTimeBar();
    if (this.fogCover.length && Date.now() >= this.fogUntil) this.drawFog();
    if (m.timeLeft() <= 0) this.waitForResult();
  }

  /** Mình vừa ăn cặp: báo độ dài chuỗi, và đòn vừa gửi cho đối thủ nếu chuỗi đủ dài. */
  private showCombo(combo: number, attack: AttackKind | null): void {
    if (combo < 2) return;
    this.toast(attack ? `Chuỗi ${combo}! ${ATTACK_SENT[attack](this.pvp?.oppName ?? 'đối thủ')}` : `Chuỗi ${combo}!`);
  }

  /** Bàn mình vừa nhận một đòn của đối thủ (bàn đã đổi xong): vẽ lại đúng thay đổi đó. */
  private showHit(e: HitEffect): void {
    // Bàn kín chỗ (chưa ăn được cặp nào, hay đá đã kề khắp nơi): đá không rơi được, không có gì đổi
    if (e.kind === 'stone' && !e.at) return;
    playHit(e.kind);
    this.select(null);
    this.setHint(null);
    switch (e.kind) {
      case 'stone':
        this.dropStoneSprite(e.at!);
        break;
      case 'tilt':
        this.moveSprites(e.moves);
        break;
      case 'fog':
        this.fogUntil = Math.max(this.fogUntil, Date.now() + FOG_MS);
        this.drawFog();
        break;
      case 'shuffle':
        this.syncTextures();
        this.breakStones(e.broken);
        break;
    }
    this.toast(ATTACK_TAKEN[e.kind](this.pvp?.oppName ?? 'Đối thủ'));
    this.refreshHud();
    // Đá hay nghiêng bàn có thể làm bàn bế tắc: tự đảo như sau một lần ăn cặp
    this.checkBoard();
  }

  /** Viên đá đối thủ thả xuống: rơi từ trên cao vào ô trống. */
  private dropStoneSprite(p: Point): void {
    const { x, y } = this.cellCenter(p);
    const img = this.add.image(x, y, textureFor(STONE, this.texH)).setScale(this.tileScale() * 1.8).setAlpha(0);
    this.tweens.add({ targets: img, scale: this.tileScale(), alpha: 1, duration: 350, ease: 'Bounce.Out' });
    this.sprites[p.r][p.c] = img;
  }

  /**
   * Lớp che kín bàn chơi khi bị che mắt (tới fogUntil): vẽ lại khi bố cục đổi, gỡ khi hết giờ che.
   * Vẫn chạm được vào bàn bên dưới; khung chọn và gợi ý nằm trên lớp che.
   */
  private drawFog(): void {
    this.fogCover.forEach((o) => o.destroy());
    this.fogCover = [];
    if (Date.now() >= this.fogUntil) return;
    const w = this.cellW * this.board.cols + this.ringX * 2;
    const h = this.cellH * this.board.rows + this.ringY * 2;
    const cover = this.add.graphics().setDepth(4);
    cover.fillStyle(C.panel, 0.97).fillRoundedRect(this.originX, this.originY, w, h, 24);
    const label = this.add
      .text(this.originX + w / 2, this.originY + h / 2, 'Bị che mắt!', textStyle(56, C.textDim, 'bold'))
      .setOrigin(0.5)
      .setDepth(4);
    this.fogCover = [cover, label];
  }

  private updateCountdown(): void {
    if (this.match && this.countdownText) this.countdownText.setText(String(Math.max(1, Math.ceil(-this.match.elapsed() / 1000))));
  }

  /** Mình đã dọn xong hoặc hết giờ: thôi thao tác, chờ Match báo kết quả (thường chỉ khoảng một giây). */
  private waitForResult(): void {
    if (this.ended) return;
    this.ended = true;
    this.select(null);
    this.setHint(null);
    if (!this.match?.outcome) this.toast(this.board.isCleared() ? 'Dọn xong! Chờ kết quả…' : 'Hết giờ! Chờ kết quả…');
  }

  private pairsText(pairs: number): string {
    return `Còn ${pairs} cặp`;
  }

  /** Góc phải HUD: tên và số cặp còn lại của đối thủ (căn phải, sát `right`), rồi bàn thu nhỏ của họ. */
  private createOpponentHud(keep: <T extends { destroy(): void }>(o: T) => T, right: number, cy: number): void {
    const { rows, cols } = this.board;
    const cell = Math.max(2, Math.floor(Math.min(MINI_W / cols, MINI_H / rows)));
    const x = right - cols * cell;
    const y = Math.round(cy - (rows * cell) / 2);
    const textRight = x - 16;
    const name = keep(this.add.text(textRight, cy - 12, this.pvp?.oppName ?? '', textStyle(20, C.text, 'bold')));
    name.setOrigin(1, 0.5).setScale(Math.min(1, (OPP_W - (right - x) - 16) / name.width));
    const pairs = keep(this.add.text(textRight, cy + 13, '', textStyle(18, C.textDim)).setOrigin(1, 0.5));
    this.opp = { gfx: keep(this.add.graphics()), pairs, x, y, cell };
  }

  /** Vẽ lại bàn thu nhỏ của đối thủ từ bản sao bàn của họ: ô hình màu nhấn, đá màu xám. */
  private drawOpponent(): void {
    if (!this.match || !this.opp) return;
    const { board } = this.match.opp;
    const { gfx, pairs, x, y, cell } = this.opp;
    gfx.clear();
    gfx.fillStyle(0x163040, 1).fillRoundedRect(x - 4, y - 4, board.cols * cell + 8, board.rows * cell + 8, 6);
    for (let r = 1; r <= board.rows; r++)
      for (let c = 1; c <= board.cols; c++) {
        const v = board.grid[r][c];
        if (v === 0) continue;
        gfx.fillStyle(v > 0 ? C.accent : C.disabled, 1);
        gfx.fillRect(x + (c - 1) * cell, y + (r - 1) * cell, cell - 1, cell - 1);
      }
    pairs.setText(this.pairsText(this.match.opp.pairsLeft()).toLowerCase());
  }

  /** Hộp hỏi đầu hàng (nút II, nút Back). Trận vẫn chạy trong lúc hộp mở. */
  private confirmSurrender(): void {
    if (!this.match || this.match.outcome || this.dialog) return;
    this.openDialog({
      title: 'Đầu hàng?',
      body: 'Trận đấu không tạm dừng được: đồng hồ vẫn chạy trong lúc hộp thoại này mở.',
      actions: [
        { label: 'Chơi tiếp', onClick: () => this.closeDialog() },
        { label: 'Đầu hàng', onClick: () => this.match?.surrender() },
      ],
      back: () => this.closeDialog(),
    });
  }

  /**
   * Hộp kết quả trận, mở lại mỗi khi có gì đổi (đối thủ muốn đấu lại, đối thủ rời phòng).
   * Đấu lại khi cả hai cùng bấm; về menu là rời phòng.
   */
  private showResult(): void {
    const m = this.match;
    const s = this.pvp;
    if (!m?.outcome || !s) return;
    this.ended = true;
    this.select(null);
    this.setHint(null);
    // Trận đã xong: bỏ lớp che mắt (nếu đang bị che) để xem lại bàn sau hộp kết quả
    this.fogUntil = 0;
    this.drawFog();
    const o = m.outcome;
    const opp = s.oppName;
    // Hộp kết quả mở lại mỗi khi có gì đổi: tiếng thắng / thua chỉ phát lần đầu, hòa thì không có tiếng
    if (!this.resultSounded) {
      this.resultSounded = true;
      if (o.result === 'win') playSfx('clear');
      else if (o.result === 'lose') playSfx('lose');
      stopMusic();
    }
    const lines = [outcomeText(o, opp), `Bạn còn ${m.me.pairsLeft()} cặp, ${opp} còn ${m.opp.pairsLeft()} cặp.`];
    if (s.closed) {
      if (o.why !== 'left') lines.push(`${opp} đã rời phòng.`);
    } else if (s.rematch.me) lines.push(`Đang chờ ${opp} đồng ý đấu lại…`);
    else if (s.rematch.opp) lines.push(`${opp} muốn đấu lại!`);
    const rematch = {
      label: 'Đấu lại',
      onClick: () => {
        s.requestRematch();
        this.showResult();
      },
    };
    this.openDialog({
      title: o.result === 'win' ? 'Bạn thắng!' : o.result === 'lose' ? 'Bạn thua' : 'Hòa!',
      body: lines.join('\n'),
      actions: [...(s.closed || s.rematch.me ? [] : [rematch]), { label: 'Về menu', onClick: () => this.leavePvp() }],
      back: () => this.leavePvp(),
      // Kết quả có thể hiện giữa lúc đang chạm liên tục vào bàn (đối thủ vừa dọn xong)
      ignoreTapsMs: 800,
    });
  }

  /** Rời phòng đấu online và về menu. */
  private leavePvp(): void {
    this.pvp?.close();
    this.scene.start('Menu');
  }

  // ---------------- Tạm dừng ----------------

  /** Dừng đồng hồ đếm giờ, các hiệu ứng và thao tác trên bàn chơi. */
  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.time.paused = paused;
    this.tweens.paused = paused;
  }

  private pause(): void {
    if (this.match) {
      this.confirmSurrender();
      return;
    }
    if (this.ended || this.paused) return;
    this.setPaused(true);
    // Tạm dừng cũng là lúc app xuống nền, có thể bị tắt hẳn ngay sau đó
    this.saveProgress();
    this.openDialog({
      title: 'Tạm dừng',
      body: this.retriesText(),
      shade: 0.92, // che gần kín bàn chơi để không xem trước nước đi khi đang dừng
      actions: [
        { label: 'Tiếp tục', onClick: () => this.resume() },
        // Tốn một lượt chơi lại như khi thua; hết lượt thì không có nút này
        ...(this.retries > 0 ? [{ label: 'Chơi lại màn', onClick: () => this.retryLevel() }] : []),
        // Đã lưu lúc tạm dừng; lưu lại cho chắc rồi về menu, ở đó có nút Tiếp tục
        {
          label: 'Lưu và về menu',
          onClick: () => {
            this.saveProgress();
            this.scene.start('Menu');
          },
        },
      ],
      back: () => this.resume(),
    });
    stopMusic();
  }

  private resume(): void {
    this.closeDialog();
    this.setPaused(false);
    startMusic();
  }

  // ---------------- Âm thanh ----------------

  /** Biểu tượng nút loa: loa gạch chéo khi đã tắt cả hiệu ứng lẫn nhạc. */
  private soundIcon(): 'sound' | 'mute' {
    return audible(soundSettings()) ? 'sound' : 'mute';
  }

  private onMute(): void {
    toggleMute();
    this.muteBtn.setIcon(this.soundIcon());
  }
}
