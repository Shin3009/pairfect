import Phaser from 'phaser';
import { SOUND_SETS } from '../audio/sets';
import { playSfx, soundSettings, startMusic, updateSoundSettings } from '../audio/sound';
import { SOUND_SET_IDS, type SoundSetId } from '../game/storage';
import { onBack } from '../native';
import { Button, C, onGameResize, tapZone, textStyle } from './ui';

const LIST_TOP = 124;
const CARD_H = 100;
const CARD_GAP = 16;
const CARD_MAX_W = 980;
/** Hàng hai công tắc Hiệu ứng / Nhạc nền, dưới các thẻ. */
const TOGGLE_Y = 528;
const TOGGLE_W = 300;
const TOGGLE_H = 68;
const TOGGLE_GAP = 24;

interface Card {
  id: SoundSetId;
  bg: Phaser.GameObjects.Graphics;
  name: Phaser.GameObjects.Text;
  note: Phaser.GameObjects.Text;
  x: number;
  y: number;
  w: number;
}

interface Toggle {
  key: 'sfx' | 'music';
  label: string;
  bg: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
  x: number;
}

/**
 * Chọn bộ âm thanh (mỗi bộ một thẻ, chạm để chọn và nghe mẫu) và bật / tắt hiệu ứng, nhạc nền.
 * Trong lúc mở, nhạc nền của bộ đang chọn được phát (nếu nhạc đang bật); về menu thì menu tắt nhạc.
 */
export class SoundScene extends Phaser.Scene {
  private cards: Card[] = [];
  private toggles: Toggle[] = [];

  constructor() {
    super('Sound');
  }

  create(): void {
    this.cards = [];
    this.toggles = [];
    this.cameras.main.setBackgroundColor(C.bg).fadeIn(250, 31, 59, 77);
    onGameResize(this, () => this.scene.restart());
    onBack(this, () => this.back());

    const W = this.scale.width;
    const x = W / 2;
    this.add.text(x, 62, 'Âm thanh', textStyle(56, C.text, 'bold')).setOrigin(0.5);

    const w = Math.min(W - 120, CARD_MAX_W);
    const left = x - w / 2;
    SOUND_SET_IDS.forEach((id, i) => {
      const y = LIST_TOP + i * (CARD_H + CARD_GAP);
      const cy = y + CARD_H / 2;
      const set = SOUND_SETS[id];
      const bg = this.add.graphics();
      const name = this.add.text(left + 32, cy - 16, set.name, textStyle(30, C.text, 'bold')).setOrigin(0, 0.5);
      this.add.text(left + 32, cy + 20, set.desc, textStyle(20, C.textDim)).setOrigin(0, 0.5);
      const note = this.add.text(left + w - 32, cy, 'Đang dùng', textStyle(22, C.textAccent, 'bold')).setOrigin(1, 0.5);
      // Chọn bộ đã phát tiếng mẫu, không phát thêm tiếng bấm nút
      tapZone(this, x, cy, w, CARD_H, 1, () => this.choose(id), false);
      this.cards.push({ id, bg, name, note, x: left, y, w });
    });

    const switches: ['sfx' | 'music', string][] = [
      ['sfx', 'Hiệu ứng'],
      ['music', 'Nhạc nền'],
    ];
    switches.forEach(([key, label], i) => {
      const tx = x + (i === 0 ? -1 : 1) * ((TOGGLE_W + TOGGLE_GAP) / 2);
      const bg = this.add.graphics();
      const text = this.add.text(tx, TOGGLE_Y, '', textStyle(28, C.text, 'bold')).setOrigin(0.5);
      tapZone(this, tx, TOGGLE_Y, TOGGLE_W, TOGGLE_H, 1, () => this.flip(key));
      this.toggles.push({ key, label, bg, text, x: tx });
    });
    this.redraw();

    new Button(this, x, 652, 320, 76, 'Quay lại', () => this.back(), 1, 30);
    // Nhạc trong màn chơi của bộ đang chọn, để nghe thử
    startMusic('game');
  }

  private choose(id: SoundSetId): void {
    updateSoundSettings({ set: id });
    this.redraw();
    // Nghe mẫu: tiếng chọn ô rồi tiếng nối cặp
    playSfx('select');
    this.time.delayedCall(150, () => playSfx('match'));
  }

  /** Đổi một công tắc. Tiếng bấm nút phát sau khi đổi (xem tapZone): tắt hiệu ứng thì im, bật lại thì nghe ngay. */
  private flip(key: 'sfx' | 'music'): void {
    updateSoundSettings({ [key]: !soundSettings()[key] });
    this.redraw();
  }

  /** Thẻ của bộ đang chọn có viền và tên màu nhấn, kèm chữ "Đang dùng"; công tắc bật có nền màu nhấn. */
  private redraw(): void {
    const s = soundSettings();
    for (const c of this.cards) {
      const on = c.id === s.set;
      c.bg.clear().fillStyle(C.panel, 1).fillRoundedRect(c.x, c.y, c.w, CARD_H, 20);
      if (on) c.bg.lineStyle(5, C.accent, 1).strokeRoundedRect(c.x, c.y, c.w, CARD_H, 20);
      c.name.setColor(on ? C.textAccent : C.text);
      c.note.setVisible(on);
    }
    for (const t of this.toggles) {
      const on = s[t.key];
      t.bg
        .clear()
        .fillStyle(on ? C.accent : C.disabled, 1)
        .fillRoundedRect(t.x - TOGGLE_W / 2, TOGGLE_Y - TOGGLE_H / 2, TOGGLE_W, TOGGLE_H, TOGGLE_H / 2);
      t.text.setText(`${t.label}: ${on ? 'Bật' : 'Tắt'}`).setColor(on ? C.textDark : C.text);
    }
  }

  private back(): void {
    this.scene.start('Menu');
  }
}
