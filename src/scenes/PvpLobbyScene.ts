import Phaser from 'phaser';
import { startMusic } from '../audio/sound';
import { loadPlayerName } from '../game/storage';
import { onBack } from '../native';
import { COMBO_STEP } from '../pvp/attacks';
import { PVP_TIME } from '../pvp/match';
import { PvpSession, type LobbyState } from '../pvp/session';
import { askRoomCode, nameDialogBack } from './nameDialog';
import { Button, C, onGameResize, textStyle } from './ui';

/** Màn hình phòng chờ: chọn tạo phòng hay vào phòng, rồi các bước của PvpSession. */
type View = { step: 'choose' } | LobbyState;

const INTRO =
  'Đua dọn bàn với một người bạn qua mạng: hai bên cùng một bàn,\n' +
  `ai dọn sạch trước thì thắng. Hết ${PVP_TIME / 60} phút thì ai còn ít cặp hơn thắng.\n` +
  `Cứ ăn liền ${COMBO_STEP} cặp thật nhanh là một đòn: thả đá, nghiêng bàn, che mắt, đảo bàn đối thủ.`;

/**
 * Phòng chờ đấu online (Menu → PvpLobby → Game). Tạo phòng thì hiện mã phòng để gửi cho bạn bè;
 * vào phòng thì hỏi mã (hộp nhập HTML, như hộp nhập tên). Khi trận đầu tiên bắt đầu thì chuyển sang Game,
 * mang theo phiên (PvpSession). Đổi kích thước màn hình thì chỉ vẽ lại, không khởi động lại scene,
 * để không mất phiên đang kết nối.
 */
export class PvpLobbyScene extends Phaser.Scene {
  private view: View = { step: 'choose' };
  private session: PvpSession | null = null;
  private objects: { destroy(): void }[] = [];

  constructor() {
    super('PvpLobby');
  }

  create(): void {
    this.view = { step: 'choose' };
    this.session = null;
    this.objects = [];
    this.cameras.main.setBackgroundColor(C.bg).fadeIn(250, 31, 59, 77);
    // Nhạc menu chạy liền qua các màn menu (xem audio/sound.ts)
    startMusic('menu');
    onGameResize(this, () => this.render());
    onBack(this, () => this.back());
    this.render();
  }

  private show(view: View): void {
    this.view = view;
    this.render();
  }

  private render(): void {
    this.objects.forEach((o) => o.destroy());
    this.objects = [];
    const keep = <T extends { destroy(): void }>(o: T): T => {
      this.objects.push(o);
      return o;
    };
    const x = this.scale.width / 2;
    const text = (y: number, s: string, size: number, color: string, weight = 'normal') =>
      keep(this.add.text(x, y, s, { ...textStyle(size, color, weight), align: 'center', lineSpacing: 8 }).setOrigin(0.5));
    const button = (y: number, label: string, onClick: () => void, primary = false) =>
      keep(new Button(this, x, y, 420, primary ? 88 : 76, label, onClick, 1, primary ? 34 : 30));

    text(90, 'Đấu online', 64, C.text, 'bold');
    const v = this.view;
    switch (v.step) {
      case 'choose':
        text(200, INTRO, 26, C.textDim);
        button(340, 'Tạo phòng', () => this.host(), true);
        button(444, 'Vào phòng', () => void this.join());
        button(540, 'Quay lại', () => this.back());
        break;
      case 'creating':
        text(300, 'Đang tạo phòng…', 32, C.text);
        button(540, 'Hủy', () => this.cancel());
        break;
      case 'waiting':
        text(200, 'Mã phòng', 30, C.textDim);
        // Cách các ký tự ra cho dễ đọc to qua điện thoại
        text(290, [...v.code].join(' '), 96, C.textAccent, 'bold');
        text(390, 'Gửi mã này cho bạn bè, họ chọn "Vào phòng" rồi nhập mã.', 26, C.textDim);
        text(450, 'Đang chờ đối thủ vào phòng…', 30, C.text);
        button(570, 'Hủy', () => this.cancel());
        break;
      case 'connecting':
        text(200, `Phòng ${v.code}`, 30, C.textDim);
        text(300, v.opponent ? `Đang kết nối với ${v.opponent}…` : 'Đang vào phòng…', 32, C.text);
        button(540, 'Hủy', () => this.cancel());
        break;
      case 'error':
        keep(
          this.add
            .text(x, 280, v.message, {
              ...textStyle(30, C.text),
              align: 'center',
              lineSpacing: 8,
              wordWrap: { width: 800 },
            })
            .setOrigin(0.5),
        );
        button(444, 'Thử lại', () => this.show({ step: 'choose' }), true);
        button(540, 'Quay lại', () => this.back());
        break;
    }
  }

  private newSession(): PvpSession {
    this.session?.close();
    const s: PvpSession = new PvpSession(loadPlayerName() ?? 'Người chơi', (state) => {
      if (this.session === s && this.sys.isActive()) this.show(state);
    });
    s.listener = {
      // Trận đầu tiên bắt đầu: phiên giờ thuộc về GameScene
      onStart: () => {
        this.session = null;
        this.scene.start('Game', { pvp: s });
      },
      onClosed: () => {
        if (this.session === s && this.sys.isActive()) this.show({ step: 'error', message: 'Đối thủ đã rời phòng.' });
      },
    };
    this.session = s;
    return s;
  }

  private host(): void {
    void this.newSession().host();
  }

  private async join(): Promise<void> {
    const code = await askRoomCode();
    if (!code || !this.sys.isActive() || this.view.step !== 'choose') return;
    void this.newSession().join(code);
  }

  /** Hủy tạo phòng / chờ / kết nối, quay lại bước chọn. */
  private cancel(): void {
    this.session?.close();
    this.session = null;
    this.show({ step: 'choose' });
  }

  private back(): void {
    // Đang nhập mã phòng: Back đóng hộp nhập
    if (nameDialogBack()) return;
    if (this.view.step === 'choose' || this.view.step === 'error') {
      this.session?.close();
      this.session = null;
      this.scene.start('Menu');
    } else {
      this.cancel();
    }
  }
}
