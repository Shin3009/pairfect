import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { MenuScene } from './scenes/MenuScene';
import { GAME_H, GAME_W } from './scenes/ui';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#1f3b4d',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // Scene đầu tiên trong danh sách được chạy khi mở game
  scene: [MenuScene, LevelSelectScene, GameScene],
});

// Truy cập game từ DevTools khi phát triển: window.game.scene.getScene('Game')
if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
