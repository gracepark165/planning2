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

const byName = new Map(CATALOG.map((c) => [c.name, c]));

/** 이름이 정확히 같은 사전 항목 */
export function findCatalog(name: string): CatalogEntry | undefined {
  return byName.get(name);
}
