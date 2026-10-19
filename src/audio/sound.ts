import Phaser from 'phaser';
import { loadSoundSettings, saveSoundSettings, type SoundSettings } from '../game/storage';
import type { AttackKind } from '../pvp/attacks';
import { MusicPlayer } from './music';
import { muteToggled, type SoundSwitches } from './rules';
import { SOUND_SETS, type SfxName } from './sets';
import { Synth } from './synth';

/**
 * Âm thanh dùng chung cho mọi scene: hiệu ứng, tiếng bị tấn công và nhạc nền theo cài đặt của người chơi.
 * Sống ngoài các scene (như toast.ts), nên nhạc chạy tiếp qua scene.restart (sang màn sau, chơi lại, đấu lại).
 * Máy không có Web Audio (hoặc chưa initSound) thì mọi hàm ở đây không làm gì.
 */

/** Khoảng gọi MusicPlayer.pump (ms); nhỏ hơn nhiều so với LOOKAHEAD. */
const PUMP_MS = 40;

let ctx: AudioContext | null = null;
let synth: Synth | null = null;
let player: MusicPlayer | null = null;
let settings: SoundSettings | null = null;
/** Scene đang muốn có nhạc (màn chơi, màn chọn âm thanh); nhạc chỉ phát khi cờ này bật và cài đặt cho phép. */
let wanted = false;
/** Trạng thái trước lần bấm nút loa gần nhất, để bấm lại thì trả về như cũ. Không lưu. */
let remembered: SoundSwitches | null = null;

function current(): SoundSettings {
  return (settings ??= loadSoundSettings());
}

function syncMusic(): void {
  const s = current();
  player?.play(wanted && s.music ? s.set : null);
}

/** Gọi một lần trong main.ts, ngay sau khi tạo game (Phaser tạo game.sound trong constructor). */
export function initSound(game: Phaser.Game): void {
  const sm = game.sound;
  if (!(sm instanceof Phaser.Sound.WebAudioSoundManager)) return;
  // Trang bị ẩn đã có HIDDEN lo; mất focus mà vẫn hiện (chia đôi màn hình) thì vẫn phải có tiếng
  sm.pauseOnBlur = false;
  const c = sm.context;
  const s = new Synth(c, sm.destination);
  ctx = c;
  synth = s;
  player = new MusicPlayer({ now: () => c.currentTime, voices: s, createOutput: () => s.musicOutput() });
  window.setInterval(() => player?.pump(), PUMP_MS);
  // App xuống nền: im ngay; quay lại thì chạy tiếp (MusicPlayer bỏ qua phần nhạc đã lỡ)
  game.events.on(Phaser.Core.Events.HIDDEN, () => void c.suspend().catch(() => {}));
  game.events.on(Phaser.Core.Events.VISIBLE, () => void c.resume().catch(() => {}));
  syncMusic();
}

export function soundSettings(): SoundSettings {
  return { ...current() };
}

/** Đổi cài đặt âm thanh: lưu ngay và có hiệu lực ngay (nhạc bật / tắt / đổi bộ). */
export function updateSoundSettings(patch: Partial<SoundSettings>): void {
  settings = { ...current(), ...patch };
  saveSoundSettings(settings);
  syncMusic();
}

/** Nút loa trong màn chơi (xem rules.muteToggled). */
export function toggleMute(): void {
  const r = muteToggled(current(), remembered);
  remembered = r.remembered;
  updateSoundSettings(r.next);
}

/**
 * Lúc phát hiệu ứng theo đồng hồ âm thanh, hoặc null nếu không phát: hiệu ứng đang tắt, hay context chưa chạy
 * (chưa mở khóa bằng lần chạm đầu, hoặc trang đang ẩn). Không phát được thì bỏ luôn, để không dồn lại thành một tràng.
 */
function sfxTime(): number | null {
  if (!ctx || !synth || !current().sfx || ctx.state !== 'running') return null;
  return ctx.currentTime + 0.01;
}

/** Phát một hiệu ứng của bộ đang chọn; `step` là bậc cao độ của tiếng nối cặp (xem rules.pitchStep). */
export function playSfx(name: SfxName, step = 0): void {
  const t = sfxTime();
  if (t !== null) SOUND_SETS[current().set].sfx[name](synth!, t, step);
}

/** Tiếng bị đối thủ tấn công khi đấu online. */
export function playHit(kind: AttackKind): void {
  const t = sfxTime();
  if (t !== null) SOUND_SETS[current().set].hit[kind](synth!, t);
}

/** Scene muốn có nhạc nền. Nhạc đang phát đúng bộ thì chạy tiếp, không phát lại từ đầu. */
export function startMusic(): void {
  wanted = true;
  syncMusic();
}

/** Tắt dần nhạc nền. */
export function stopMusic(): void {
  wanted = false;
  syncMusic();
}
