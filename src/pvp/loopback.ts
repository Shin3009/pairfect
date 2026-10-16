import type { PeerLink } from './peer';

/**
 * Hai đầu của một kết nối giả trong bộ nhớ: gửi ở đầu này thì đầu kia nhận sau `latencyMs`
 * (luôn bất đồng bộ và giữ thứ tự, như kênh dữ liệu WebRTC). Dùng cho test và cho đấu với máy khi phát triển (bot.ts).
 */
export function linkPair(latencyMs = 0): [PeerLink, PeerLink] {
  let open = true;
  const make = (): PeerLink => ({
    onMessage: null,
    onStatus: null,
    send(raw) {
      if (!open) return;
      const other = this === ends[0] ? ends[1] : ends[0];
      setTimeout(() => other.onMessage?.(raw), latencyMs);
    },
    relayed: () => Promise.resolve(false),
    close() {
      if (!open) return;
      open = false;
      // Tin gửi trước khi đóng vẫn tới trước, rồi đầu kia mới thấy kết nối đóng
      const other = this === ends[0] ? ends[1] : ends[0];
      setTimeout(() => other.onStatus?.('closed'), latencyMs);
    },
  });
  const ends: [PeerLink, PeerLink] = [make(), make()];
  return ends;
}
