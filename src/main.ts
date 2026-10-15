import Phaser from 'phaser';
import { GameScene, GAME_W, GAME_H } from './scenes/GameScene';

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
  scene: [GameScene],
});

// Truy cập game từ DevTools khi phát triển: window.game.scene.getScene('Game')
if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
