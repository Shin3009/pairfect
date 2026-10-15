import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage } from '../test/fakeStorage';
import {
  addToLeaderboard,
  cleanName,
  insertEntry,
  LEADERBOARD_SIZE,
  loadBest,
  loadLeaderboard,
  loadPlayerName,
  loadSyncedBest,
  NAME_MAX,
  savePlayerName,
  saveSyncedBest,
  type LeaderboardEntry,
  type OnlineBest,
} from './storage';

const KEY = 'pairfect-leaderboard';

const E = (score: number, stage: number, date = 0): LeaderboardEntry => ({ score, stage, date });

describe('insertEntry', () => {
  it('xếp theo điểm giảm dần và trả về thứ hạng của lượt mới', () => {
    const { list, rank } = insertEntry([E(300, 3), E(100, 1)], E(200, 2));
    expect(list.map((e) => e.score)).toEqual([300, 200, 100]);
    expect(rank).toBe(2);
  });

  it('bằng điểm thì màn xa hơn đứng trên, vẫn bằng thì lượt cũ đứng trên', () => {
    expect(insertEntry([E(100, 2, 1)], E(100, 5, 2)).rank).toBe(1);
    expect(insertEntry([E(100, 5, 1)], E(100, 2, 2)).rank).toBe(2);
    expect(insertEntry([E(100, 3, 1)], E(100, 3, 2)).rank).toBe(2);
  });

  it(`chỉ giữ ${LEADERBOARD_SIZE} dòng; lượt không lọt vào bảng có rank null`, () => {
    const full = Array.from({ length: LEADERBOARD_SIZE }, (_, i) => E(1000 - i * 10, 1));
    const low = insertEntry(full, E(1, 1));
    expect(low.rank).toBeNull();
    expect(low.list).toEqual(full);

    const high = insertEntry(full, E(5000, 9));
    expect(high.rank).toBe(1);
    expect(high.list).toHaveLength(LEADERBOARD_SIZE);
    expect(high.list.at(-1)).toEqual(full[LEADERBOARD_SIZE - 2]);
  });

  it('không sửa mảng đầu vào', () => {
    const list = [E(100, 1)];
    insertEntry(list, E(200, 2));
    expect(list).toEqual([E(100, 1)]);
  });
});

describe('bảng xếp hạng trong localStorage', () => {
  beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('bảng trống lúc đầu, ghi rồi đọc lại đúng thứ tự', () => {
    expect(loadLeaderboard()).toEqual([]);
    expect(addToLeaderboard(120, 2)).toBe(1);
    expect(addToLeaderboard(450, 6)).toBe(1);
    expect(addToLeaderboard(80, 1)).toBe(3);
    expect(loadLeaderboard().map((e) => [e.score, e.stage])).toEqual([
      [450, 6],
      [120, 2],
      [80, 1],
    ]);
  });

  it('kỷ lục là điểm cao nhất trên bảng, bảng trống thì là 0', () => {
    expect(loadBest()).toBe(0);
    addToLeaderboard(300, 4);
    addToLeaderboard(900, 7);
    addToLeaderboard(500, 5);
    expect(loadBest()).toBe(900);
  });

  it('dữ liệu hỏng thì coi như bảng trống, dòng sai kiểu bị bỏ', () => {
    localStorage.setItem(KEY, '{không phải json');
    expect(loadLeaderboard()).toEqual([]);
    localStorage.setItem(KEY, '{"score":1}');
    expect(loadLeaderboard()).toEqual([]);
    localStorage.setItem(KEY, JSON.stringify([E(50, 1), null, { score: '9', stage: 1, date: 0 }, E(70, 2)]));
    expect(loadLeaderboard()).toEqual([E(70, 2), E(50, 1)]);
  });

  it('trình duyệt chặn lưu trữ: không lỗi, bảng trống', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadLeaderboard()).toEqual([]);
    expect(loadBest()).toBe(0);
    expect(addToLeaderboard(100, 1)).toBe(1);
  });
});

describe('cleanName', () => {
  it('gộp khoảng trắng và bỏ khoảng trắng hai đầu', () => {
    expect(cleanName('  Nguyễn   Văn\tAn  ')).toBe('Nguyễn Văn An');
  });

  it('chỉ có khoảng trắng hay ký tự điều khiển thì rỗng', () => {
    expect(cleanName('')).toBe('');
    expect(cleanName(' \n\t ')).toBe('');
    expect(cleanName('\u0000\u202E')).toBe('');
  });

  it('bỏ ký tự điều khiển và ký tự đảo chiều chữ', () => {
    expect(cleanName('An\u0007h\u202Eoà')).toBe('An h oà');
  });

  it('đưa chữ có dấu về dạng dựng sẵn (NFC)', () => {
    expect(cleanName('Hoa\u0300')).toBe('Hoà');
  });

  it(`cắt còn ${NAME_MAX} ký tự, emoji tính là một ký tự`, () => {
    expect(cleanName('a'.repeat(NAME_MAX + 5))).toBe('a'.repeat(NAME_MAX));
    expect(Array.from(cleanName('😀'.repeat(NAME_MAX + 1)))).toHaveLength(NAME_MAX);
    // Cắt ngay sau một khoảng trắng thì bỏ luôn khoảng trắng đó
    expect(cleanName('a'.repeat(NAME_MAX - 1) + ' bcd')).toBe('a'.repeat(NAME_MAX - 1));
  });
});

describe('tên người chơi trong localStorage', () => {
  beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('chưa nhập tên thì null', () => {
    expect(loadPlayerName()).toBeNull();
  });

  it('lưu tên đã chuẩn hóa, đổi tên thì ghi đè', () => {
    expect(savePlayerName('  An  ')).toBe('An');
    expect(loadPlayerName()).toBe('An');
    savePlayerName('Bình');
    expect(loadPlayerName()).toBe('Bình');
  });

  it('tên lưu trong máy bị sửa thành rỗng thì coi như chưa nhập', () => {
    localStorage.setItem('pairfect-player-name', '  \u202E ');
    expect(loadPlayerName()).toBeNull();
  });
});

describe('kỷ lục đã gửi lên mạng trong localStorage', () => {
  beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());

  const B: OnlineBest = { name: 'An', score: 420, stage: 5 };

  it('chưa gửi lần nào thì null; lưu rồi đọc lại', () => {
    expect(loadSyncedBest()).toBeNull();
    saveSyncedBest(B);
    expect(loadSyncedBest()).toEqual(B);
  });

  it('dữ liệu hỏng thì coi như chưa gửi', () => {
    localStorage.setItem('pairfect-synced-best', JSON.stringify({ ...B, score: '420' }));
    expect(loadSyncedBest()).toBeNull();
    localStorage.setItem('pairfect-synced-best', '{hỏng');
    expect(loadSyncedBest()).toBeNull();
  });
});
