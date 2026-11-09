// 레시피 재료를 냉장고에 있는 재료로 맞추기 (2026-11-09, 레시피 확장)
// 레시피는 대표 재료 하나로 적어 둔다(제육볶음 = 제육용). 냉장고에 그 이름이 없으면
// 대체 묶음표(10장)의 같은 묶음 재료 중 소비기한이 가장 가까운 것으로 바꿔 쓴다.
// 묶음표에 없는 일반 이름(돼지고기·소고기)은 같은 핵심 재료 묶음의 재료로 본다.
import { daysLeft } from './status';
import type { DateKey, Item, Recipe, SubstituteTable } from './types';

export function adaptRecipe(recipe: Recipe, items: readonly Item[], table: SubstituteTable, today: DateKey): Recipe {
  const have = new Map<string, Item>();
  for (const i of items) {
    const cur = have.get(i.name);
    if (!cur || daysLeft(i, today) < daysLeft(cur, today)) have.set(i.name, i);
  }
  const taken = new Set<string>([...recipe.uses, ...recipe.keeps].filter((n) => have.has(n)));
  const renamed: [string, string][] = [];
  const swap = (name: string): string => {
    if (have.has(name)) return name;
    const group = table.groups.find((g) => g.members.includes(name));
    if (!group) return name;
    const pool = [...group.members, ...(group.core ? [group.core] : [])]
      .filter((n) => n !== name && have.has(n) && !taken.has(n))
      .sort((a, b) => daysLeft(have.get(a)!, today) - daysLeft(have.get(b)!, today));
    if (!pool.length) return name;
    taken.add(pool[0]);
    renamed.push([name, pool[0]]);
    return pool[0];
  };
  const uses = recipe.uses.map(swap);
  const keeps = recipe.keeps.map(swap);
  if (uses.every((n, k) => n === recipe.uses[k]) && keeps.every((n, k) => n === recipe.keeps[k])) return recipe;
  // 메뉴 이름에 바꾼 재료 이름이 들어 있으면 같이 바꾼다 (닭다리살 구이 → 닭가슴살 구이)
  const name = renamed.reduce((n, [from, to]) => (n.includes(from) ? n.replace(from, to) : n), recipe.name);
  return { ...recipe, name, uses, keeps };
}

export const adaptRecipes = (recipes: readonly Recipe[], items: readonly Item[], table: SubstituteTable, today: DateKey) =>
  recipes.map((r) => adaptRecipe(r, items, table, today));
