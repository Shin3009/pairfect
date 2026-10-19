import type { Database } from 'firebase/database';
import { cleanName } from '../game/storage';
import { firebaseApp, onlineEnabled } from '../online';
import type { Description, SignalChannel } from './peer';
import { PROTOCOL, PvpError, randomCode } from './protocol';

/**
 * Phòng chờ của đấu online trên Firebase Realtime Database: hai máy tìm nhau bằng mã phòng rồi trao đổi
 * mô tả kết nối WebRTC (peer.ts). Khi đã nối được với nhau, tin nhắn trong trận đi thẳng giữa hai máy
 * (hoặc qua máy chủ TURN), không qua Firebase; phòng chỉ được giữ lại để khởi động lại kết nối khi cần.
 *
 * `pvpRooms/<mã>` = { host, hostName, protocol, createdAt, guest?: { uid, name }, offer?, answer? }
 * - Chủ phòng tạo phòng; phòng tự xóa khi chủ phòng mất kết nối với Firebase (onDisconnect) hoặc rời phòng.
 * - Khách vào phòng còn trống bằng cách ghi `guest`; tự xóa khi khách mất kết nối hoặc rời phòng.
 * - `offer` / `answer`: mô tả kết nối của chủ phòng / khách (xem Description).
 * database.rules.json chỉ cho chủ phòng sửa phòng của mình, và khách chỉ ghi `guest` và `answer`. Người ngoài chỉ đọc
 * được `hostName`, `protocol` và `guest`; `offer` / `answer` chứa địa chỉ IP nên chỉ chủ phòng và khách đọc được.
 * Thư viện Firebase Database chỉ được tải khi mở phòng chờ.
 */
const ROOMS = 'pvpRooms';
/** Thử mã khác khi mã vừa chọn đã có phòng (gần như không bao giờ xảy ra: hơn một tỉ mã). */
const CREATE_ATTEMPTS = 5;

type DatabaseModule = typeof import('firebase/database');

export interface Room {
  code: string;
  hostName: string;
  signal: SignalChannel;
  /** Chủ phòng: chờ tới khi có khách vào phòng. */
  waitForGuest(): Promise<{ name: string }>;
  /** Chủ phòng: mời khách ra (không kết nối được với khách) để chờ khách khác. */
  kickGuest(): Promise<void>;
  leave(): Promise<void>;
}

function databaseUrl(): string | undefined {
  return import.meta.env.VITE_FIREBASE_DATABASE_URL || undefined;
}

/** Bản build có đấu online không: cần Firebase (đăng nhập ẩn danh), Realtime Database và trình duyệt có WebRTC. */
export function pvpEnabled(): boolean {
  return onlineEnabled() && !!databaseUrl() && typeof RTCPeerConnection === 'function';
}

async function connect(): Promise<{ fdb: DatabaseModule; db: Database; uid: string }> {
  const url = databaseUrl();
  if (!url) throw new PvpError('config');
  const [{ app, uid }, fdb] = await Promise.all([firebaseApp(), import('firebase/database')]);
  const db = fdb.getDatabase(app, url);
  // Lần trước rời phòng đã ngắt kết nối (xem leave)
  fdb.goOnline(db);
  return { fdb, db, uid };
}

const isDescription = (v: unknown): v is Description =>
  typeof v === 'object' && v !== null && Number.isInteger((v as Description).n) && typeof (v as Description).sdp === 'string';

/** Tạo phòng với mã ngẫu nhiên. */
export async function createRoom(name: string): Promise<Room> {
  const { fdb, db, uid } = await connect();
  for (let attempt = 1; ; attempt++) {
    const code = randomCode();
    const ref = fdb.ref(db, `${ROOMS}/${code}`);
    try {
      // Luật chỉ cho tạo phòng khi mã chưa có, nên mã trùng với phòng của người khác thì bị từ chối
      await fdb.set(ref, { host: uid, hostName: name, protocol: PROTOCOL, createdAt: fdb.serverTimestamp() });
    } catch (e) {
      if (attempt < CREATE_ATTEMPTS) continue;
      throw e;
    }
    await fdb.onDisconnect(ref).remove();
    return makeRoom(fdb, db, code, 'host', name);
  }
}

/** Vào phòng bằng mã (đã qua cleanCode). Lỗi PvpError nếu không có phòng, phòng đã có khách hay khác phiên bản. */
export async function joinRoom(code: string, name: string): Promise<Room> {
  const { fdb, db, uid } = await connect();
  // Chỉ đọc phần công khai của phòng: database.rules.json không cho người ngoài đọc cả phòng (offer có địa chỉ IP)
  const read = async (child: string): Promise<unknown> => (await fdb.get(fdb.ref(db, `${ROOMS}/${code}/${child}`))).val();
  const [protocol, hostName, guestEntry] = await Promise.all([read('protocol'), read('hostName'), read('guest')]);
  if (protocol === null) throw new PvpError('not-found');
  if (protocol !== PROTOCOL) throw new PvpError('version');
  if (guestEntry) throw new PvpError('full');
  const guest = fdb.ref(db, `${ROOMS}/${code}/guest`);
  try {
    // Luật chỉ cho ghi khi phòng chưa có khách: hai người cùng vào thì một người bị từ chối
    await fdb.set(guest, { uid, name });
  } catch {
    throw new PvpError('full');
  }
  await fdb.onDisconnect(guest).remove();
  return makeRoom(fdb, db, code, 'guest', typeof hostName === 'string' ? cleanName(hostName) || '?' : '?');
}

function makeRoom(fdb: DatabaseModule, db: Database, code: string, role: 'host' | 'guest', hostName: string): Room {
  const path = `${ROOMS}/${code}`;
  const unsubscribes = new Set<() => void>();
  const listen = (child: string, fn: (value: unknown) => void) => {
    const off = fdb.onValue(fdb.ref(db, `${path}/${child}`), (snap) => fn(snap.val()));
    unsubscribes.add(off);
    return () => {
      off();
      unsubscribes.delete(off);
    };
  };

  const signal: SignalChannel = {
    send: (d) => fdb.set(fdb.ref(db, `${path}/${role === 'host' ? 'offer' : 'answer'}`), d),
    listen: (fn) =>
      listen(role === 'host' ? 'answer' : 'offer', (v) => {
        if (isDescription(v)) fn(v);
      }),
  };

  let left = false;
  return {
    code,
    hostName,
    signal,
    waitForGuest: () =>
      new Promise((resolve) => {
        let done = false;
        const off = listen('guest', (v) => {
          const guest = v as { name?: unknown } | null;
          if (done || typeof guest?.name !== 'string') return;
          done = true;
          // Gỡ sau khi onValue trả về: hàm gỡ có thể chưa có nếu dữ liệu đọc từ bộ nhớ đệm (gọi ngay lập tức)
          queueMicrotask(() => off());
          resolve({ name: cleanName(guest.name) || '?' });
        });
      }),
    kickGuest: () => fdb.update(fdb.ref(db, path), { guest: null, offer: null, answer: null }),
    async leave() {
      if (left) return;
      left = true;
      unsubscribes.forEach((off) => off());
      unsubscribes.clear();
      try {
        if (role === 'host') {
          await fdb.remove(fdb.ref(db, path));
        } else {
          const guest = fdb.ref(db, `${path}/guest`);
          await fdb.onDisconnect(guest).cancel();
          await fdb.remove(guest);
        }
      } catch (e) {
        // Chủ phòng đã xóa phòng trước (khách không còn gì để xóa), hoặc mất mạng: phòng sẽ tự xóa khi ngắt kết nối
        console.warn('Rời phòng đấu online lỗi:', e);
      }
      // Ngắt kết nối tới Realtime Database khi không đấu nữa (gói miễn phí giới hạn số kết nối cùng lúc)
      fdb.goOffline(db);
    },
  };
}
