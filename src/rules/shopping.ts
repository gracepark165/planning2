// 장보기 목록 (B-1): 이번 주 플랜의 사야 할 재료 + 영상 확인에서 담은 재료.
// 플랜의 재료는 그때그때 계산하므로 저장하지 않고, 체크하거나 ✕로 지운 것만 저장한다.

import { canonicalName } from '../data';
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
