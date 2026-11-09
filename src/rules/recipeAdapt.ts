// 레시피 재료를 냉장고에 있는 재료로 맞추기 (2026-11-09, 레시피 확장)
// 레시피는 대표 재료 하나로 적어 둔다(제육볶음 = 제육용). 냉장고에 그 이름이 없으면
// 대체 묶음표(10장)의 같은 묶음 재료로 바꿔 쓴다. 후보가 여럿이면 소비기한이 가까운 순으로
// 갈래(변형)를 만들어 둬서, 앞 끼니가 한 재료를 쓰고 나면 다음 끼니는 다른 재료로 같은 메뉴를 만들 수 있다
// (부침두부·연두부가 둘 다 있으면 두부조림을 연두부로도).
// 묶음표에 없는 일반 이름(돼지고기·소고기)은 같은 핵심 재료 묶음의 재료로 본다.
import { daysLeft } from './status';
import type { DateKey, Item, Recipe, SubstituteTable } from './types';

/** 한 레시피에서 만드는 갈래 수 상한 */
const MAX_VARIANTS = 4;

/** 메뉴 이름 속 재료 이름을 바꾼다. 다른 낱말의 일부(마파두부의 두부)는 그대로 둔다 */
function rename(name: string, from: string, to: string): string {
  const k = name.indexOf(from);
  if (k < 0 || (k > 0 && name[k - 1] !== ' ')) return name;
  return name.slice(0, k) + to + name.slice(k + from.length);
}

export function adaptRecipeVariants(recipe: Recipe, items: readonly Item[], table: SubstituteTable, today: DateKey): Recipe[] {
  const have = new Map<string, Item>();
  for (const i of items) {
    const cur = have.get(i.name);
    if (!cur || daysLeft(i, today) < daysLeft(cur, today)) have.set(i.name, i);
  }
  const all = [...recipe.uses, ...recipe.keeps];
  const fixed = new Set(all.filter((n) => have.has(n)));
  const options = all.map((name) => {
    if (have.has(name)) return [name];
    const group = table.groups.find((g) => g.members.includes(name));
    if (!group) return [name];
    const pool = [...group.members, ...(group.core ? [group.core] : [])]
      .filter((n) => n !== name && have.has(n) && !fixed.has(n))
      .sort((a, b) => daysLeft(have.get(a)!, today) - daysLeft(have.get(b)!, today));
    return pool.length ? pool : [name];
  });
  // 갈래 만들기: 앞 재료의 후보 순서대로, 한 레시피 안에서 같은 재고를 두 번 쓰지 않게
  let combos: string[][] = [[]];
  options.forEach((opts, k) => {
    combos = combos.flatMap((c) => {
      const free = opts.filter((o) => !c.includes(o));
      return (free.length ? free : [all[k]]).map((o) => [...c, o]);
    });
    combos = combos.slice(0, MAX_VARIANTS);
  });
  // 사야 할 재료도 냉장고에 같은 묶음 재료가 있으면 그걸로 (두부 → 부침두부: "사야 해요 · 두부"가 뜨지 않게)
  const buyOf = (c: string[]) =>
    recipe.buy.map((b) => {
      if (have.has(b)) return b;
      const group = table.groups.find((g) => g.members.includes(b));
      const alt = group?.members.find((m) => m !== b && have.has(m) && !c.includes(m));
      return alt ?? b;
    });
  return combos.map((c) => {
    const buy = buyOf(c);
    const same = c.every((n, k) => n === all[k]) && buy.every((b, k) => b === recipe.buy[k]);
    if (same) return recipe;
    const name = c.reduce((acc, n, k) => (n === all[k] ? acc : rename(acc, all[k], n)), recipe.name);
    return { ...recipe, name, uses: c.slice(0, recipe.uses.length), keeps: c.slice(recipe.uses.length), buy, adapted: true };
  });
}

/** 가장 급한 갈래 하나 */
export const adaptRecipe = (recipe: Recipe, items: readonly Item[], table: SubstituteTable, today: DateKey): Recipe =>
  adaptRecipeVariants(recipe, items, table, today)[0];

export const adaptRecipes = (recipes: readonly Recipe[], items: readonly Item[], table: SubstituteTable, today: DateKey) =>
  recipes.flatMap((r) => adaptRecipeVariants(r, items, table, today));
