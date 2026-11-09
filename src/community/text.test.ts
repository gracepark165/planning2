import { describe, expect, it } from 'vitest';
import { timeAgo } from './text';

describe('글 시간 표시', () => {
  const now = new Date(2026, 10, 9, 12, 0).getTime();
  it('방금 · 분 · 시간 · 일 · 날짜', () => {
    expect(timeAgo(now - 30_000, now)).toBe('방금');
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5분 전');
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe('3시간 전');
    expect(timeAgo(now - 2 * 86_400_000, now)).toBe('2일 전');
    expect(timeAgo(new Date(2026, 9, 20, 9).getTime(), now)).toBe('10/20');
  });
});
