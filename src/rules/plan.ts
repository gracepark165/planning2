// 주간 소진 플랜 (FR-20~28). AI 없이 규칙으로 만든다.
//
// - 끼니 N개. 끼니 i의 날짜 = 오늘 + floor(i*7/N)
// - 후보: 필요한 재료(쓰는 것+상비)가 모두 (시뮬레이션) 재고에 있고, 쓰는 재료의 남은 일수 ≥ 그날, 건너뛴 레시피 제외
// - 정렬: 쓰는 재료 중 가장 급한 것(남은 일수 최소) → 급함 점수 합 높은 순. 쓰는 재료가 없는 레시피는 맨 뒤
// - 이번 주에 이미 고른(확정 포함) 레시피는 다른 후보 뒤로 보낸다 (소분 품목이 같은 메뉴만 반복되지 않게)
// - 고른 레시피의 쓰는 재료는 시뮬레이션 재고에서 뺀다 (소분 품목은 한 끼에 1개씩)
// - "바꾸기"는 같은 끼니의 다음 후보로 넘긴다

import { addDays } from './date';
import { iga } from './josa';
import { daysLeft, daysSinceEntered, stateOf, urgencyOf } from './status';
import type { DateKey, Item, Plan, Recipe } from './types';

export interface PlanSlot {
  /** 끼니 순번 (확정한 끼니 포함, 0부터) */
  index: number;
  /** 오늘부터 며칠 뒤 */
  dayOffset: number;
  date: DateKey;
  recipe: Recipe | null;
  /** 이 끼니의 후보 수 ("바꾸기"는 2개 이상일 때만) */
  candidateCount: number;
}

export interface PlanResult {
  slots: PlanSlot[];
  /** 플랜이 쓰고 남은 재고 (소분 품목은 남은 개수만큼) */
  leftover: { item: Item; count: number }[];
}

/** 끼니 i의 날짜(오늘부터 며칠 뒤) */
export const slotDay = (i: number, n: number) => Math.floor((i * 7) / n);

/** 재고에서 같은 이름 중 가장 급한(소비기한이 가까운) 재료 */
export function findItem(items: readonly Item[], name: string, today: DateKey): Item | undefined {
  let best: Item | undefined;
  for (const i of items) {
    if (i.name !== name) continue;
    if (!best || daysLeft(i, today) < daysLeft(best, today)) best = i;
  }
  return best;
}

/** 한 재료로 몇 끼를 쓸 수 있는지: 소분 품목은 개수, 아니면 1 */
export const mealsIn = (item: Item) => (item.portioned ? Math.max(item.count ?? 1, 0) : 1);

export function makePlan(items: readonly Item[], recipes: readonly Recipe[], plan: Plan, today: DateKey): PlanResult {
  const n = plan.mealsPerWeek;
  // 이름 → { 가장 급한 재료, 남은 끼니 수 }
  const sim = new Map<string, { item: Item; count: number }>();
  for (const i of items) {
    const cur = sim.get(i.name);
    if (!cur) sim.set(i.name, { item: i, count: mealsIn(i) });
    else {
      const urgent = daysLeft(i, today) < daysLeft(cur.item, today) ? i : cur.item;
      sim.set(i.name, { item: urgent, count: cur.count + mealsIn(i) });
    }
  }
  const has = (name: string) => (sim.get(name)?.count ?? 0) > 0;
  const left = (name: string) => daysLeft(sim.get(name)!.item, today);

  const picked = new Set(plan.doneMeals.map((m) => m.recipe));
  const slots: PlanSlot[] = [];
  for (let i = plan.doneMeals.length; i < n; i++) {
    const d = slotDay(i, n);
    const cands: { r: Recipe; minLeft: number; score: number }[] = [];
    for (const r of recipes) {
      if (plan.rejectedRecipes.includes(r.name)) continue;
      if (![...r.uses, ...r.keeps].every(has)) continue;
      if (!r.uses.every((u) => left(u) >= d)) continue;
      const minLeft = r.uses.length ? Math.min(...r.uses.map(left)) : Infinity;
      const score = r.uses.reduce((a, u) => a + urgencyOf(sim.get(u)!.item, today), 0);
      cands.push({ r, minLeft, score });
    }
    cands.sort((a, b) => a.minLeft - b.minLeft || b.score - a.score);
    const withUses = cands.filter((c) => c.r.uses.length);
    const list = [
      ...withUses.filter((c) => !picked.has(c.r.name)),
      ...withUses.filter((c) => picked.has(c.r.name)),
      ...cands.filter((c) => !c.r.uses.length),
    ];
    const pick = list.length ? list[(plan.swapIndex[i] ?? 0) % list.length] : undefined;
    if (pick) {
      picked.add(pick.r.name);
      for (const u of pick.r.uses) {
        const e = sim.get(u)!;
        e.count -= 1;
      }
    }
    slots.push({ index: i, dayOffset: d, date: addDays(today, d), recipe: pick?.r ?? null, candidateCount: list.length });
  }

  const leftover = [...sim.values()].filter((e) => e.count > 0);
  return { slots, leftover };
}

/** 배치 이유 문장 (규칙으로 만든다) */
export function reasonOf(recipe: Recipe, items: readonly Item[], today: DateKey): string {
  if (!recipe.uses.length) return '급한 재료가 없어서 가볍게 먹어요';
  const used = recipe.uses
    .map((n) => findItem(items, n, today))
    .filter((i) => i !== undefined)
    .sort((a, b) => daysLeft(a, today) - daysLeft(b, today));
  const it = used[0];
  if (!it) return '';
  const name = it.name;
  const st = stateOf(it, today);
  if (st === 'soon') {
    const l = daysLeft(it, today);
    const when = l <= 0 ? '오늘까지' : l === 1 ? '내일까지' : `${l}일 뒤까지`;
    return `${name}${iga(name)} ${when}라서 먼저 배치했어요`;
  }
  if (st === 'buried') return `${name}${iga(name)} ${daysSinceEntered(it, today)}일째 잠들어 있어서 먼저 꺼내요`;
  return `${name}${iga(name)} 넉넉할 때 써요`;
}

export interface PlanSummary {
  /** 지금 곧 상할 재료 + 이번 주 이미 확정한 끼니에서 쓴 곧 상할 재료 */
  soonTotal: number;
  /** 그중 이번 주 플랜에서 쓰는 수 */
  soonSaved: number;
  /** 한 번에 사야 할 재료 (재고에 없는 것만, 중복 없이) */
  buyAll: string[];
  /** 이번 주 못 쓰는 재료: 플랜이 안 쓰고, 상비로도 안 쓰고, 7일 이내이거나 잊혀지는 중 */
  lost: Item[];
}

export const LOST_WITHIN_DAYS = 7;

export function summarizePlan(result: PlanResult, items: readonly Item[], plan: Plan, today: DateKey): PlanSummary {
  const picked = result.slots.flatMap((s) => (s.recipe ? [s.recipe] : []));
  const used = new Set(picked.flatMap((r) => r.uses));
  const kept = new Set(picked.flatMap((r) => r.keeps));
  const owned = new Set(items.map((i) => i.name));

  const soonNow = items.filter((i) => stateOf(i, today) === 'soon');
  const doneSoon = plan.doneMeals.reduce((a, d) => a + d.soonUsed.length, 0);

  return {
    soonTotal: soonNow.length + doneSoon,
    soonSaved: soonNow.filter((i) => used.has(i.name)).length + doneSoon,
    buyAll: [...new Set(picked.flatMap((r) => r.buy))].filter((n) => !owned.has(n)),
    lost: result.leftover
      .map((e) => e.item)
      .filter(
        (i) => !kept.has(i.name) && (daysLeft(i, today) <= LOST_WITHIN_DAYS || stateOf(i, today) === 'buried'),
      ),
  };
}

/** 소분 품목 수량 표시: '소분 3봉' */
export const portionQty = (count: number, unit = '개') => `소분 ${count}${unit}`;
