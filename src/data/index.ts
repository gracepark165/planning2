// JSON 데이터를 타입을 붙여서 내보낸다. 화면·규칙 코드는 JSON을 직접 읽지 않고 여기서 가져간다.

import type {
  CatalogEntry,
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

export const CATALOG = catalogJson.items as CatalogEntry[];
export const PICKER_CATALOG = CATALOG.filter((c) => c.picker);
export const PLAN_RECIPES = recipesJson.recipes as Recipe[];
export const RETAILERS = retailersJson.retailers as Retailer[];
export const VIDEO_EXAMPLES = examplesJson.videos as VideoExample[];
export const ORDER_EXAMPLE_ITEMS = examplesJson.orderItems as OrderExampleItem[];
export const SUBSTITUTES = substitutesJson as SubstituteTable;

const nameKey = (name: string) => name.replace(/\s+/g, '');
const byName = new Map<string, CatalogEntry>();
for (const c of CATALOG) for (const n of [c.name, ...(c.aliases ?? [])]) byName.set(nameKey(n), c);

/** 이름(또는 다른 이름)이 같은 사전 항목. 띄어쓰기는 무시한다. */
export function findCatalog(name: string): CatalogEntry | undefined {
  return byName.get(nameKey(name));
}

/** 대표 이름: 사전에 있으면 사전 이름(달걀 → 계란), 없으면 그대로 */
export function canonicalName(name: string): string {
  return findCatalog(name)?.name ?? name.trim();
}
