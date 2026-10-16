/** Số lần đo gần nhất được giữ lại. */
const KEEP = 10;

/**
 * Ước lượng độ lệch đồng hồ giữa máy này và máy kia qua các lần ping.
 * Máy này ghi giờ lúc gửi ping (t0) và lúc nhận trả lời (t1); máy kia ghi giờ của nó lúc trả lời (at).
 * Coi đường đi và đường về mất thời gian như nhau thì độ lệch = at - (t0 + t1) / 2.
 * Dùng lần đo có thời gian khứ hồi ngắn nhất trong vài lần gần đây: lần đó ít bị mạng nghẽn làm sai nhất.
 */
export class ClockSync {
  private samples: { rtt: number; offset: number }[] = [];

  sample(t0: number, at: number, t1: number): void {
    const rtt = t1 - t0;
    if (rtt < 0) return;
    this.samples.push({ rtt, offset: at - (t0 + t1) / 2 });
    if (this.samples.length > KEEP) this.samples.shift();
  }

  /** Số lần đo đang giữ. */
  get count(): number {
    return this.samples.length;
  }

  private best(): { rtt: number; offset: number } | null {
    return this.samples.reduce<{ rtt: number; offset: number } | null>((b, s) => (!b || s.rtt < b.rtt ? s : b), null);
  }

  /** Giờ máy kia trừ giờ máy này (ms); chưa đo lần nào thì coi như 0. */
  offset(): number {
    return this.best()?.offset ?? 0;
  }

  /** Thời gian khứ hồi ngắn nhất đã đo (ms). */
  rtt(): number {
    return this.best()?.rtt ?? 0;
  }

  /** Đổi một thời điểm theo đồng hồ máy kia sang đồng hồ máy này. */
  toLocal(remote: number): number {
    return remote - this.offset();
  }
}
