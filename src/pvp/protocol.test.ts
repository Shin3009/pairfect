import { describe, expect, it } from 'vitest';
import { CODE_LENGTH, cleanCode, decode, errorText, PvpError, randomCode, type Msg } from './protocol';

const roundTrip = (m: Msg) => decode(JSON.stringify(m));

describe('decode', () => {
  it('đọc lại đúng mọi loại tin', () => {
    const msgs: Msg[] = [
      { k: 'hello', name: 'Tuấn', protocol: 1 },
      { k: 'ping', t: 123.5 },
      { k: 'pong', t: 123.5, at: 99999 },
      { k: 'start', seed: 4294967295, at: 1700000000000 },
      { k: 'ev', n: 1, t: 500, ev: { type: 'match', a: { r: 1, c: 2 }, b: { r: 6, c: 14 } } },
      { k: 'ev', n: 2, t: 900, ev: { type: 'shuffle', auto: true } },
      { k: 'ev', n: 3, t: 950, ev: { type: 'hit', kind: 'tilt' } },
      { k: 'result', winner: 'guest', why: 'clear' },
      { k: 'result', winner: 'draw', why: 'time' },
      { k: 'rematch' },
      { k: 'bye', why: 'surrender' },
    ];
    for (const m of msgs) expect(roundTrip(m)).toEqual(m);
  });

  it('làm sạch tên đối thủ như tên nhập trên máy', () => {
    expect(decode(JSON.stringify({ k: 'hello', name: ' An\u0000‮ ', protocol: 1 }))).toEqual({
      k: 'hello',
      name: 'An',
      protocol: 1,
    });
    expect(decode(JSON.stringify({ k: 'hello', name: '\u0000', protocol: 1 }))).toMatchObject({ name: '?' });
  });

  it('bỏ qua tin sai dạng', () => {
    const bad: unknown[] = [
      'không phải JSON',
      'null',
      '42',
      JSON.stringify({ k: 'unknown' }),
      JSON.stringify({ k: 'ping' }),
      JSON.stringify({ k: 'ping', t: 'now' }),
      JSON.stringify({ k: 'hello', name: 5, protocol: 1 }),
      JSON.stringify({ k: 'start', seed: -1, at: 0 }),
      JSON.stringify({ k: 'start', seed: 1.5, at: 0 }),
      JSON.stringify({ k: 'ev', n: 1.5, t: 0, ev: { type: 'shuffle', auto: true } }),
      JSON.stringify({ k: 'ev', n: 1, t: 0, ev: { type: 'shuffle' } }),
      JSON.stringify({ k: 'ev', n: 1, t: 0, ev: { type: 'match', a: { r: 1, c: 1 } } }),
      JSON.stringify({ k: 'ev', n: 1, t: 0, ev: { type: 'match', a: { r: 1, c: 1 }, b: { r: -1, c: 1 } } }),
      JSON.stringify({ k: 'ev', n: 1, t: 0, ev: { type: 'match', a: { r: 1, c: 1 }, b: { r: 1, c: 1000 } } }),
      JSON.stringify({ k: 'ev', n: 1, t: 0, ev: { type: 'teleport' } }),
      JSON.stringify({ k: 'ev', n: 1, t: 0, ev: { type: 'hit', kind: 'meteor' } }),
      JSON.stringify({ k: 'result', winner: 'me', why: 'clear' }),
      JSON.stringify({ k: 'result', winner: 'host', why: 'magic' }),
      JSON.stringify({ k: 'bye', why: 'bored' }),
      JSON.stringify({ k: 'hello', name: 'x'.repeat(5000), protocol: 1 }),
      { k: 'ping', t: 1 },
    ];
    for (const raw of bad) expect(decode(raw)).toBeNull();
  });
});

describe('mã phòng', () => {
  it('mã ngẫu nhiên luôn hợp lệ', () => {
    for (let i = 0; i < 200; i++) {
      const code = randomCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect(cleanCode(code)).toBe(code);
    }
  });

  it('chấp nhận chữ thường, khoảng trắng và dấu gạch', () => {
    expect(cleanCode('k7q2xm')).toBe('K7Q2XM');
    expect(cleanCode(' K7Q-2XM ')).toBe('K7Q2XM');
    expect(cleanCode('k7q 2xm')).toBe('K7Q2XM');
  });

  it('từ chối mã sai độ dài hoặc có ký tự dễ nhầm (I, O, 0, 1)', () => {
    expect(cleanCode('K7Q2X')).toBe('');
    expect(cleanCode('K7Q2XMM')).toBe('');
    expect(cleanCode('K7Q2X0')).toBe('');
    expect(cleanCode('K7Q2XO')).toBe('');
    expect(cleanCode('K7Q2X1')).toBe('');
    expect(cleanCode('K7Q2XI')).toBe('');
    expect(cleanCode('K7Q2X!')).toBe('');
  });
});

describe('errorText', () => {
  it('mỗi lỗi một thông báo, lỗi khác dùng câu chung', () => {
    expect(errorText(new PvpError('full'))).toContain('đã có người');
    expect(errorText(new Error('network'))).toContain('máy chủ');
  });
});
