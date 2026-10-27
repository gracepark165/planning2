import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, formatMonthDay, toDateKey } from './date';

describe('날짜 계산', () => {
  it('Date를 현지 날짜 글자로 바꾼다', () => {
    expect(toDateKey(new Date(2026, 9, 27, 23, 59))).toBe('2026-10-27');
    expect(toDateKey(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05');
  });

  it('달·해가 바뀌어도 날짜를 더하고 뺀다', () => {
    expect(addDays('2026-10-27', 5)).toBe('2026-11-01');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29'); // 윤년
    expect(addDays('2026-10-27', 0)).toBe('2026-10-27');
  });

  it('두 날짜의 차이를 일 단위로 센다', () => {
    expect(daysBetween('2026-10-27', '2026-10-28')).toBe(1);
    expect(daysBetween('2026-10-27', '2026-10-27')).toBe(0);
    expect(daysBetween('2026-10-27', '2026-10-24')).toBe(-3);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('잘못된 날짜 글자는 오류를 낸다', () => {
    expect(() => addDays('2026/10/27', 1)).toThrow();
  });

  it('월·일로 표시한다', () => {
    expect(formatMonthDay('2026-10-07')).toBe('10월 7일');
  });
});
