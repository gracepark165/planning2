// 재료를 한 끼에 얼마나 쓰는지 (수정명세 v4 V4-3)
// - pieces: 소분한 재료. 한 끼에 1개씩 줄어든다
// - level:  여러 끼에 나눠 쓰는 재료(계란 10구, 우유 900ml …). 한 끼에 남은 양이 한 단계 내려간다: 넉넉해요 → 반쯤 → 조금 → 다 씀
// - whole:  한 끼에 다 쓰는 재료(두부 1모, 애호박 1개 …). 쓰면 빠진다
// 정하는 순서: 소분이면 pieces → 사용자가 고른 값 → 재료 사전 → 품목군(양념·소스, 면·곡물, 유제품은 level) → 수량 단위

import { findCatalog } from '../data';
import { REMAINING_LEVELS } from './constants';
import type { CatalogEntry, FoodGroup, Item, Remaining } from './types';

export type Portion = 'pieces' | 'level' | 'whole';

/** 이 품목군은 기본으로 나눠 쓴다 */
const LEVEL_GROUPS: readonly FoodGroup[] = ['sauce', 'grain', 'dairy'];
/** 사전에 없는 재료: 수량이 이 단위로 끝나면 나눠 쓴다 */
const LEVEL_UNIT_RE = /(구|ml|l|g|kg|통|망|봉)$/i;

/** 남은 양별로 더 쓸 수 있는 끼니 수 */
export const LEVEL_MEALS: Record<Remaining, number> = { 넉넉해요: 3, 반쯤: 2, 조금: 1 };

/** 사전 항목(또는 수량 글자)으로 정한 기본값 */
export function defaultPortion(entry: CatalogEntry | undefined, qty: string): 'level' | 'whole' {
  if (entry?.portion) return entry.portion;
  if (entry) return LEVEL_GROUPS.includes(entry.group) ? 'level' : 'whole';
  return LEVEL_UNIT_RE.test(qty.trim()) ? 'level' : 'whole';
}

export function portionOf(item: Pick<Item, 'name' | 'qty' | 'portioned' | 'portion'>): Portion {
  if (item.portioned) return 'pieces';
  return item.portion ?? defaultPortion(findCatalog(item.name), item.qty);
}

/** 이 재료로 앞으로 몇 끼를 쓸 수 있는지 */
export function mealsLeft(item: Item): number {
  const p = portionOf(item);
  if (p === 'pieces') return Math.max(item.count ?? 1, 0);
  if (p === 'level') return LEVEL_MEALS[item.remaining];
  return 1;
}

/** 한 끼 쓰고 난 남은 양. 조금에서 쓰면 다 씀(null) */
export function stepDown(r: Remaining): Remaining | null {
  const i = REMAINING_LEVELS.indexOf(r);
  return i < REMAINING_LEVELS.length - 1 ? REMAINING_LEVELS[i + 1] : null;
}

/** 되돌리기: 한 단계 올린다 (넉넉해요가 끝) */
export function stepUp(r: Remaining): Remaining {
  const i = REMAINING_LEVELS.indexOf(r);
  return REMAINING_LEVELS[Math.max(0, i - 1)];
}
