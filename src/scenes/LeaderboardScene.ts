import Phaser from 'phaser';
import { startMusic } from '../audio/sound';
import { LEADERBOARD_SIZE, loadBest, loadLeaderboard } from '../game/storage';
import { onBack } from '../native';
import { fetchOnlineBoard, onlineEnabled, type OnlineBoard } from '../online';
import { Button, C, onGameResize, tapZone, textStyle } from './ui';

/** Hai bảng: mọi người chơi trên mạng, và các lượt chơi trên máy này. */
type Tab = 'online' | 'local';

/** Trạng thái bảng online trong lần mở màn hình này. */
type OnlineState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; board: OnlineBoard };

/** Số người chơi hiện trên bảng online, bằng số dòng của bảng trên máy. */
const ONLINE_SIZE = LEADERBOARD_SIZE;

const TITLE_Y = 48;
const TAB_Y = 112;
const TAB_W = 210;
const TAB_H = 50;
const PANEL_W = 840;
const PANEL_TOP = 150;
const PANEL_BOTTOM = 594;
const HEADER_Y = 180;
const FIRST_ROW_Y = 222;
const ROW_H = 32;
/** Dòng của người chơi khi họ không lọt nhóm đầu bảng online, nằm riêng dưới cùng. */
const ME_ROW_Y = FIRST_ROW_Y + ONLINE_SIZE * ROW_H + 24;

/**
 * Một cột của bảng: vị trí x so với giữa màn hình, điểm neo của chữ (0 căn trái, 0.5 giữa, 1 căn phải),
 * chữ đậm hay nhạt, và chiều rộng tối đa (chữ dài hơn thì thu nhỏ lại).
 */
interface Col {
  title: string;
  dx: number;
  origin: number;
  bold?: boolean;
  dim?: boolean;
  maxW?: number;
}

const LOCAL_COLS: Col[] = [
  { title: 'Hạng', dx: -340, origin: 0.5, bold: true },
  { title: 'Điểm', dx: -80, origin: 1, bold: true },
  { title: 'Màn', dx: 80, origin: 0.5 },
  { title: 'Ngày', dx: 350, origin: 1, dim: true },
];

const ONLINE_COLS: Col[] = [
  { title: 'Hạng', dx: -340, origin: 0.5, bold: true },
  { title: 'Tên', dx: -280, origin: 0, maxW: 360 },
  { title: 'Điểm', dx: 220, origin: 1, bold: true },
  { title: 'Màn', dx: 330, origin: 0.5 },
];

const TABS: { tab: Tab; label: string }[] = [
  { tab: 'online', label: 'Toàn cầu' },
  { tab: 'local', label: 'Trên máy' },
];

/** Bảng đang xem, giữ lại cho lần mở màn hình sau. */
let lastTab: Tab = 'online';

function formatDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Bảng xếp hạng, hai thẻ:
 * - Toàn cầu: kỷ lục của mọi người chơi trên Firebase (xem online.ts), kèm hạng của người chơi trên máy này.
 *   Chỉ có khi bản build có cấu hình Firebase. Tải mỗi lần mở màn hình; đổi kích thước màn hình thì dùng lại.
 * - Trên máy: các lượt chơi điểm cao nhất, mỗi lượt kèm màn đang chơi lúc thua.
 */
export class LeaderboardScene extends Phaser.Scene {
  private tab: Tab = 'local';
  private online: OnlineState | null = null;
  /** Đếm số lần tải bảng online, để bỏ kết quả của lần tải cũ. */
  private loads = 0;
  /** Scene chạy lại chỉ vì đổi kích thước màn hình: giữ bảng online đã tải. */
  private keepOnline = false;
  /** Các đối tượng trong khung bảng, xóa khi đổi thẻ hoặc tải xong. */
  private content: { destroy(): void }[] = [];
  private tabBg: Phaser.GameObjects.Graphics | null = null;
  private tabLabels: Phaser.GameObjects.Text[] = [];

  constructor() {
    super('Leaderboard');
  }

  create(): void {
    this.content = [];
    this.tabLabels = [];
    this.tabBg = null;
    // Mở từ menu thì tải lại bảng online; chạy lại vì đổi kích thước thì giữ bảng đang có (hoặc lần tải đang dở)
    if (!this.keepOnline) {
      this.online = null;
      this.loads++;
    }
    this.keepOnline = false;
    this.cameras.main.setBackgroundColor(C.bg).fadeIn(250, 31, 59, 77);
    // Nhạc menu chạy liền qua các màn menu (xem audio/sound.ts)
    startMusic('menu');
    onGameResize(this, () => {
      this.keepOnline = true;
      this.scene.restart();
    });
    onBack(this, () => this.back());

    const x = this.scale.width / 2;
    this.add.text(x, TITLE_Y, 'Bảng xếp hạng', textStyle(48, C.text, 'bold')).setOrigin(0.5);
    this.add
      .graphics()
      .fillStyle(C.panel, 1)
      .fillRoundedRect(x - PANEL_W / 2, PANEL_TOP, PANEL_W, PANEL_BOTTOM - PANEL_TOP, 24);

    // Bản build không có Firebase: chỉ có bảng trên máy, không cần thẻ
    if (onlineEnabled()) this.drawTabs();
    this.showTab(onlineEnabled() ? lastTab : 'local');

    new Button(this, x, 652, 320, 76, 'Quay lại', () => this.back(), 1, 30);
  }

  /** Hai thẻ dạng công tắc dưới tiêu đề; thẻ đang chọn tô màu nhấn. */
  private drawTabs(): void {
    const x = this.scale.width / 2;
    this.tabBg = this.add.graphics();
    TABS.forEach(({ tab, label }, i) => {
      const tx = x + (i - 0.5) * TAB_W;
      this.tabLabels.push(this.add.text(tx, TAB_Y, label, textStyle(24, C.text, 'bold')).setOrigin(0.5).setDepth(1));
      tapZone(this, tx, TAB_Y, TAB_W, TAB_H, 1, () => this.showTab(tab));
    });
  }

  private showTab(tab: Tab): void {
    this.tab = tab;
    lastTab = tab;
    if (this.tabBg) {
      const x = this.scale.width / 2;
      const r = (TAB_H + 8) / 2;
      this.tabBg
        .clear()
        .fillStyle(C.panel, 1)
        .fillRoundedRect(x - TAB_W - 4, TAB_Y - r, TAB_W * 2 + 8, TAB_H + 8, r);
      const i = TABS.findIndex((t) => t.tab === tab);
      this.tabBg.fillStyle(C.accent, 1).fillRoundedRect(x + (i - 1) * TAB_W, TAB_Y - TAB_H / 2, TAB_W, TAB_H, TAB_H / 2);
      this.tabLabels.forEach((t, j) => t.setColor(j === i ? C.textDark : C.textDim));
    }
    if (tab === 'online' && !this.online) this.loadOnline();
    else this.render();
  }

  private loadOnline(): void {
    const id = ++this.loads;
    this.online = { status: 'loading' };
    this.render();
    fetchOnlineBoard(ONLINE_SIZE).then(
      (board) => this.onlineLoaded(id, { status: 'ready', board }),
      (e: unknown) => {
        console.warn('Không tải được bảng xếp hạng online:', e);
        this.onlineLoaded(id, { status: 'error' });
      },
    );
  }

  private onlineLoaded(id: number, state: OnlineState): void {
    // Lần tải cũ (đã rời màn hình, hoặc đã bấm Thử lại) thì bỏ
    if (id !== this.loads) return;
    this.online = state;
    if (this.sys.isActive() && this.tab === 'online') this.render();
  }

  /** Vẽ lại nội dung khung bảng theo thẻ đang chọn. */
  private render(): void {
    this.content.forEach((o) => o.destroy());
    this.content = [];
    if (this.tab === 'local') this.renderLocal();
    else this.renderOnline();
  }

  private renderLocal(): void {
    const entries = loadLeaderboard();
    if (entries.length === 0) {
      this.message('Chưa có lượt chơi nào.\nĐiểm được ghi khi bạn hết giờ hoặc hết nước đi.');
      return;
    }
    this.header(LOCAL_COLS);
    entries.forEach((e, i) =>
      this.row(LOCAL_COLS, FIRST_ROW_Y + i * ROW_H, i, [String(i + 1), String(e.score), String(e.stage), formatDate(e.date)]),
    );
  }

  private renderOnline(): void {
    const state = this.online;
    if (!state || state.status === 'loading') {
      this.message('Đang tải...');
      return;
    }
    if (state.status === 'error') {
      const cy = (PANEL_TOP + PANEL_BOTTOM) / 2;
      this.message('Không tải được bảng xếp hạng.\nHãy kiểm tra kết nối mạng rồi thử lại.', cy - 50);
      this.content.push(new Button(this, this.scale.width / 2, cy + 70, 240, 64, 'Thử lại', () => this.loadOnline(), 1, 26));
      return;
    }

    const { top, me } = state.board;
    const hasBest = loadBest() > 0;
    if (top.length === 0) {
      this.message(
        hasBest
          ? 'Chưa có ai trên bảng xếp hạng.\nKỷ lục của bạn sẽ được gửi lên khi có mạng.'
          : 'Chưa có ai trên bảng xếp hạng.\nĐiểm được gửi lên khi bạn hết giờ hoặc hết nước đi.',
      );
      return;
    }
    this.header(ONLINE_COLS);
    top.forEach((e, i) => {
      const y = FIRST_ROW_Y + i * ROW_H;
      if (e.uid === me?.entry.uid) this.highlight(y);
      this.row(ONLINE_COLS, y, i, [String(i + 1), e.name, String(e.score), String(e.stage)]);
    });

    // Người chơi không lọt nhóm đầu: dòng riêng ở cuối bảng, hoặc lời nhắc nếu họ chưa có trên bảng
    if (me && me.rank > top.length) {
      const x = this.scale.width / 2;
      const g = this.add.graphics();
      g.fillStyle(C.bg, 1).fillRect(x - PANEL_W / 2 + 32, ME_ROW_Y - ROW_H / 2 - 8, PANEL_W - 64, 2);
      this.content.push(g);
      this.highlight(ME_ROW_Y);
      const { entry } = me;
      this.row(ONLINE_COLS, ME_ROW_Y, me.rank - 1, [String(me.rank), entry.name, String(entry.score), String(entry.stage)]);
    } else if (!me && hasBest) {
      this.message('Kỷ lục của bạn chưa được gửi lên. Game sẽ gửi lại khi có mạng.', ME_ROW_Y, 20);
    }
  }

  private header(cols: Col[]): void {
    const x = this.scale.width / 2;
    for (const col of cols)
      this.content.push(
        this.add.text(x + col.dx, HEADER_Y, col.title, textStyle(22, C.textDim, 'bold')).setOrigin(col.origin, 0.5),
      );
    const g = this.add.graphics();
    g.fillStyle(C.bg, 1).fillRect(x - PANEL_W / 2 + 32, HEADER_Y + 20, PANEL_W - 64, 2);
    this.content.push(g);
  }

  /** Một dòng của bảng; `index` là thứ tự trên bảng (từ 0): ba hạng đầu tô màu nhấn. */
  private row(cols: Col[], y: number, index: number, cells: string[]): void {
    const x = this.scale.width / 2;
    const color = index < 3 ? C.textAccent : C.text;
    cells.forEach((text, j) => {
      const col = cols[j];
      const t = this.add
        .text(x + col.dx, y, text, textStyle(24, col.dim ? C.textDim : color, col.bold ? 'bold' : 'normal'))
        .setOrigin(col.origin, 0.5);
      if (col.maxW) t.setScale(Math.min(1, col.maxW / t.width));
      this.content.push(t);
    });
  }

  /** Nền nổi bật cho dòng của người chơi trên máy này. */
  private highlight(y: number): void {
    const x = this.scale.width / 2;
    const g = this.add.graphics();
    const left = x - PANEL_W / 2 + 20;
    g.fillStyle(C.bg, 1).fillRoundedRect(left, y - ROW_H / 2, PANEL_W - 40, ROW_H, 10);
    g.lineStyle(2, C.accent, 1).strokeRoundedRect(left, y - ROW_H / 2, PANEL_W - 40, ROW_H, 10);
    this.content.push(g);
  }

  /** Dòng chữ giữa khung bảng (hoặc ở `y`), dùng cho bảng trống, đang tải, lỗi. */
  private message(text: string, y = (PANEL_TOP + PANEL_BOTTOM) / 2, size = 28): void {
    this.content.push(
      this.add
        .text(this.scale.width / 2, y, text, { ...textStyle(size, C.textDim), align: 'center', lineSpacing: 10 })
        .setOrigin(0.5),
    );
  }

  private back(): void {
    this.scene.start('Menu');
  }
}
