import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { MenuScene } from './scenes/MenuScene';
import { sizeFor } from './scenes/ui';

const initial = sizeFor(window.innerWidth, window.innerHeight);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: initial.width,
  height: initial.height,
  backgroundColor: '#1f3b4d',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // Scene đầu tiên trong danh sách được chạy khi mở game
  scene: [MenuScene, LevelSelectScene, GameScene],
});

// Xoay máy hoặc đổi tỉ lệ cửa sổ: đổi kích thước logic cho khớp màn hình.
// Các scene nghe sự kiện resize (qua onGameResize) để sắp xếp lại bố cục.
function fitViewport(): void {
  if (!game.isBooted) return;
  const { width, height } = sizeFor(window.innerWidth, window.innerHeight);
  if (game.scale.width !== width || game.scale.height !== height) game.scale.setGameSize(width, height);
}
// Chờ cửa sổ thôi thay đổi (kéo cửa sổ bắn rất nhiều sự kiện) rồi mới dựng lại bố cục
let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(fitViewport, 120);
});
game.events.once(Phaser.Core.Events.READY, fitViewport);

// Truy cập game từ DevTools khi phát triển: window.game.scene.getScene('Game')
if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
