import Phaser from 'phaser';
import { loadSoundSettings, saveSoundSettings, type SoundSettings } from '../game/storage';
import type { AttackKind } from '../pvp/attacks';
import { MusicPlayer, type MusicKind } from './music';
import { muteToggled, type SoundSwitches } from './rules';
import { SOUND_SETS, type SfxName } from './sets';
import { Synth } from './synth';
import { unlockOnGesture } from './unlock';

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
/** Bản nhạc scene đang muốn (trong màn chơi hay ở menu), null là im; nhạc chỉ phát khi cài đặt cho phép. */
let wanted: MusicKind | null = null;
/** Trạng thái trước lần bấm nút loa gần nhất, để bấm lại thì trả về như cũ. Không lưu. */
let remembered: SoundSwitches | null = null;

function current(): SoundSettings {
  return (settings ??= loadSoundSettings());
}

function syncMusic(): void {
  const s = current();
  player?.play(wanted && s.music ? { set: s.set, kind: wanted } : null);
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
  // Lần chạm đầu tiên ở bất kỳ đâu (cả hộp nhập tên lúc mới mở game) mở khóa âm thanh, để nhạc menu chạy ngay
  unlockOnGesture(c);
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

/**
 * Phát một hiệu ứng của bộ đang chọn, sau `delay` giây (theo đồng hồ âm thanh). `step` là bậc cao độ của tiếng nối cặp
 * (xem rules.pitchStep), hoặc 1 cho tiếng tích gấp của 3 giây cuối.
 */
export function playSfx(name: SfxName, step = 0, delay = 0): void {
  const t = sfxTime();
  if (t !== null) SOUND_SETS[current().set].sfx[name](synth!, t + delay, step);
}

/** Tiếng bị đối thủ tấn công khi đấu online. */
export function playHit(kind: AttackKind): void {
  const t = sfxTime();
  if (t !== null) SOUND_SETS[current().set].hit[kind](synth!, t);
}

/**
 * Scene muốn có nhạc nền: bản trong màn chơi (`game`) hay bản ở menu (`menu`) của bộ đang chọn.
 * Đang phát đúng bản đó thì chạy tiếp, không phát lại từ đầu; bản khác thì chuyển dần sang.
 */
export function startMusic(kind: MusicKind = 'game'): void {
  wanted = kind;
  syncMusic();
}

/** Tắt dần nhạc nền. */
export function stopMusic(): void {
  wanted = null;
  syncMusic();
}
