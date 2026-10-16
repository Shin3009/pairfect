/**
 * Danh sách máy chủ STUN/TURN cho WebRTC, lấy từ Metered (metered.ca).
 * - STUN giúp hai máy tìm địa chỉ công khai của nhau để nối thẳng (đủ cho phần lớn mạng Wi-Fi).
 * - TURN là máy chủ chuyển tiếp, dùng khi mạng không cho nối thẳng (nhiều mạng 4G/5G, mạng công ty).
 * VITE_METERED_API_KEY là API key của một credential TURN, không phải Secret Key của tài khoản: Metered
 * thiết kế key này để nằm trong app, nó chỉ đọc được thông tin đăng nhập của chính credential đó.
 * Thiếu cấu hình hoặc lấy lỗi thì chỉ dùng STUN: vẫn chơi được trên mạng cho phép nối thẳng.
 */

const STUN_ONLY: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
const FETCH_TIMEOUT_MS = 8000;
/** Dùng lại danh sách đã lấy trong chừng này thời gian (credential có thể có hạn dùng). */
const CACHE_MS = 10 * 60 * 1000;

let cache: { at: number; servers: Promise<RTCIceServer[]> } | null = null;

function isIceServer(v: unknown): v is RTCIceServer {
  if (typeof v !== 'object' || v === null) return false;
  const { urls, username, credential } = v as Record<string, unknown>;
  const urlsOk = typeof urls === 'string' || (Array.isArray(urls) && urls.every((u) => typeof u === 'string'));
  return urlsOk && (username === undefined || typeof username === 'string') && (credential === undefined || typeof credential === 'string');
}

async function fetchServers(domain: string, apiKey: string): Promise<RTCIceServer[]> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = `https://${domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { signal: abort.signal });
    if (!res.ok) throw new Error(`Metered trả về ${res.status}`);
    const servers: unknown = await res.json();
    if (!Array.isArray(servers) || !servers.length || !servers.every(isIceServer)) throw new Error('Metered trả về dữ liệu lạ');
    return servers;
  } finally {
    clearTimeout(timer);
  }
}

/** Danh sách máy chủ ICE cho RTCPeerConnection; không bao giờ lỗi (lỗi thì chỉ có STUN). */
export function iceServers(): Promise<RTCIceServer[]> {
  const domain = import.meta.env.VITE_METERED_DOMAIN;
  const apiKey = import.meta.env.VITE_METERED_API_KEY;
  if (!domain || !apiKey) return Promise.resolve(STUN_ONLY);
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.servers;
  const servers = fetchServers(domain, apiKey).catch((e: unknown) => {
    console.warn('Không lấy được máy chủ TURN, chỉ dùng STUN:', e);
    cache = null; // lần sau thử lấy lại
    return STUN_ONLY;
  });
  cache = { at: Date.now(), servers };
  return servers;
}
