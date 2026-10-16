import { describe, expect, it } from 'vitest';
import { groupPacks } from './imagePacks';

describe('groupPacks', () => {
  it('gom ảnh theo thư mục, tên thư mục là tên bộ', () => {
    const packs = groupPacks({
      '../assets/tiles/Thú/1.png': 'a1',
      '../assets/tiles/Hoa/1.png': 'b1',
      '../assets/tiles/Thú/2.png': 'a2',
    });
    expect(packs).toEqual([
      { folder: 'Hoa', urls: ['b1'] },
      { folder: 'Thú', urls: ['a1', 'a2'] },
    ]);
  });

  it('xếp ảnh theo tên file, phần số so theo giá trị', () => {
    const packs = groupPacks({
      '../assets/tiles/P/10.png': 'ten',
      '../assets/tiles/P/2.png': 'two',
      '../assets/tiles/P/001-a.png': 'one',
      '../assets/tiles/P/25-meo.webp': 'twenty-five',
    });
    expect(packs[0].urls).toEqual(['one', 'two', 'ten', 'twenty-five']);
  });

  it('không có file nào thì không có bộ nào', () => {
    expect(groupPacks({})).toEqual([]);
  });
});
