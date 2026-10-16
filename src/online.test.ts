import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addToLeaderboard, loadSyncedBest, savePlayerName } from './game/storage';
import { fetchOnlineBoard, onlineEnabled, onSyncResult, syncBest, type SyncResult } from './online';
import { fakeStorage } from './test/fakeStorage';

type Doc = Record<string, unknown>;
type Constraint = { orderBy?: string; limit?: number; where?: string; value?: number };

// Thay Firebase bằng bản giả: setDoc ghi lại các lần gửi vào `store`, signInAnonymously tạo người chơi 'u1'.
// Truy vấn chỉ hiểu đúng những gì online.ts dùng: sắp theo điểm giảm dần, giới hạn số dòng, đếm người điểm cao hơn.
const { auth, store, setDoc, signInAnonymously, getDocs, getCount } = vi.hoisted(() => {
  const store = new Map<string, Doc>();
  const run = (constraints: Constraint[]) => {
    const above = constraints.find((c) => c.where)?.value ?? -Infinity;
    const n = constraints.find((c) => c.limit)?.limit ?? Infinity;
    return [...store]
      .filter(([, d]) => Number(d.score) > above)
      .sort(([, a], [, b]) => Number(b.score) - Number(a.score))
      .slice(0, n);
  };
  return {
    auth: { currentUser: null as { uid: string } | null, authStateReady: () => Promise.resolve() },
    store,
    setDoc: vi.fn(),
    signInAnonymously: vi.fn(),
    getDocs: vi.fn(async (constraints: Constraint[]) => ({
      docs: run(constraints).map(([id, d]) => ({ id, data: () => d })),
    })),
    getCount: vi.fn(async (constraints: Constraint[]) => ({ data: () => ({ count: run(constraints).length }) })),
  };
});
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
  collection: (_db: unknown, name: string) => name,
  query: (_collection: string, ...constraints: Constraint[]) => constraints,
  orderBy: (field: string) => ({ orderBy: field }),
  limit: (n: number) => ({ limit: n }),
  where: (field: string, _op: string, value: number) => ({ where: field, value }),
  getDocs,
  getDoc: async (path: string) => {
    const d = store.get(path.split('/')[1]);
    return { exists: () => d !== undefined, data: () => d };
  },
  getCount,
}));

/** Thời điểm gửi như Firestore trả về (Timestamp). */
const at = (ms: number) => ({ toMillis: () => ms });

/** Các lần gửi: [đường dẫn document, dữ liệu]. */
const uploads = () => setDoc.mock.calls.map(([path, data]) => [path, data]);

describe('đồng bộ kỷ lục lên Firebase', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'key');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'pairfect-test');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    auth.currentUser = null;
    store.clear();
    setDoc.mockReset().mockImplementation(async (path: string, data: Doc) => {
      store.set(path.split('/')[1], data);
    });
    getDocs.mockClear();
    getCount.mockClear();
    signInAnonymously.mockReset().mockImplementation(async () => {
      auth.currentUser = { uid: 'u1' };
      return { user: auth.currentUser };
    });
    savePlayerName('An');
  });
  afterEach(() => {
    vi.useRealTimers();
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

  it('báo kết quả mỗi lần gửi: lỗi kèm bản chưa gửi được, thành công kèm bản đã gửi trước đó', async () => {
    const results: SyncResult[] = [];
    const off = onSyncResult((r) => results.push(r));
    try {
      setDoc.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }));
      addToLeaderboard(420, 5);
      await syncBest();
      await syncBest();
      savePlayerName('Bình');
      await syncBest();
      await syncBest(); // không có gì mới: không gửi, không báo
    } finally {
      off();
    }
    addToLeaderboard(800, 7);
    await syncBest(); // đã gỡ thì không nghe nữa
    const an = { name: 'An', score: 420, stage: 5 };
    expect(results).toEqual([
      { ok: false, best: an },
      { ok: true, best: an, previous: null },
      { ok: true, best: { ...an, name: 'Bình' }, previous: an },
    ]);
  });

  it('chưa cấu hình Firebase thì không gửi', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', '');
    addToLeaderboard(420, 5);
    await syncBest();
    expect(setDoc).not.toHaveBeenCalled();
    expect(loadSyncedBest()).toBeNull();
  });

  describe('bảng xếp hạng online', () => {
    /** `n` người chơi p1..pn, điểm 1000, 990, 980... */
    const players = (n: number) => {
      for (let i = 1; i <= n; i++)
        store.set(`p${i}`, { name: `Người ${i}`, score: 1010 - i * 10, stage: 5, updatedAt: at(i) });
    };

    it('sắp theo điểm, bằng điểm thì màn xa hơn rồi người gửi trước; làm sạch tên, bỏ dòng hỏng', async () => {
      store.set('an', { name: 'An', score: 500, stage: 4, updatedAt: at(1) });
      store.set('binh', { name: 'Bình', score: 500, stage: 5, updatedAt: at(3) });
      store.set('chi', { name: 'Chi', score: 500, stage: 5, updatedAt: at(2) });
      store.set('dung', { name: '‮Dũng\n  Lê', score: 300, stage: 3, updatedAt: at(4) });
      store.set('hong', { score: 900, stage: 9, updatedAt: at(5) });
      const { top, me } = await fetchOnlineBoard(10);
      expect(top.map((e) => [e.uid, e.name, e.score, e.stage])).toEqual([
        ['chi', 'Chi', 500, 5],
        ['binh', 'Bình', 500, 5],
        ['an', 'An', 500, 4],
        ['dung', 'Dũng Lê', 300, 3],
      ]);
      // Chưa đăng nhập (chưa gửi kỷ lục nào) thì không có dòng của người chơi, và không tự đăng nhập chỉ để đọc
      expect(me).toBeNull();
      expect(signInAnonymously).not.toHaveBeenCalled();
    });

    it('chỉ đọc nhóm đầu bảng', async () => {
      players(15);
      const { top } = await fetchOnlineBoard(10);
      expect(top.map((e) => e.uid)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10']);
    });

    it('người chơi trong nhóm đầu: hạng theo vị trí trên bảng', async () => {
      players(15);
      auth.currentUser = { uid: 'p4' };
      const { me } = await fetchOnlineBoard(10);
      expect(me).toMatchObject({ rank: 4, entry: { uid: 'p4', score: 970 } });
      expect(getCount).not.toHaveBeenCalled();
    });

    it('người chơi ngoài nhóm đầu: hạng là số người điểm cao hơn cộng 1', async () => {
      players(15);
      auth.currentUser = { uid: 'p13' };
      const { top, me } = await fetchOnlineBoard(10);
      expect(top).toHaveLength(10);
      expect(me).toMatchObject({ rank: 13, entry: { uid: 'p13', name: 'Người 13', score: 880 } });
    });

    it('bằng điểm người cuối nhóm đầu nhưng xếp sau thì đứng ngay sau nhóm đó', async () => {
      players(10);
      store.set('me', { name: 'Tôi', score: 910, stage: 5, updatedAt: at(99) });
      auth.currentUser = { uid: 'me' };
      const { top, me } = await fetchOnlineBoard(10);
      expect(top.map((e) => e.uid)).not.toContain('me');
      expect(me?.rank).toBe(11);
    });

    it('gửi kỷ lục còn chờ trước khi đọc, để bảng có luôn điểm mới nhất', async () => {
      players(3);
      addToLeaderboard(995, 8);
      const { me } = await fetchOnlineBoard(10);
      expect(setDoc).toHaveBeenCalledOnce();
      expect(me).toMatchObject({ rank: 2, entry: { uid: 'u1', name: 'An', score: 995, stage: 8 } });
    });

    it('đọc lỗi thì báo lỗi', async () => {
      getDocs.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }));
      await expect(fetchOnlineBoard(10)).rejects.toThrow('offline');
    });

    it('mạng treo thì báo lỗi sau một lúc, không đợi mãi', async () => {
      vi.useFakeTimers();
      getDocs.mockReturnValueOnce(new Promise(() => {}));
      const result = expect(fetchOnlineBoard(10)).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(15000);
      await result;
    });

    it('chưa cấu hình Firebase thì không có bảng online', async () => {
      expect(onlineEnabled()).toBe(true);
      vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '');
      expect(onlineEnabled()).toBe(false);
      await expect(fetchOnlineBoard(10)).rejects.toThrow();
      expect(getDocs).not.toHaveBeenCalled();
    });
  });
});
