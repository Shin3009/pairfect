import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage } from '../test/fakeStorage';
import {
  addToLeaderboard,
  clearSavedGame,
  cleanName,
  insertEntry,
  LEADERBOARD_SIZE,
  loadBest,
  loadLeaderboard,
  loadPlayerName,
  loadSavedGame,
  loadSyncedBest,
  loadTileArt,
  NAME_MAX,
  rankFor,
  restoreSavedGame,
  saveGame,
  savePlayerName,
  setSavedGameMirror,
  saveSyncedBest,
  saveTileArt,
  type LeaderboardEntry,
  type OnlineBest,
  type SavedGame,
  type SavedPlay,
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

  it('rankFor báo đúng hạng sẽ được ghi mà không ghi gì', () => {
    addToLeaderboard(300, 4);
    addToLeaderboard(100, 2);
    expect(rankFor(200, 3)).toBe(2);
    expect(rankFor(100, 2)).toBe(3); // bằng điểm bằng màn thì lượt mới đứng dưới
    expect(loadLeaderboard()).toHaveLength(2);
    expect(addToLeaderboard(200, 3)).toBe(2);
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

describe('lượt chơi đang lưu trong localStorage', () => {
  beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());

  const SAVE_KEY = 'pairfect-saved-game';
  const play: SavedPlay = {
    score: 1230,
    hints: 4,
    shuffles: 2,
    timeLeft: 87.5,
    matches: 9,
    grid: [[0, 0, 0, 0], [0, 1, 1, 0], [0, 0, 0, 0]],
    lost: 'moves',
  };
  const game: SavedGame = { level: 6, score: 1100, hints: 1, shuffles: 0, retries: 2, play };

  it('chưa lưu thì null; lưu rồi đọc lại, xóa thì về null', () => {
    expect(loadSavedGame()).toBeNull();
    saveGame(game);
    expect(loadSavedGame()).toEqual(game);
    const atStageStart = { level: 7, score: 1500, hints: 3, shuffles: 1, retries: 2 };
    saveGame(atStageStart);
    expect(loadSavedGame()).toEqual(atStageStart);
    clearSavedGame();
    expect(loadSavedGame()).toBeNull();
  });

  it('dữ liệu hỏng thì null; chỉ phần màn chơi dở hỏng thì bỏ phần đó, vẫn chơi tiếp từ đầu màn', () => {
    const stored = (g: unknown) => JSON.stringify({ savedAt: 1, game: g });
    for (const raw of ['{không phải json', '[]', JSON.stringify(game), stored({ level: 1 }), stored({ ...game, retries: -1 }), stored({ ...game, level: 1.5 })]) {
      localStorage.setItem(SAVE_KEY, raw);
      expect(loadSavedGame()).toBeNull();
    }
    const { play: _, ...entry } = game;
    for (const badPlay of [{ ...play, timeLeft: 'x' }, { ...play, grid: [[0, 'a']] }, { ...play, lost: 'boom' }, { ...play, matches: -1 }]) {
      localStorage.setItem(SAVE_KEY, stored({ ...game, play: badPlay }));
      expect(loadSavedGame()).toEqual(entry);
    }
  });

  describe('bản sao (Android)', () => {
    afterEach(() => {
      setSavedGameMirror(null);
      vi.useRealTimers();
    });

    /** Bản lưu dạng chuỗi như lúc ghi vào lúc `t`. */
    const at = (t: number, g: SavedGame | null) => {
      vi.useFakeTimers({ now: t });
      if (g) saveGame(g);
      else clearSavedGame();
      return localStorage.getItem(SAVE_KEY)!;
    };

    it('mỗi lần lưu hay xóa đều ghi cùng một chuỗi vào bản sao', () => {
      const copies: string[] = [];
      setSavedGameMirror((raw) => copies.push(raw));
      saveGame(game);
      expect(copies.at(-1)).toBe(localStorage.getItem(SAVE_KEY));
      clearSavedGame();
      expect(copies).toHaveLength(2);
      expect(copies.at(-1)).toBe(localStorage.getItem(SAVE_KEY));
    });

    it('bản sao mới hơn (localStorage chưa kịp ghi xuống đĩa) thay cho bản trong localStorage', () => {
      at(100, { ...game, level: 2 });
      const copy = at(200, game);
      at(100, { ...game, level: 2 }); // localStorage mất lần lưu cuối
      expect(restoreSavedGame(copy)).toBeNull();
      expect(loadSavedGame()).toEqual(game);
    });

    it('bản trong localStorage mới hơn thì giữ nguyên và trả về để ghi lại vào bản sao', () => {
      const copy = at(100, { ...game, level: 2 });
      const local = at(200, game);
      expect(restoreSavedGame(copy)).toBe(local);
      expect(restoreSavedGame(null)).toBe(local);
      expect(restoreSavedGame(local)).toBeNull();
      expect(loadSavedGame()).toEqual(game);
    });

    it('lượt chơi đã kết thúc (dấu đã xóa mới hơn) không sống lại từ bản sao cũ', () => {
      const oldCopy = at(100, game);
      at(200, null);
      expect(restoreSavedGame(oldCopy)).not.toBeNull();
      expect(loadSavedGame()).toBeNull();
    });

    it('bản sao hỏng hoặc không có thì coi như cũ nhất', () => {
      expect(restoreSavedGame('{hỏng')).toBeNull(); // cả hai đều không có gì
      at(100, game);
      expect(restoreSavedGame('{hỏng')).not.toBeNull();
      expect(loadSavedGame()).toEqual(game);
    });
  });

  it('trình duyệt chặn lưu trữ: không lỗi, không có lượt chơi đang lưu', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    saveGame(game);
    clearSavedGame();
    expect(loadSavedGame()).toBeNull();
  });
});

describe('bộ hình ô trong localStorage', () => {
  beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('chưa chọn thì null; chọn rồi đọc lại, chọn bộ khác thì ghi đè', () => {
    expect(loadTileArt()).toBeNull();
    saveTileArt('shapes');
    expect(loadTileArt()).toBe('shapes');
    saveTileArt('pack-Thú cưng');
    expect(loadTileArt()).toBe('pack-Thú cưng');
  });
});
