import { PvpError, type Role } from './protocol';

/**
 * Kết nối WebRTC giữa hai máy: một kênh dữ liệu (data channel) có thứ tự, không mất tin.
 * - Hai máy trao đổi mô tả kết nối (SDP) qua SignalChannel (signaling.ts, dùng Realtime Database).
 * - Không gửi từng địa chỉ (ICE candidate) một: chờ thu thập xong mọi địa chỉ, kể cả địa chỉ trên máy chủ TURN,
 *   rồi gửi cả mô tả trong một lần (chậm hơn chừng một giây nhưng chỉ cần hai lần ghi).
 * - Nối thẳng được thì nối thẳng; mạng chặn thì đi qua máy chủ TURN (turn.ts).
 * - Mất kết nối giữa trận (đổi mạng...): chủ phòng khởi động lại ICE bằng lời mời mới, khách trả lời như lần đầu.
 */

/** Mô tả kết nối kèm số lần thương lượng: mỗi lần khởi động lại ICE tăng số này. */
export interface Description {
  n: number;
  sdp: string;
}

/** Đường gửi mô tả kết nối: chủ phòng gửi lời mời (offer) và nghe câu trả lời (answer), khách thì ngược lại. */
export interface SignalChannel {
  send(d: Description): Promise<void>;
  /** Nghe mô tả của máy kia; trả về hàm gỡ. */
  listen(fn: (d: Description) => void): () => void;
}

export type LinkStatus = 'connected' | 'reconnecting' | 'closed';

/** Kết nối đã mở tới máy kia. */
export interface PeerLink {
  send(raw: string): void;
  onMessage: ((raw: string) => void) | null;
  /** Mất kết nối tạm thời, kết nối lại được, hoặc đóng hẳn (máy kia đóng, hay không nối lại được). */
  onStatus: ((status: LinkStatus) => void) | null;
  /** Kết nối có đi qua máy chủ chuyển tiếp TURN không. */
  relayed(): Promise<boolean>;
  close(): void;
}

/** Không mở được kênh trong chừng này thời gian thì coi như không kết nối được. */
const CONNECT_TIMEOUT_MS = 20000;
/** Thu thập địa chỉ lâu hơn thế thì gửi luôn những gì đã có. */
const GATHER_TIMEOUT_MS = 3000;
/** Mất kết nối chừng này thì chủ phòng thử khởi động lại ICE (hỏng hẳn thì thử ngay). */
const RESTART_AFTER_MS = 2000;
/** Đóng hẳn sau khi đóng kênh chừng này, để tin cuối cùng (báo rời phòng) kịp gửi đi. */
const CLOSE_DELAY_MS = 500;

/** Mở kết nối; xong khi kênh dữ liệu đã mở, lỗi PvpError('timeout') nếu quá lâu. */
export function openPeer(
  role: Role,
  iceServers: RTCIceServer[],
  signal: SignalChannel,
  forceRelay = false,
): Promise<PeerLink> {
  // forceRelay: chỉ đi qua TURN, để thử máy chủ TURN khi hai máy vốn nối thẳng được
  const pc = new RTCPeerConnection({ iceServers, iceTransportPolicy: forceRelay ? 'relay' : 'all' });
  // Hai bên cùng tạo một kênh có sẵn số hiệu, không phải chờ sự kiện ondatachannel
  const channel = pc.createDataChannel('game', { negotiated: true, id: 0, ordered: true });
  let opened = false;
  let closed = false;
  /** Chủ phòng: số của lời mời gần nhất. Khách: số của lời mời đã trả lời gần nhất. */
  let round = 0;
  let restartTimer: ReturnType<typeof setTimeout> | undefined;

  // Các bước thương lượng chạy lần lượt, không chồng lên nhau
  let queue = Promise.resolve();
  const run = (task: () => Promise<void>) => {
    queue = queue.then(task).catch((e: unknown) => console.warn('Thương lượng WebRTC lỗi:', e));
  };

  /** Áp mô tả của máy này, chờ thu thập xong địa chỉ, trả về mô tả đầy đủ để gửi. */
  const localSdp = async (apply: () => Promise<void>): Promise<string> => {
    const gathered = new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined = undefined;
      const onCandidate = (e: RTCPeerConnectionIceEvent) => {
        if (!e.candidate) finish(); // candidate null: đã thu thập xong
      };
      const finish = () => {
        clearTimeout(timer);
        pc.removeEventListener('icecandidate', onCandidate);
        resolve();
      };
      timer = setTimeout(finish, GATHER_TIMEOUT_MS);
      pc.addEventListener('icecandidate', onCandidate);
    });
    await apply();
    await gathered;
    return pc.localDescription?.sdp ?? '';
  };

  const offer = (iceRestart: boolean) =>
    run(async () => {
      const n = ++round;
      const sdp = await localSdp(async () => pc.setLocalDescription(await pc.createOffer({ iceRestart })));
      if (!closed) await signal.send({ n, sdp });
    });

  const unlisten = signal.listen((d) =>
    run(async () => {
      if (closed) return;
      if (role === 'host') {
        // Chỉ nhận câu trả lời cho lời mời đang chờ (bỏ câu trả lời cũ còn lưu trong phòng)
        if (d.n === round && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
        }
      } else if (d.n > round) {
        round = d.n;
        await pc.setRemoteDescription({ type: 'offer', sdp: d.sdp });
        const sdp = await localSdp(async () => pc.setLocalDescription(await pc.createAnswer()));
        if (!closed) await signal.send({ n: d.n, sdp });
      }
    }),
  );

  const link: PeerLink = {
    onMessage: null,
    onStatus: null,
    send(raw) {
      if (channel.readyState === 'open') channel.send(raw);
    },
    relayed: () => isRelayed(pc),
    close() {
      if (closed) return;
      closed = true;
      unlisten();
      clearTimeout(restartTimer);
      channel.close();
      setTimeout(() => pc.close(), CLOSE_DELAY_MS);
    },
  };

  channel.onmessage = (e: MessageEvent) => {
    if (typeof e.data === 'string') link.onMessage?.(e.data);
  };
  channel.onclose = () => {
    if (closed) return;
    link.close();
    link.onStatus?.('closed');
  };

  pc.addEventListener('connectionstatechange', () => {
    const state = pc.connectionState;
    if (!opened || closed) return;
    if (state === 'connected') {
      clearTimeout(restartTimer);
      restartTimer = undefined;
      link.onStatus?.('connected');
    } else if (state === 'disconnected' || state === 'failed') {
      link.onStatus?.('reconnecting');
      // Chủ phòng tìm lại đường nối (ví dụ khi máy đổi từ Wi-Fi sang 4G); khách chỉ cần trả lời lời mời mới
      if (role === 'host' && restartTimer === undefined) {
        restartTimer = setTimeout(
          () => {
            restartTimer = undefined;
            if (!closed && pc.connectionState !== 'connected') offer(true);
          },
          state === 'failed' ? 0 : RESTART_AFTER_MS,
        );
      }
    }
  });

  if (role === 'host') offer(false);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      link.close();
      reject(new PvpError('timeout'));
    }, CONNECT_TIMEOUT_MS);
    channel.onopen = () => {
      clearTimeout(timer);
      opened = true;
      resolve(link);
    };
  });
}

/** Cặp địa chỉ đang dùng có đầu nào nằm trên máy chủ TURN không. */
async function isRelayed(pc: RTCPeerConnection): Promise<boolean> {
  try {
    const stats = await pc.getStats();
    let pair: { localCandidateId?: string; remoteCandidateId?: string } | undefined;
    stats.forEach((r) => {
      if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId);
    });
    // Trình duyệt không có selectedCandidatePairId (Firefox): lấy cặp địa chỉ đang được chọn
    if (!pair) {
      stats.forEach((r) => {
        if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected)) pair = r;
      });
    }
    if (!pair) return false;
    return [pair.localCandidateId, pair.remoteCandidateId].some((id) => id && stats.get(id)?.candidateType === 'relay');
  } catch {
    return false;
  }
}
