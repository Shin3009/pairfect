import Phaser from 'phaser';
import { initSound, playHit, playSfx, startMusic, stopMusic, updateSoundSettings } from './audio/sound';
import { bindAppEvents, initSaveBackup } from './native';
import { initOnline, onSyncResult } from './online';
import { GameScene } from './scenes/GameScene';
import { LeaderboardScene } from './scenes/LeaderboardScene';
import { MenuScene } from './scenes/MenuScene';
import { PvpLobbyScene } from './scenes/PvpLobbyScene';
import { TileArtScene } from './scenes/TileArtScene';
import { sizeFor } from './scenes/ui';
import { showToast } from './toast';

// Android: lấy lại bản lưu lượt chơi mới nhất trước khi menu đọc nó (xem native.ts)
await initSaveBackup();

// Khung chứa game: cả màn hình trừ phần tai thỏ / camera đục lỗ (xem index.html)
const parent = document.getElementById('game')!;
const initial = sizeFor(parent.clientWidth, parent.clientHeight);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent,
  width: initial.width,
  height: initial.height,
  backgroundColor: '#1f3b4d',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // Scene đầu tiên trong danh sách được chạy khi mở game
  scene: [MenuScene, GameScene, LeaderboardScene, TileArtScene, PvpLobbyScene],
});

// Hiệu ứng và nhạc nền, dùng chung cho mọi scene (xem audio/sound.ts)
initSound(game);

// Tỉ lệ màn hình đổi (chia đôi màn hình, kéo cửa sổ): đổi chiều rộng logic cho khớp.
// Các scene nghe sự kiện resize (qua onGameResize) để sắp xếp lại bố cục.
// Game chỉ chơi màn ngang: app Android khóa hướng ngang, trình duyệt dọc thì index.html hiện lời nhắc xoay máy.
function fitViewport(): void {
  if (!game.isBooted) return;
  const { width, height } = sizeFor(parent.clientWidth, parent.clientHeight);
  if (game.scale.width !== width || game.scale.height !== height) game.scale.setGameSize(width, height);
}
// Theo dõi chính khung chứa: nó đổi cả khi cửa sổ giữ nguyên mà vùng tai thỏ đổi.
// Chờ khung thôi thay đổi (kéo cửa sổ bắn rất nhiều sự kiện) rồi mới dựng lại bố cục.
let resizeTimer = 0;
new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(fitViewport, 120);
}).observe(parent);
game.events.once(Phaser.Core.Events.READY, fitViewport);

// Nút Back của Android và việc app bị đưa xuống nền (xem native.ts)
bindAppEvents(game);

// Đồng bộ kỷ lục lên Firebase, gửi lại nếu lần chơi trước chưa gửi được (xem online.ts).
// Mỗi lần gửi đều báo cho người chơi bằng thông báo nhỏ, ở bất kỳ màn hình nào.
onSyncResult((r) => {
  if (!r.ok) showToast('Chưa gửi được kỷ lục lên bảng xếp hạng, sẽ thử lại sau.', 'error');
  else if (r.previous?.score === r.best.score && r.previous.stage === r.best.stage)
    showToast(`Đã đổi tên trên bảng xếp hạng thành ${r.best.name}`);
  else showToast(`Đã gửi kỷ lục ${r.best.score} điểm lên bảng xếp hạng`);
});
initOnline();

// Truy cập game từ DevTools khi phát triển: window.game.scene.getScene('Game'),
// pvpBot() để thử giao diện đấu online với máy, không cần mạng (xem pvp/bot.ts), và sound để nghe thử âm thanh
if (import.meta.env.DEV) {
  const w = window as unknown as { game: Phaser.Game; pvpBot: (stepMs?: number) => void; sound: object };
  w.game = game;
  // sound.playSfx('match', 3), sound.playHit('fog'), sound.startMusic()... để nghe thử âm thanh (chạm vào game một lần trước)
  w.sound = { playSfx, playHit, startMusic, stopMusic, updateSoundSettings };
  w.pvpBot = (stepMs) => void import('./pvp/bot').then(({ startBotMatch }) => startBotMatch(game, stepMs));
}
