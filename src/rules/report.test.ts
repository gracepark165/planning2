import { describe, expect, it } from 'vitest';
import { NO_REASON, activityReport, reportSentence } from './report';
import type { DoneMeal, MealLog } from './types';

const today = '2026-11-10';
// 현지 시각 정오로 만들어 날짜가 시간대에 따라 밀리지 않게
const at = (d: string) => new Date(`${d}T12:00:00`).toISOString();
const log = (name: string, action: 'eat' | 'discard', d: string, extra: Partial<MealLog> = {}): MealLog => ({
  itemId: name, name, action, at: at(d), stateAtAction: 'ok', discardReason: null, ...extra,
});
const meal = (recipe: string, d: string): DoneMeal => ({ recipe, usedItems: [], soonUsed: [], at: at(d), date: d });

describe('나의 활동 리포트 (2026-11-10)', () => {
  const logs = [
    log('두부', 'eat', '2026-11-10', { stateAtAction: 'soon' }),
    log('대파', 'eat', '2026-11-09'),
    log('우유', 'discard', '2026-11-08', { discardReason: '깜빡했어요' }),
    log('상추', 'discard', '2026-11-08', { discardReason: '상했어요' }),
    log('오이', 'discard', '2026-11-07', { discardReason: '깜빡했어요' }),
    log('양파', 'discard', '2026-11-06'),
    log('옛날 재료', 'eat', '2026-10-20'),
  ];
  const meals = [meal('두부 김치찌개', '2026-11-10'), meal('마파두부', '2026-10-25')];

  it('최근 7일: 숫자·지킨 비율·이유 순위', () => {
    const r = activityReport(logs, meals, today, 7);
    expect(r).toMatchObject({ start: '2026-11-04', end: today, eaten: 2, eatenSoon: 1, discarded: 4, meals: 1, savedRate: 33 });
    expect(r.reasons).toEqual([
      { reason: '깜빡했어요', count: 2 },
      { reason: '상했어요', count: 1 },
      { reason: NO_REASON, count: 1 },
    ]);
  });

  it('날짜별 기록은 최근 날짜부터, 기록이 있는 날만', () => {
    const r = activityReport(logs, meals, today, 7);
    expect(r.days.map((d) => d.date)).toEqual(['2026-11-10', '2026-11-09', '2026-11-08', '2026-11-07', '2026-11-06']);
    expect(r.days[0]).toEqual({ date: '2026-11-10', meals: ['두부 김치찌개'], eaten: ['두부'], discarded: [] });
    expect(r.days[2].discarded).toEqual([{ name: '우유', reason: '깜빡했어요' }, { name: '상추', reason: '상했어요' }]);
  });

  it('최근 30일은 더 오래된 기록까지', () => {
    const r = activityReport(logs, meals, today, 30);
    expect(r).toMatchObject({ eaten: 3, meals: 2 });
  });

  it('기록이 없으면 비율은 null, 문장은 안내', () => {
    const r = activityReport([], [], today, 7);
    expect(r.savedRate).toBeNull();
    expect(reportSentence(r, 7)).toContain('아직 없어요');
  });

  it('문장: 버린 게 없으면 칭찬, 많이 지켰으면 비율, 아니면 부드럽게 제안', () => {
    expect(reportSentence(activityReport([log('두부', 'eat', today)], [], today, 7), 7)).toBe('최근 7일 동안 버린 재료 없이 1개를 다 먹었어요. 잘하고 있어요!');
    const most = [...['a', 'b', 'c'].map((n) => log(n, 'eat', today)), log('d', 'discard', today)];
    expect(reportSentence(activityReport(most, [], today, 7), 7)).toBe('최근 7일 동안 재료 75%를 먹어서 지켰어요.');
    expect(reportSentence(activityReport(logs, meals, today, 7), 7)).toContain('6개 중 2개를 먹었어요');
  });
});
