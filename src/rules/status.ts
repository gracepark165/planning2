// 상태 판정·정렬. AI가 아니라 규칙으로 계산한다.
// "오늘"은 항상 인자로 받는다.

import { findCatalog } from '../data';
import {
  BURIED_AGO,
  BURIED_EXCLUDE_GROUPS,
  BURIED_URGENCY,
  SOON_DAYS,
  SOON_URGENCY_BASE,
  STATE_META,
} from './constants';
import { daysBetween } from './date';
import { iga } from './josa';
import type { DateKey, Item, ItemState } from './types';

/** 상태 판정에 필요한 것: 날짜 두 개 (+ 상비 재료인지 보려면 이름) */
type Dated = Pick<Item, 'enteredAt' | 'expiresAt'> & { name?: string; group?: Item['group'] };

/** 상비 재료(양념·소스, 면·곡물)인지: 재료 사전의 품목군으로 본다. 사전에 없는 재료는 저장된 품목군으로. */
export function isStaple(name: string | undefined, own?: Item['group']): boolean {
  const group = (name ? findCatalog(name)?.group : undefined) ?? own;
  return group !== undefined && BURIED_EXCLUDE_GROUPS.includes(group);
}

/** 남은 소비기한(일). 오늘까지면 0, 지났으면 음수. */
export function daysLeft(item: Dated, today: DateKey): number {
  return daysBetween(today, item.expiresAt);
}

/** 냉장고에 들어온 지 며칠 */
export function daysSinceEntered(item: Dated, today: DateKey): number {
  return daysBetween(item.enteredAt, today);
}

/** 곧 상할 → 묻힘 후보 → 정상 순서로 검사한다. 상비 재료는 묻힘 후보가 되지 않는다. */
export function stateOf(item: Dated, today: DateKey): ItemState {
  if (daysLeft(item, today) <= SOON_DAYS) return 'soon';
  if (daysSinceEntered(item, today) >= BURIED_AGO && !isStaple(item.name, item.group)) return 'buried';
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

/** 홈 구역 순서 (FR-12): 곧 상할 → 묻힘 후보 → 정상 */
export const HOME_SECTION_ORDER: readonly ItemState[] = ['soon', 'buried', 'ok'];

/**
 * 홈 목록 정렬(FR-12): 상태 순서(HOME_SECTION_ORDER).
 * 같은 상태 안은 소비기한이 가까운 순, 단 묻힘 후보끼리는 오래 묵은 순(화면에 "N일째"를 크게 보여주므로).
 * 그래도 같으면 원래 순서.
 */
export function sortForHome<T extends Dated>(items: readonly T[], today: DateKey): T[] {
  const keyed = items.map((i) => ({ i, st: stateOf(i, today) }));
  keyed.sort((a, b) => {
    const byState = HOME_SECTION_ORDER.indexOf(a.st) - HOME_SECTION_ORDER.indexOf(b.st);
    if (byState) return byState;
    if (a.st === 'buried') {
      const byAge = daysSinceEntered(b.i, today) - daysSinceEntered(a.i, today);
      if (byAge) return byAge;
    }
    return daysLeft(a.i, today) - daysLeft(b.i, today);
  });
  return keyed.map((k) => k.i);
}

/**
 * 홈 목록을 상태별 구역으로 묶는다. 구역 안은 sortForHome 순서. 빈 구역은 뺀다.
 * 이름이 같은 재료(산 날이 다른 우유 두 개 등)는 떨어뜨리지 않고, 가장 앞에 오는 것 바로 아래에 붙인다.
 * 그래서 붙은 재료는 자기 상태와 다른 구역에 있을 수 있다. count는 구역 상태와 같은 재료 수(헤드라인과 맞춤).
 */
export function groupForHome<T extends Dated>(
  items: readonly T[],
  today: DateKey,
): { state: ItemState; items: T[]; count: number }[] {
  const clusters: T[][] = [];
  const byName = new Map<string, T[]>();
  for (const i of sortForHome(items, today)) {
    const same = i.name !== undefined ? byName.get(i.name) : undefined;
    if (same) same.push(i);
    else {
      const c = [i];
      clusters.push(c);
      if (i.name !== undefined) byName.set(i.name, c);
    }
  }
  return HOME_SECTION_ORDER.map((state) => {
    const list = clusters.filter((c) => stateOf(c[0], today) === state).flat();
    return { state, items: list, count: list.filter((i) => stateOf(i, today) === state).length };
  }).filter((g) => g.items.length > 0);
}

/** 바로 위 줄과 이름이 같은 재료인지 (홈에서 붙여 보여주는 줄) */
export const sameAsAbove = (list: readonly Dated[], index: number) =>
  index > 0 && list[index].name !== undefined && list[index - 1].name === list[index].name;

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

/** 홈 배너가 짚을 가장 급한 재료 (V3-4): 오늘 내일 해요 중 소비기한이 가장 가까운 것, 같으면 목록 순서 */
export function mostUrgentSoon<T extends Dated>(items: readonly T[], today: DateKey): T | undefined {
  return sortForHome(items.filter((i) => stateOf(i, today) === 'soon'), today)[0];
}

/** 홈 배너 문구: '닭안심이 내일까지예요' / '…오늘까지예요' / '…N일 뒤까지예요' / '…기한이 지났어요' */
export function dueBannerText(item: Dated & { name: string }, today: DateKey): string {
  const left = daysLeft(item, today);
  const when = left < 0 ? '기한이 지났어요' : left === 0 ? '오늘까지예요' : left === 1 ? '내일까지예요' : `${left}일 뒤까지예요`;
  return `${item.name}${iga(item.name)} ${when}`;
}

/**
 * 홈의 싱싱해요 묶음을 펼칠지 (V4-4): 사용자가 직접 정했으면 그대로,
 * 아니면 오늘 내일 해요·잊혀지는 중이 하나도 없을 때 펼친다 (재료가 하나도 안 보이지 않게).
 */
export const okSectionOpen = (pref: boolean | null, counts: Record<ItemState, number>) =>
  pref ?? counts.soon + counts.buried === 0;
