// 상태 판정·정렬. AI가 아니라 규칙으로 계산한다.
// "오늘"은 항상 인자로 받는다.

import { BURIED_AGO, BURIED_URGENCY, SOON_DAYS, SOON_URGENCY_BASE, STATE_META } from './constants';
import { daysBetween } from './date';
import type { DateKey, Item, ItemState } from './types';

type Dated = Pick<Item, 'enteredAt' | 'expiresAt'>;

/** 남은 소비기한(일). 오늘까지면 0, 지났으면 음수. */
export function daysLeft(item: Dated, today: DateKey): number {
  return daysBetween(today, item.expiresAt);
}

/** 냉장고에 들어온 지 며칠 */
export function daysSinceEntered(item: Dated, today: DateKey): number {
  return daysBetween(item.enteredAt, today);
}

/** 곧 상할 → 묻힘 후보 → 정상 순서로 검사한다. */
export function stateOf(item: Dated, today: DateKey): ItemState {
  if (daysLeft(item, today) <= SOON_DAYS) return 'soon';
  if (daysSinceEntered(item, today) >= BURIED_AGO) return 'buried';
  return 'ok';
}

export function stateLabel(state: ItemState): string {
  return STATE_META[state].label;
}

/** 급함 점수 (플랜 정렬용): 곧 상할 = 10 − 남은일수(지났으면 0으로 봄), 묻힘 = 5, 정상 = 0 */
export function urgencyOf(item: Dated, today: DateKey): number {
  const s = stateOf(item, today);
  if (s === 'soon') return SOON_URGENCY_BASE - Math.max(daysLeft(item, today), 0);
  if (s === 'buried') return BURIED_URGENCY;
  return 0;
}

/** 홈 목록 정렬(FR-12): 묻힘 후보 먼저, 그다음 소비기한이 가까운 순. 같으면 원래 순서. */
export function sortForHome<T extends Dated>(items: readonly T[], today: DateKey): T[] {
  const key = (i: T) => (stateOf(i, today) === 'buried' ? 0 : 1);
  return [...items].sort((a, b) => key(a) - key(b) || daysLeft(a, today) - daysLeft(b, today));
}

export function countByState(items: readonly Dated[], today: DateKey): Record<ItemState, number> {
  const cnt: Record<ItemState, number> = { soon: 0, buried: 0, ok: 0 };
  for (const i of items) cnt[stateOf(i, today)]++;
  return cnt;
}

/** 홈 헤드라인 두 줄 */
export function homeHeadline(counts: Record<ItemState, number>): { title: string; lead: string } {
  return {
    title: counts.soon ? `얼른 먹어야 할 재료가 ${counts.soon}개 있어요` : '급한 재료가 없어요',
    lead: counts.buried ? `${stateLabel('buried')}인 재료도 ${counts.buried}개예요.` : `${stateLabel('buried')}인 재료는 없어요.`,
  };
}

/** D-day 표시: 'D-3' / '오늘까지' / '2일 지났어요' */
export function dDayLabel(left: number): string {
  if (left < 0) return `${-left}일 지났어요`;
  if (left === 0) return '오늘까지';
  return `D-${left}`;
}
