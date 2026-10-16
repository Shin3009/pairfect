import type Phaser from 'phaser';
import { loadPlayerName } from '../game/storage';
import { linkPair } from './loopback';
import type { Match } from './match';
import { PvpSession } from './session';

/**
 * Chỉ dùng khi phát triển: đấu với máy ngay trên trình duyệt, không cần mạng, Firebase hay TURN
 * (gõ `pvpBot()` trong DevTools, xem main.ts). Hai PvpSession nối với nhau bằng kết nối giả trong bộ nhớ:
 * người chơi là chủ phòng, máy là khách, cứ `stepMs` lại ăn một cặp và luôn đồng ý đấu lại.
 * Dùng để thử giao diện trận đấu (đếm ngược, bàn thu nhỏ của đối thủ, kết quả, đấu lại).
 */
export function startBotMatch(game: Phaser.Game, stepMs = 2500): void {
  const [mine, theirs] = linkPair(40);
  const me = new PvpSession(loadPlayerName() ?? 'Bạn');
  const bot = new PvpSession('Máy');
  bot.role = 'guest';
  bot.listener = { onStart: (m) => play(m, stepMs), onRematch: () => bot.requestRematch() };
  // Như phòng chờ: trận đầu tiên bắt đầu thì mở màn chơi (scene đang chạy tự tắt khi chuyển)
  me.listener = { onStart: () => game.scene.getScenes(true)[0]?.scene.start('Game', { pvp: me }) };
  bot.attach(theirs);
  me.attach(mine);
}

function play(m: Match, stepMs: number): void {
  const timer = setInterval(() => {
    if (m.outcome) return clearInterval(timer);
    if (!m.canPlay()) return;
    const move = m.me.board.findAnyMove();
    if (move) m.play(move[0], move[1]);
    else m.shuffle(true);
  }, stepMs);
}
