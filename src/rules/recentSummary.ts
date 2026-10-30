// 최근 7일 요약 (B-5, 수정명세 v3 V3-2에서 월~일 → 오늘 포함 최근 7일로 바꿈).
// 플랜은 "앞으로 7일", 요약은 "최근 7일"이라 요일 경계가 없다.
// 기록(MealLog)의 시각은 기기 현지 날짜로 바꿔서 센다.

import { DISCARD_REASONS } from './constants';
import { addDays, toDateKey } from './date';
import { stateOf } from './status';
import type { DateKey, Item, MealLog } from './types';

const RECENT_DAYS = 7;

/** 오늘 포함 최근 7일 (6일 전 ~ 오늘) */
export function recentRange(today: DateKey): { start: DateKey; end: DateKey } {
  return { start: addDays(today, -(RECENT_DAYS - 1)), end: today };
}

/** 기록 시각(ISO) → 기기 현지 날짜 */
export const logDate = (log: Pick<MealLog, 'at'>) => toDateKey(new Date(log.at));

export type RecentSummary =
  | { kind: 'empty'; sentence: string }
  | {
      kind: 'summary';
      /** 먹은 재료 */
      eaten: number;
      /** 그중 먹을 때 얼른 먹어야 할 재료였던 것 (상태를 모르는 예전 기록은 세지 않음) */
      eatenSoon: number;
      /** 버린 재료 */
      discarded: number;
      /** 가장 많은 버린 이유 (없으면 null, 같으면 칩 순서가 앞선 것) */
      topReason: string | null;
      /** 지금 냉장고에 남은 얼른 먹어야 할 재료 */
      soonNow: number;
      sentence: string;
      /** "지금 얼른 먹어야 할 재료 d개" 줄을 보여줄지 (문장에 이미 d가 있으면 빼요, V3-6-1) */
      showSoonNowLine: boolean;
    };

export function recentSummary(logs: readonly MealLog[], items: readonly Item[], today: DateKey): RecentSummary {
  const { start, end } = recentRange(today);
  const week = logs.filter((l) => logDate(l) >= start && logDate(l) <= end);
  if (!week.length) return { kind: 'empty', sentence: '최근 7일 기록이 쌓이면 여기에서 요약해 드려요' };

  const eats = week.filter((l) => l.action === 'eat');
  const discards = week.filter((l) => l.action === 'discard');
  const eatenSoon = eats.filter((l) => l.stateAtAction === 'soon').length;
  const soonNow = items.filter((i) => stateOf(i, today) === 'soon').length;

  const counts = new Map<string, number>();
  for (const l of discards) if (l.discardReason) counts.set(l.discardReason, (counts.get(l.discardReason) ?? 0) + 1);
  const order = (r: string) => (DISCARD_REASONS.includes(r) ? DISCARD_REASONS.indexOf(r) : DISCARD_REASONS.length);
  const topReason = [...counts].sort((a, b) => b[1] - a[1] || order(a[0]) - order(b[0]))[0]?.[0] ?? null;

  return {
    kind: 'summary',
    eaten: eats.length,
    eatenSoon,
    discarded: discards.length,
    topReason,
    soonNow,
    showSoonNowLine: !eatenSoon,
    sentence: eatenSoon
      ? `최근 7일 동안 얼른 먹어야 할 재료 ${eatenSoon}개를 먹었어요. ${soonNow}개는 아직 남아 있어요.`
      : eats.length
        ? // 명세에 없는 경우: 먹긴 했지만 얼른 먹어야 할 재료는 아니었음 ("아직 먹은 재료가 없어요"와 숫자가 어긋나지 않게)
          `최근 7일 동안 먹은 재료 ${eats.length}개 중 얼른 먹어야 할 재료는 아직 없어요.`
        : '최근 7일 동안은 아직 먹은 재료가 없어요.',
  };
}
