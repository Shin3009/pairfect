import { describe, expect, it } from 'vitest';
import { ClockSync } from './clock';

describe('ClockSync', () => {
  it('chưa đo lần nào thì coi như hai đồng hồ khớp nhau', () => {
    const c = new ClockSync();
    expect(c.count).toBe(0);
    expect(c.offset()).toBe(0);
    expect(c.toLocal(1234)).toBe(1234);
  });

  it('đường đi và về mất thời gian như nhau thì đo đúng độ lệch', () => {
    const c = new ClockSync();
    // Đồng hồ máy kia nhanh hơn 5000 ms, mỗi chiều mất 40 ms
    c.sample(0, 0 + 40 + 5000, 80);
    expect(c.offset()).toBe(5000);
    expect(c.rtt()).toBe(80);
    expect(c.toLocal(15000)).toBe(10000);
  });

  it('dùng lần đo có thời gian khứ hồi ngắn nhất', () => {
    const c = new ClockSync();
    // Lần đầu bị nghẽn một chiều (đi 400 ms, về 20 ms): độ lệch đo được sai 190 ms
    c.sample(0, 400 + 5000, 420);
    c.sample(1000, 1000 + 30 + 5000, 1060);
    c.sample(2000, 2000 + 200 + 5000, 2250);
    expect(c.offset()).toBe(5000);
    expect(c.rtt()).toBe(60);
  });

  it('bỏ lần đo có thời gian âm và chỉ giữ 10 lần gần nhất', () => {
    const c = new ClockSync();
    c.sample(100, 0, 50);
    expect(c.count).toBe(0);
    c.sample(0, 10, 2); // lần đo rất tốt nhưng cũ, sẽ bị đẩy ra
    for (let i = 1; i <= 10; i++) c.sample(i * 1000, i * 1000 + 50 + 7000, i * 1000 + 100);
    expect(c.count).toBe(10);
    expect(c.offset()).toBe(7000);
  });
});
