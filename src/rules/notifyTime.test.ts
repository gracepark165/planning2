import { describe, expect, it } from 'vitest';
import { notifyTimeChoices } from './notifyTime';

describe('알림 시간 고르기 (V3-6-2)', () => {
  it('기본은 오후 5시 ~ 오후 9시 5개, 다른 시간은 접혀 있다', () => {
    const c = notifyTimeChoices('18:00');
    expect(c.main.map((t) => t.label)).toEqual(['오후 5시', '오후 6시', '오후 7시', '오후 8시', '오후 9시']);
    expect(c.startOpen).toBe(false);
    expect(c.more.map((t) => t.label)).toEqual([
      '오전 7시', '오전 8시', '오전 9시', '오전 10시', '오전 11시', '낮 12시', '오후 1시', '오후 2시', '오후 3시', '오후 4시', '오후 10시',
    ]);
  });

  it('저장된 시간이 5개 밖이면 처음부터 펼친다', () => {
    expect(notifyTimeChoices('08:00').startOpen).toBe(true);
    expect(notifyTimeChoices('22:00').startOpen).toBe(true);
    expect(notifyTimeChoices('21:00').startOpen).toBe(false);
  });
});
