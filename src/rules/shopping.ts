// 장보기 목록 (B-1): 이번 주 플랜의 사야 할 재료 + 영상 확인에서 담은 재료.
// 플랜의 재료는 그때그때 계산하므로 저장하지 않고, 체크하거나 ✕로 지운 것만 저장한다.

import { CATEGORIES, canonicalName, categoryMeta, categoryOfItem } from '../data';
import { groupOf } from './videoCheck';
import type { ShoppingItem, SubstituteTable } from './types';

/** 화면에 보여줄 장보기 목록: 저장된 줄(지운 것 빼고) → 플랜에만 있는 재료. 이미 냉장고에 있는 재료는 뺀다. */
export function shoppingView(
  planBuy: readonly string[],
  saved: readonly ShoppingItem[],
  owned: readonly string[],
): ShoppingItem[] {
  const have = new Set(owned);
  const savedNames = new Set(saved.map((s) => s.name));
  return [
    ...saved.filter((s) => !s.removed).map(({ name, from, checked }) => ({ name, from, checked })),
    ...planBuy.filter((n) => !savedNames.has(n)).map((name) => ({ name, from: 'plan' as const, checked: false })),
  ].filter((s) => !have.has(s.name));
}

/** 장보기 목록을 묶는 순서 (2026-11-10, 사용자 요청): 재료 추가 화면의 분류 순서 그대로, 기타는 맨 끝 */
const SHOP_ORDER = CATEGORIES.map((c) => c.id);

export interface ShoppingGroup<T> {
  id: string;
  label: string;
  emoji: string;
  items: T[];
}

/** 장보기 목록을 종류별로 묶는다. 묶음 안은 원래 순서 그대로 */
export function shoppingGroups<T extends { name: string }>(list: readonly T[]): ShoppingGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const it of list) {
    const id = categoryOfItem({ name: canonicalName(it.name) });
    map.set(id, [...(map.get(id) ?? []), it]);
  }
  const rank = (id: string) => (SHOP_ORDER.includes(id) ? SHOP_ORDER.indexOf(id) : SHOP_ORDER.length);
  return [...map]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([id, items]) => {
      const m = categoryMeta(id);
      return { id, label: m.label, emoji: m.emoji, items };
    });
}

/**
 * 장보기 목록의 재료를 샀다고 볼지 (V3-7-1): 대표 이름이 같거나(달걀 = 계란),
 * 같은 대체 묶음이면(냉동새우 ↔ 새우살) 같은 것으로 본다. 제안하지 않는 쌍(대파 ↔ 양파)은 다르다.
 */
export function boughtAs(listName: string, addedName: string, table: SubstituteTable): boolean {
  const a = canonicalName(listName);
  const b = canonicalName(addedName);
  if (a === b) return true;
  const never = table.neverSuggest.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const g = groupOf(a, table);
  return !never && g !== undefined && g === groupOf(b, table);
}

/** 확정하려는 메뉴의 사야 할 재료 중 아직 냉장고에 없는 것 (V4-6-5: "상추는 준비됐어요?") */
export function missingToBuy(recipe: { buy: readonly string[] }, items: readonly { name: string }[]): string[] {
  const have = new Set(items.map((i) => canonicalName(i.name)));
  return recipe.buy.filter((n) => !have.has(canonicalName(n)));
}
