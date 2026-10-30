// 장보기 목록 (B-1): 이번 주 플랜의 사야 할 재료 + 영상 확인에서 담은 재료.
// 플랜의 재료는 그때그때 계산하므로 저장하지 않고, 체크하거나 ✕로 지운 것만 저장한다.

import type { ShoppingItem } from './types';

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
