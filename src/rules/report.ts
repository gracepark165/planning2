// 나의 활동 리포트 (2026-11-10, 사용자 요청: 아래 탭 오른쪽 끝 "나의 활동"에서 리포트를 본다)
// 다 먹었어요·버렸어요 기록(MealLog)과 확정한 끼니(DoneMeal)를 기간별로 모아 숫자·이유 순위·날짜별 기록으로 만든다.
// 화면과 무관한 순수 함수. 날짜는 기기 현지 날짜(logDate)로 센다.

import { DISCARD_REASONS } from './constants';
import { addDays, toDateKey } from './date';
import { logDate } from './recentSummary';
import type { DateKey, DoneMeal, MealLog } from './types';

export const REPORT_PERIODS = [7, 30] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export interface DayRecord {
  date: DateKey;
  /** 그날 확정한 집밥 메뉴 */
  meals: string[];
  /** 다 먹었어요 (이름 없는 예전 기록은 '재료') */
  eaten: string[];
  /** 버렸어요 + 이유 */
  discarded: { name: string; reason: string | null }[];
}

export interface ActivityReport {
  start: DateKey;
  end: DateKey;
  eaten: number;
  /** 먹을 때 얼른 먹어야 할 재료였던 것 (예전 기록 unknown은 세지 않음) */
  eatenSoon: number;
  discarded: number;
  meals: number;
  /** 먹어서 지킨 비율 (먹은 / (먹은 + 버린)), 기록이 없으면 null */
  savedRate: number | null;
  /** 버린 이유 많은 순 (같으면 칩 순서), 이유 없음은 '이유 안 남김' */
  reasons: { reason: string; count: number }[];
  /** 기록이 있는 날만, 최근 날짜부터 */
  days: DayRecord[];
}

export const NO_REASON = '이유 안 남김';

export function activityReport(
  logs: readonly MealLog[],
  doneMeals: readonly DoneMeal[],
  today: DateKey,
  period: ReportPeriod,
): ActivityReport {
  const start = addDays(today, -(period - 1));
  const inRange = (d: DateKey) => d >= start && d <= today;
  const ls = logs.filter((l) => inRange(logDate(l)));
  const ms = doneMeals.map((m) => ({ m, date: m.date ?? toDateKey(new Date(m.at)) })).filter((x) => inRange(x.date));

  const eats = ls.filter((l) => l.action === 'eat');
  const discards = ls.filter((l) => l.action === 'discard');

  const counts = new Map<string, number>();
  for (const l of discards) {
    const r = l.discardReason ?? NO_REASON;
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  const order = (r: string) => (r === NO_REASON ? 99 : DISCARD_REASONS.includes(r) ? DISCARD_REASONS.indexOf(r) : 50);
  const reasons = [...counts]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || order(a.reason) - order(b.reason));

  const byDay = new Map<DateKey, DayRecord>();
  const day = (d: DateKey) => {
    let r = byDay.get(d);
    if (!r) byDay.set(d, (r = { date: d, meals: [], eaten: [], discarded: [] }));
    return r;
  };
  for (const { m, date } of ms) day(date).meals.push(m.recipe);
  for (const l of eats) day(logDate(l)).eaten.push(l.name ?? '재료');
  for (const l of discards) day(logDate(l)).discarded.push({ name: l.name ?? '재료', reason: l.discardReason });

  const total = eats.length + discards.length;
  return {
    start,
    end: today,
    eaten: eats.length,
    eatenSoon: eats.filter((l) => l.stateAtAction === 'soon').length,
    discarded: discards.length,
    meals: ms.length,
    savedRate: total ? Math.round((eats.length / total) * 100) : null,
    reasons,
    days: [...byDay.values()].sort((a, b) => (a.date < b.date ? 1 : -1)),
  };
}

/** 한 줄 요약 (꾸짖지 않는 말투) */
export function reportSentence(r: ActivityReport, period: ReportPeriod): string {
  const span = `최근 ${period}일 동안`;
  if (!r.eaten && !r.discarded && !r.meals) return `${span} 남긴 기록이 아직 없어요. 재료를 다 먹거나 끼니를 정하면 여기에 쌓여요.`;
  if (!r.discarded) return `${span} 버린 재료 없이 ${r.eaten}개를 다 먹었어요. 잘하고 있어요!`;
  if (r.savedRate !== null && r.savedRate >= 70) return `${span} 재료 ${r.savedRate}%를 먹어서 지켰어요.`;
  return `${span} 재료 ${r.eaten + r.discarded}개 중 ${r.eaten}개를 먹었어요. 얼른 먹어야 할 재료부터 끼니에 넣어 볼까요?`;
}
