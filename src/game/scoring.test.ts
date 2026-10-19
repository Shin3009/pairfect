import { describe, expect, it } from 'vitest';
import rules from '../../firestore.rules?raw';
import { getLevel, HARD_START } from './levels';
import { MAX_ONLINE_STAGE, MAX_SCORE_PER_STAGE, maxStageScore } from './scoring';

describe('giới hạn điểm mỗi màn (firestore.rules dùng để chặn điểm giả)', () => {
  it(`không màn nào đạt được quá ${MAX_SCORE_PER_STAGE} điểm, kể cả vòng lặp và giai đoạn khó`, () => {
    for (let i = 0; i < HARD_START + 100; i++) {
      expect(maxStageScore(getLevel(i)), `màn ${i + 1}`).toBeLessThanOrEqual(MAX_SCORE_PER_STAGE);
    }
  });

  it('firestore.rules dùng đúng giới hạn này', () => {
    expect(rules).toContain(`d.score <= d.stage * ${MAX_SCORE_PER_STAGE}`);
  });

  it('firestore.rules giới hạn màn đúng bằng MAX_ONLINE_STAGE', () => {
    expect(rules).toContain(`d.stage <= ${MAX_ONLINE_STAGE}`);
  });
});
