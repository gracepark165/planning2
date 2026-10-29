// 지난번 값 기억하기: 재료 사전에 없는 재료를 넣을 때 정한 소비기한(일)·보관 위치를 기기에 기억해 두고,
// 다음에 같은 이름이 나오면 사전 항목처럼 자동으로 채운다. 사전에 있는 재료는 기억하지 않는다 (사전 값이 기준).

import { findCatalog, nameKey } from '../data';
import { daysBetween } from '../rules/date';
import type { CatalogEntry, Item, MyFood } from '../rules/types';

/** 이름 키(띄어쓰기 무시) → 기억한 값 */
export type MyFoods = Record<string, MyFood>;

type Lookup = (name: string) => CatalogEntry | undefined;

/** 사전을 먼저 보고, 없으면 기억한 값을 사전 항목 모양으로 돌려준다 (mine: true) */
export function withMyFoods(lookup: Lookup, mine: MyFoods): Lookup {
  return (name) => {
    const entry = lookup(name);
    if (entry) return entry;
    const m = mine[nameKey(name.trim())];
    return m && { name: m.name, core: '', shelfDays: m.shelfDays, location: m.location, group: m.group, mine: true };
  };
}

/** 사전에 없는 재료를 넣거나 고쳤을 때 기억한다. 포장에 적힌 소비기한(label)은 그 상품 하나의 값이라 기억하지 않는다. */
export function rememberItems(mine: MyFoods, items: readonly Item[]): MyFoods {
  let next = mine;
  for (const i of items) {
    if (findCatalog(i.name) || i.expiryBasis === 'label' || i.portioned) continue;
    const shelfDays = daysBetween(i.enteredAt, i.expiresAt);
    if (shelfDays < 1) continue;
    const key = nameKey(i.name);
    const prev = next[key];
    const value: MyFood = { name: i.name, shelfDays, location: i.location, group: i.group ?? prev?.group ?? 'etc' };
    if (prev && prev.shelfDays === value.shelfDays && prev.location === value.location && prev.group === value.group) continue;
    next = { ...next, [key]: value };
  }
  return next;
}
