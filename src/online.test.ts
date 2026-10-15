import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addToLeaderboard, loadSyncedBest, savePlayerName } from './game/storage';
import { syncBest } from './online';
import { fakeStorage } from './test/fakeStorage';

// Thay Firebase bằng bản giả: setDoc ghi lại các lần gửi, signInAnonymously tạo người chơi 'u1'
const { auth, setDoc, signInAnonymously } = vi.hoisted(() => ({
  auth: { currentUser: null as { uid: string } | null, authStateReady: () => Promise.resolve() },
  setDoc: vi.fn(),
  signInAnonymously: vi.fn(),
}));
vi.mock('firebase/app', () => ({ initializeApp: (config: unknown) => ({ config }) }));
vi.mock('firebase/auth', () => ({
  initializeAuth: () => auth,
  indexedDBLocalPersistence: {},
  browserLocalPersistence: {},
  signInAnonymously,
}));
vi.mock('firebase/firestore/lite', () => ({
  getFirestore: () => ({}),
  doc: (_db: unknown, collection: string, id: string) => `${collection}/${id}`,
  setDoc,
  serverTimestamp: () => 'SERVER_TIME',
}));

/** Các lần gửi: [đường dẫn document, dữ liệu]. */
const uploads = () => setDoc.mock.calls.map(([path, data]) => [path, data]);

describe('đồng bộ kỷ lục lên Firebase', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'key');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'pairfect-test');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    auth.currentUser = null;
    setDoc.mockReset().mockResolvedValue(undefined);
    signInAnonymously.mockReset().mockImplementation(async () => {
      auth.currentUser = { uid: 'u1' };
      return { user: auth.currentUser };
    });
    savePlayerName('An');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('đăng nhập ẩn danh rồi ghi tên, kỷ lục và màn vào document của người chơi', async () => {
    addToLeaderboard(420, 5);
    await syncBest();
    expect(signInAnonymously).toHaveBeenCalledOnce();
    expect(uploads()).toEqual([
      ['highscores/u1', { name: 'An', score: 420, stage: 5, updatedAt: 'SERVER_TIME' }],
    ]);
    expect(loadSyncedBest()).toEqual({ name: 'An', score: 420, stage: 5 });
  });

  it('đã đăng nhập từ lần mở app trước thì dùng lại người chơi đó', async () => {
    auth.currentUser = { uid: 'old' };
    addToLeaderboard(420, 5);
    await syncBest();
    expect(signInAnonymously).not.toHaveBeenCalled();
    expect(setDoc.mock.calls[0][0]).toBe('highscores/old');
  });

  it('đã gửi rồi thì thôi; có kỷ lục mới hoặc đổi tên thì gửi lại', async () => {
    addToLeaderboard(420, 5);
    await syncBest();
    await syncBest();
    addToLeaderboard(300, 4); // không phải kỷ lục
    await syncBest();
    expect(setDoc).toHaveBeenCalledOnce();

    addToLeaderboard(800, 7);
    await syncBest();
    savePlayerName('Bình');
    await syncBest();
    expect(uploads().map(([, data]) => data)).toEqual([
      { name: 'An', score: 420, stage: 5, updatedAt: 'SERVER_TIME' },
      { name: 'An', score: 800, stage: 7, updatedAt: 'SERVER_TIME' },
      { name: 'Bình', score: 800, stage: 7, updatedAt: 'SERVER_TIME' },
    ]);
  });

  it('chưa có tên hoặc chưa có điểm thì chưa gửi', async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    addToLeaderboard(420, 5);
    await syncBest();

    vi.stubGlobal('localStorage', fakeStorage());
    savePlayerName('An');
    addToLeaderboard(0, 1);
    await syncBest();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('gửi lỗi (mất mạng) thì lần đồng bộ sau gửi lại', async () => {
    setDoc.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }));
    addToLeaderboard(420, 5);
    await syncBest();
    expect(loadSyncedBest()).toBeNull();

    await syncBest();
    expect(setDoc).toHaveBeenCalledTimes(2);
    expect(loadSyncedBest()).toEqual({ name: 'An', score: 420, stage: 5 });
  });

  it('đăng nhập lỗi thì chưa gửi, lần sau thử lại', async () => {
    signInAnonymously.mockRejectedValueOnce(Object.assign(new Error('network'), { code: 'auth/network-request-failed' }));
    addToLeaderboard(420, 5);
    await syncBest();
    expect(setDoc).not.toHaveBeenCalled();

    await syncBest();
    expect(setDoc).toHaveBeenCalledOnce();
  });

  it('có kỷ lục mới trong lúc đang gửi thì gửi tiếp bản mới', async () => {
    let finishFirst!: () => void;
    setDoc.mockReturnValueOnce(new Promise<void>((r) => (finishFirst = r)));
    addToLeaderboard(420, 5);
    const first = syncBest();
    await vi.waitFor(() => expect(setDoc).toHaveBeenCalledOnce());

    addToLeaderboard(800, 7);
    await syncBest(); // đang gửi dở nên trả về ngay
    expect(setDoc).toHaveBeenCalledOnce();

    finishFirst();
    await first;
    expect(uploads().map(([, data]) => (data as { score: number }).score)).toEqual([420, 800]);
    expect(loadSyncedBest()).toEqual({ name: 'An', score: 800, stage: 7 });
  });

  it('chưa cấu hình Firebase thì không gửi', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', '');
    addToLeaderboard(420, 5);
    await syncBest();
    expect(setDoc).not.toHaveBeenCalled();
    expect(loadSyncedBest()).toBeNull();
  });
});
