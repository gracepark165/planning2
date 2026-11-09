// JSON 데이터를 타입을 붙여서 내보낸다. 화면·규칙 코드는 JSON을 직접 읽지 않고 여기서 가져간다.

import type {
  CatalogEntry,
  FoodCategory,
  FoodKind,
  Item,
  OrderExampleItem,
  Recipe,
  Retailer,
  SubstituteTable,
  VideoExample,
} from '../rules/types';
import catalogJson from './catalog.json';
import recipesJson from './recipes.json';
import retailersJson from './retailers.json';
import examplesJson from './examples.json';
import substitutesJson from './substitutes.json';
import kindsJson from './kinds.json';

export const CATALOG = catalogJson.items as CatalogEntry[];
export const PICKER_CATALOG = CATALOG.filter((c) => c.picker);
/** 재료 추가 화면의 큰 분류 9개 */
export const CATEGORIES = catalogJson.categories as FoodCategory[];
export const PLAN_RECIPES = recipesJson.recipes as Recipe[];
export const RETAILERS = retailersJson.retailers as Retailer[];
export const VIDEO_EXAMPLES = examplesJson.videos as VideoExample[];
export const ORDER_EXAMPLE_ITEMS = examplesJson.orderItems as OrderExampleItem[];
/** 예시 주문의 마트와 며칠 전에 도착했는지 */
export const ORDER_EXAMPLE_RETAILER: string = examplesJson.orderRetailer;
export const ORDER_EXAMPLE_ARRIVED_DAYS_AGO: number = examplesJson.orderArrivedDaysAgo;
export const SUBSTITUTES = substitutesJson as SubstituteTable;
/** 종류별 기본 기간표 (사전에 없는 재료용, 임시) */
export const KINDS = kindsJson.kinds as FoodKind[];

export function findKind(id: string | undefined): FoodKind | undefined {
  return id ? KINDS.find((k) => k.id === id) : undefined;
}

/** 이름 비교용 키: 띄어쓰기를 무시한다 */
export const nameKey = (name: string) => name.replace(/\s+/g, '');
const byName = new Map<string, CatalogEntry>();
for (const c of CATALOG) for (const n of [c.name, ...(c.aliases ?? [])]) byName.set(nameKey(n), c);

/** 이름(또는 다른 이름)이 같은 사전 항목. 띄어쓰기는 무시한다. */
export function findCatalog(name: string): CatalogEntry | undefined {
  return byName.get(nameKey(name));
}

/** 홈에서 묶는 큰 분류 중 '기타' (사전 분류에 맞지 않는 재료) */
export const ETC_CATEGORY: FoodCategory = { id: 'etc', label: '기타', emoji: '🍽️', customKind: 'deli' };
/** 재료 사전에 없는 재료는 저장된 품목군으로 큰 분류를 고른다 */
const GROUP_TO_CATEGORY: Record<string, string> = {
  meat: 'meat', seafood: 'seafood', veg: 'veg', dairy: 'dairyEgg', grain: 'grainBread', sauce: 'sauce', frozenFood: 'frozen',
};
/** 냉장고 홈에서 재료를 묶을 큰 분류 id: 사전 분류 → 품목군 → 기타 */
export function categoryOfItem(item: Pick<Item, 'name' | 'group'>): string {
  return findCatalog(item.name)?.category ?? (item.group && GROUP_TO_CATEGORY[item.group]) ?? ETC_CATEGORY.id;
}
/** 분류 id → 분류 정보 (기타 포함) */
export function categoryMeta(id: string): FoodCategory {
  return CATEGORIES.find((c) => c.id === id) ?? ETC_CATEGORY;
}

/** 대표 이름: 사전에 있으면 사전 이름(달걀 → 계란), 없으면 그대로 */
export function canonicalName(name: string): string {
  return findCatalog(name)?.name ?? name.trim();
}
