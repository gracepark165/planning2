// 소비기한·입고일·보관 위치 자동 계산 (FR-13/17/18).
// 재료 사전 항목은 인자로 받는다 (사전에 없으면 undefined).

import { PORTION_FREEZE_GROUPS, PORTION_SHELF_DAYS, SHELF_TABLE_IS_PROVISIONAL } from './constants';
import { addDays, daysBetween } from './date';
import type { CatalogEntry, DateKey, FoodKind, Item, Location, Retailer } from './types';

/** 기본 기간(일). 소분이면 소분 기간표, 표에 없는 품목군이면 품목 기본 기간. 사전에 없으면 undefined. */
export function shelfDaysFor(entry: CatalogEntry | undefined, portioned: boolean): number | undefined {
  if (!entry) return undefined;
  if (portioned) return PORTION_SHELF_DAYS[entry.group] ?? entry.shelfDays;
  return entry.shelfDays;
}

/** 입고일 + 기본 기간 = 소비기한. 사전에 없는 재료는 사용자가 골라야 하므로 undefined. */
export function autoExpiresAt(
  enteredAt: DateKey,
  entry: CatalogEntry | undefined,
  portioned: boolean,
): DateKey | undefined {
  const days = shelfDaysFor(entry, portioned);
  return days === undefined ? undefined : addDays(enteredAt, days);
}

/**
 * 입고일·소분 여부가 바뀌었을 때 소비기한을 다시 계산한다.
 * 사용자가 고친 값(user)이나 표기에서 읽은 값(label)은 그대로 둔다.
 */
export function refreshAutoExpiry(item: Item, entry: CatalogEntry | undefined): Item {
  if (item.expiryBasis !== 'table') return item;
  const expiresAt = autoExpiresAt(item.enteredAt, entry, item.portioned);
  return expiresAt && expiresAt !== item.expiresAt ? { ...item, expiresAt } : item;
}

/** 소비기한 ±일. 고친 값은 근거가 'user'가 되어 항상 우선한다. 입고일보다 앞으로는 가지 않는다. */
export function shiftExpiry(item: Item, delta: number): Item {
  let expiresAt = addDays(item.expiresAt, delta);
  if (daysBetween(item.enteredAt, expiresAt) < 0) expiresAt = item.enteredAt;
  if (expiresAt === item.expiresAt) return item;
  return { ...item, expiresAt, expiryBasis: 'user' };
}

/** 기본 보관 위치. 소분한 육류·해산물·냉동식품은 냉동 (임시 가정). 사전에 없으면 냉장. */
export function defaultLocation(entry: CatalogEntry | undefined, portioned: boolean): Location {
  if (!entry) return '냉장';
  if (portioned && PORTION_FREEZE_GROUPS.includes(entry.group)) return '냉동';
  return entry.location;
}

/** 사전에 없는 재료를 종류로 분류했을 때의 보관 위치: 고른 위치(AI가 읽은 보관 방법·사용자) → 소분 냉동 → 종류 기본 */
export function kindLocation(kind: FoodKind, portioned: boolean, picked?: Location): Location {
  if (picked) return picked;
  if (portioned && PORTION_FREEZE_GROUPS.includes(kind.group)) return '냉동';
  return kind.location;
}

/** 종류별 기본 기간(일). 소분이면 소분 기간표, 냉동 보관이면 냉동 기간을 쓴다. */
export function kindShelfDays(kind: FoodKind, location: Location, portioned: boolean): number {
  if (portioned) return PORTION_SHELF_DAYS[kind.group] ?? kind.days;
  if (location === '냉동' && kind.location !== '냉동') return kind.freezerDays ?? kind.days;
  return kind.days;
}

/**
 * 입고일(FR-17): 주문일 + 마트별 일수. 마감 시각 이후 주문은 하루 늦게.
 * orderHour를 모르면 마감 전 주문으로 본다.
 */
export function checkinDate(orderDate: DateKey, retailer: Retailer, orderHour?: number): DateKey {
  const late = retailer.cutoffHour !== undefined && orderHour !== undefined && orderHour >= retailer.cutoffHour;
  return addDays(orderDate, retailer.checkinDays + (late ? 1 : 0));
}

/** 입고일 → 소비기한 일수. "보통 N일" 같은 문구의 N은 항상 이 값이다 (사전 숫자를 따로 쓰지 않는다). */
export const keepDays = (item: Pick<Item, 'enteredAt' | 'expiresAt'>) => daysBetween(item.enteredAt, item.expiresAt);

type Basis = Pick<Item, 'enteredAt' | 'expiresAt' | 'expiryBasis'>;

/** 재료 시트의 "근거" 문구. 표기에서 읽었거나 고친 값·예시 재료는 기간 문구를 붙이지 않는다. */
export function expiryBasisText(item: Basis): string {
  switch (item.expiryBasis) {
    case 'label':
      return '주문 화면에 적힌 소비기한';
    case 'user':
      return '직접 고친 값';
    case 'sample':
      return '예시 재료예요';
    case 'table':
      return `기본 기간표 기준 · 보통 ${keepDays(item)}일`;
    case 'kind':
      return `비슷한 종류 기준 · 보통 ${keepDays(item)}일`;
    case 'mine':
      return `지난번에 정한 기간 · 보통 ${keepDays(item)}일`;
  }
}

/**
 * 기준 안내 문구: "이 재료는 보통 N일 두고 먹어요" (N = 소비기한 − 입고일).
 * 기간표로 정한 값에만 보여준다. 표기·고친 값·예시 재료면 null.
 */
export function usualShelfText(item: Basis & Pick<Item, 'portioned'>): string | null {
  if (item.expiryBasis !== 'table' && item.expiryBasis !== 'kind' && item.expiryBasis !== 'mine') return null;
  const n = keepDays(item);
  const text = item.portioned ? `소분해 두면 보통 ${n}일 두고 먹어요` : `이 재료는 보통 ${n}일 두고 먹어요`;
  return item.expiryBasis !== 'mine' && SHELF_TABLE_IS_PROVISIONAL ? `${text} · 기간표는 검증 전 임시 값이에요` : text;
}
