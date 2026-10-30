// 주간 소진 플랜 (FR-20~28). AI 없이 규칙으로 만든다.
//
// - 끼니 N개, 하루에 한 끼. 날짜는 두 단계로 정한다 (2026-10-30, 수정명세 v2 A-4)
//   1) 급한 재료 먼저: 얼른 먹어야 할 재료(오늘 내일 해요)를 쓰는 후보가 있는 동안, 오늘부터 하루씩 채운다
//   2) 남은 끼니는 남은 날에 고르게: 날짜 = 시작일 + floor(j*남은날/남은끼니)
//   (오늘 이미 먹은 끼니가 있으면 내일부터. 급한 재료가 없으면 예전과 같이 floor(i*7/N))
// - 영상에서 넣은 고정 끼니(plan.pinned)는 급한 재료를 밀어내지 않는 첫 날에 넣는다 (makePlan 설명, 수정명세 v3 V3-1)
// - 재료는 날짜 순서대로 쓴다: 앞날 끼니의 상비 재료는 뒷날 고정 끼니가 쓰기 전까지 있는 것으로 본다
// - 후보: 필요한 재료(쓰는 것+상비)가 모두 (시뮬레이션) 재고에 있고, 쓰는 재료의 남은 일수 ≥ 그날, 건너뛴 레시피 제외
// - 정렬: 쓰는 재료 중 가장 급한 것(남은 일수 최소) → 얼른 먹어야 할 재료를 많이 쓰는 순(가점)
//   → 급함 점수 합 높은 순. 쓰는 재료가 없는 레시피는 맨 뒤
// - 이번 주에 이미 고른(확정 포함) 레시피는 다른 후보 뒤로 보낸다 (소분 품목이 같은 메뉴만 반복되지 않게)
// - 고른 레시피의 쓰는 재료는 시뮬레이션 재고에서 뺀다 (소분 품목은 한 끼에 1개씩)
// - "바꾸기"는 같은 끼니의 다음 후보로 넘긴다

import { MAX_MEALS_PER_WEEK } from './constants';
import { addDays } from './date';
import { iga } from './josa';
import { daysLeft, daysSinceEntered, stateOf, urgencyOf } from './status';
import type { DateKey, DoneMeal, Item, PinnedMeal, Plan, Recipe } from './types';

export interface PlanSlot {
  /** 끼니 순번 (확정한 끼니 포함, 0부터) */
  index: number;
  /** 오늘부터 며칠 뒤 */
  dayOffset: number;
  date: DateKey;
  recipe: Recipe | null;
  /** 이 끼니의 후보 수 ("바꾸기"는 2개 이상일 때만) */
  candidateCount: number;
  /** 영상에서 넣은 고정 끼니 (바꾸기 없음, 건너뛰기 = 지우기) */
  pinned?: PinnedMeal;
}

export interface PlanResult {
  slots: PlanSlot[];
  /** 플랜이 쓰고 남은 재고 (소분 품목은 남은 개수만큼) */
  leftover: { item: Item; count: number }[];
}

const WEEK_DAYS = 7;

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

/**
 * 오늘 확정한 끼니. 플랜은 "앞으로 7일"(오늘 ~ 6일 뒤)이라, 집밥 횟수에서 빼는 것은 그 안에 든 오늘 끼니뿐이다
 * (수정명세 v3 V3-2. 어제까지 먹은 끼니는 최근 7일 요약에 남는다). 날짜가 없는 예전 확정 기록은 세지 않는다.
 */
export const doneToday = (plan: Plan, today: DateKey): DoneMeal[] => plan.doneMeals.filter((m) => m.date === today);

interface Built extends PlanResult {
  /** 이 플랜이 쓰는 얼른 먹어야 할 재료 이름 (보통 끼니 + 고정 끼니) */
  covered: Set<string>;
}

/**
 * 고정 끼니의 날짜를 정해 둔 채로, 보통 끼니를 날짜 순서대로 짠다.
 * - 고정 끼니가 쓰는 재료는 미리 맡아 둔다 (보통 끼니가 쓰지 않게). 다만 다른 끼니의 상비 재료로는 그날까지 있는 것으로 본다.
 * - 날짜 순서대로 재료를 쓴다: 그날보다 앞선 고정 끼니의 재료를 먼저 빼고 그날 끼니를 고른다.
 */
function build(
  items: readonly Item[],
  recipes: readonly Recipe[],
  plan: Plan,
  today: DateKey,
  done: readonly DoneMeal[],
  pinDays: ReadonlyMap<PinnedMeal, number>,
  regularCount: number,
): Built {
  // 이름 → { 가장 급한 재료, 남은 끼니 수, 고정 끼니가 맡아 둔 수 }
  const sim = new Map<string, { item: Item; count: number; reserved: number }>();
  for (const i of items) {
    const cur = sim.get(i.name);
    if (!cur) sim.set(i.name, { item: i, count: mealsIn(i), reserved: 0 });
    else {
      const urgent = daysLeft(i, today) < daysLeft(cur.item, today) ? i : cur.item;
      sim.set(i.name, { item: urgent, count: cur.count + mealsIn(i), reserved: 0 });
    }
  }
  const pins = [...pinDays].sort((a, b) => a[1] - b[1]);
  for (const [p] of pins) for (const u of p.uses) if (sim.has(u)) sim.get(u)!.reserved += 1;
  /** 보통 끼니가 쓸 수 있음 (고정 끼니 몫 제외) */
  const free = (name: string) => {
    const e = sim.get(name);
    return !!e && e.count - e.reserved > 0;
  };
  /** 상비 재료로 냉장고에 있음 */
  const present = (name: string) => (sim.get(name)?.count ?? 0) > 0;
  const left = (name: string) => daysLeft(sim.get(name)!.item, today);
  const isSoon = (name: string) => stateOf(sim.get(name)!.item, today) === 'soon';

  const picked = new Set([...done.map((m) => m.recipe), ...pins.map(([p]) => p.name)]);

  /** 그날 끼니의 후보 (바꾸기 순서대로) */
  const candidatesFor = (d: number) => {
    const cands: { r: Recipe; minLeft: number; soon: number; score: number }[] = [];
    for (const r of recipes) {
      if (plan.rejectedRecipes.includes(r.name)) continue;
      if (!r.uses.every(free) || !r.keeps.every(present)) continue;
      if (!r.uses.every((u) => left(u) >= d)) continue;
      const minLeft = r.uses.length ? Math.min(...r.uses.map(left)) : Infinity;
      const soon = r.uses.filter(isSoon).length;
      const score = r.uses.reduce((a, u) => a + urgencyOf(sim.get(u)!.item, today), 0);
      cands.push({ r, minLeft, soon, score });
    }
    cands.sort((a, b) => a.minLeft - b.minLeft || b.soon - a.soon || b.score - a.score);
    const withUses = cands.filter((c) => c.r.uses.length);
    return [
      ...withUses.filter((c) => !picked.has(c.r.name)),
      ...withUses.filter((c) => picked.has(c.r.name)),
      ...cands.filter((c) => !c.r.uses.length),
    ];
  };

  const slots: PlanSlot[] = [];
  const used = new Set<number>(pins.map(([, d]) => d)); // 끼니가 놓인 날
  // 오늘 이미 먹은 끼니가 있으면 오늘은 찬 날
  if (done.some((m) => m.date === today)) used.add(0);

  // 끼니 순번: 확정한 끼니 → 고정 끼니(넣은 순서) → 보통 끼니
  const pinIndex = new Map(plan.pinned.map((p, k) => [p, done.length + k]));
  let i = done.length + plan.pinned.length;

  /** 그날보다 앞선(그날 포함 안 함) 고정 끼니의 재료를 쓴다 */
  let nextPin = 0;
  const eatPinsBefore = (d: number) => {
    for (; nextPin < pins.length && pins[nextPin][1] < d; nextPin++) {
      const [p, pd] = pins[nextPin];
      for (const u of p.uses) {
        const e = sim.get(u);
        if (!e) continue;
        e.count -= 1;
        e.reserved -= 1;
      }
      slots.push({ index: pinIndex.get(p)!, dayOffset: pd, date: addDays(today, pd), recipe: p, candidateCount: 1, pinned: p });
    }
  };
  const place = (d: number, list: ReturnType<typeof candidatesFor>) => {
    const pick = list.length ? list[(plan.swapIndex[i] ?? 0) % list.length] : undefined;
    if (pick) {
      picked.add(pick.r.name);
      for (const u of pick.r.uses) sim.get(u)!.count -= 1;
    }
    used.add(d);
    slots.push({ index: i++, dayOffset: d, date: addDays(today, d), recipe: pick?.r ?? null, candidateCount: list.length });
  };
  const freeDays = (from: number) =>
    Array.from({ length: WEEK_DAYS }, (_, d) => d).filter((d) => d >= from && !used.has(d));

  let regular = Math.max(0, regularCount);

  // 1) 급한 재료 먼저: 얼른 먹어야 할 재료를 쓰는 끼니를 가장 빠른 빈 날부터 하루씩
  let day = 0;
  while (regular > 0) {
    const d = freeDays(day)[0];
    if (d === undefined) break;
    eatPinsBefore(d);
    const list = candidatesFor(d);
    if (!list.some((c) => c.soon > 0)) break;
    place(d, list);
    regular--;
    day = d + 1;
  }

  // 2) 남은 끼니는 남은 빈 날에 고르게
  const rest = freeDays(day);
  const count = Math.min(regular, rest.length); // 하루에 한 끼
  for (let j = 0; j < count; j++) {
    const d = rest[Math.floor((j * rest.length) / count)];
    eatPinsBefore(d);
    place(d, candidatesFor(d));
  }
  eatPinsBefore(WEEK_DAYS);
  slots.sort((a, b) => a.dayOffset - b.dayOffset);

  const covered = new Set(
    slots.flatMap((s) => s.recipe?.uses ?? []).filter((u) => {
      const it = findItem(items, u, today);
      return it !== undefined && stateOf(it, today) === 'soon';
    }),
  );
  const leftover = [...sim.values()].filter((e) => e.count > 0).map(({ item, count }) => ({ item, count }));
  return { slots, leftover, covered };
}

export interface FullPlanResult extends PlanResult {
  /** 기준 커버(고정 끼니를 뺀 플랜이 쓰는 급한 재료)를 지키지 못하고 넣은 고정 끼니 */
  forced: PinnedMeal[];
  /** 기준 커버 중 이 플랜이 쓰지 못하는 재료 */
  lost: string[];
}

/**
 * 주간(앞으로 7일) 플랜. 영상에서 넣은 고정 끼니(수정명세 v3 V3-1):
 * 1) 고정 끼니를 빼고 먼저 짜서 쓰는 급한 재료 = 기준 커버
 * 2) 고정 끼니마다 오늘부터 그 재료의 가장 이른 소비기한까지 날짜를 빠른 순서로 시험해서,
 *    기준 커버가 하나도 빠지지 않는 첫 날에 넣는다 (고정 끼니가 직접 쓰는 급한 재료는 커버로 친다)
 * 3) 그런 날이 없으면 빠지는 재료가 가장 적은 날 (집밥 횟수를 늘릴지는 fitPin이 정한다)
 * "그래도 넣을게요"(force)는 조건 없이 가장 빠른 날, "오늘 한 끼로" 넣은 것은 오늘.
 */
export function makePlan(items: readonly Item[], recipes: readonly Recipe[], plan: Plan, today: DateKey): FullPlanResult {
  const n = plan.mealsPerWeek;
  const done = doneToday(plan, today);
  const ateToday = done.length > 0;
  const base = build(items, recipes, plan, today, done, new Map(), n - done.length);
  const regular = n - done.length - plan.pinned.length;
  if (!plan.pinned.length) return { ...base, forced: [], lost: [] };

  const lostOf = (b: Built) => [...base.covered].filter((u) => !b.covered.has(u));
  const deadline = (p: PinnedMeal) => {
    const lefts = p.uses.map((u) => findItem(items, u, today)).filter((it) => it !== undefined).map((it) => daysLeft(it, today));
    return Math.min(WEEK_DAYS - 1, lefts.length ? Math.min(...lefts) : WEEK_DAYS - 1);
  };
  // 오늘 한 끼로 고른 것 먼저, 그다음 넣은 순서
  const order = [...plan.pinned].sort((a, b) => Number(b.date === today) - Number(a.date === today));
  const fixed = new Map<PinnedMeal, number>();
  const forced: PinnedMeal[] = [];
  const taken = () => new Set([...(ateToday ? [0] : []), ...fixed.values()]);

  for (const p of order) {
    const busy = taken();
    const open = Array.from({ length: WEEK_DAYS }, (_, d) => d).filter((d) => !busy.has(d));
    const inTime = p.date === today && !busy.has(0) ? [0] : open.filter((d) => d <= deadline(p));
    const choices = inTime.length ? inTime : open.slice(0, 1);
    if (!choices.length) continue; // 7일이 모두 찼다
    if (p.force) {
      fixed.set(p, choices[0]);
      continue;
    }
    let best: { d: number; lost: number } | undefined;
    for (const d of choices) {
      const lost = lostOf(build(items, recipes, plan, today, done, new Map([...fixed, [p, d]]), regular)).length;
      if (!best || lost < best.lost) best = { d, lost };
      if (lost === 0) break;
    }
    if (best!.lost > 0) forced.push(p);
    fixed.set(p, best!.d);
  }
  const result = build(items, recipes, plan, today, done, fixed, regular);
  return { ...result, forced, lost: lostOf(result) };
}

/** 고정 끼니를 하나 더 넣을 때의 최소 집밥 횟수: 끼니 자리가 없으면 한 자리는 늘린다 (최대 7) */
export const mealsForNewPin = (plan: Plan, today: DateKey) =>
  Math.min(MAX_MEALS_PER_WEEK, Math.max(plan.mealsPerWeek, doneToday(plan, today).length + plan.pinned.length + 1));

/**
 * 영상 메뉴를 고정 끼니로 넣을 수 있는지 (V3-1). 기준 커버를 지키는 날이 없으면 집밥 횟수를 1씩 늘려 본다(최대 7).
 * 넣을 수 있으면 그때의 집밥 횟수, 7번으로도 안 되면 "그래도 넣을게요"를 골랐을 때 못 먹게 되는 재료.
 */
export function fitPin(
  items: readonly Item[],
  recipes: readonly Recipe[],
  plan: Plan,
  pin: PinnedMeal,
  today: DateKey,
): { ok: true; mealsPerWeek: number } | { ok: false; lost: string[] } {
  const start = mealsForNewPin(plan, today);
  for (let m = start; m <= MAX_MEALS_PER_WEEK; m++) {
    const p = { ...plan, mealsPerWeek: m, pinned: [...plan.pinned, pin], swapIndex: m === plan.mealsPerWeek ? plan.swapIndex : {} };
    if (!makePlan(items, recipes, p, today).forced.includes(pin)) return { ok: true, mealsPerWeek: m };
  }
  const forcedPlan = { ...plan, mealsPerWeek: start, pinned: [...plan.pinned, { ...pin, force: true }] };
  return { ok: false, lost: makePlan(items, recipes, forcedPlan, today).lost };
}

/** 레시피 표에서 상비 재료로만 쓰는 재료 (양파·버터·카레가루 …). 영상 메뉴에서도 이 재료는 빼지 않는다. */
export function pantryNames(recipes: readonly Recipe[]): Set<string> {
  const uses = new Set(recipes.flatMap((r) => r.uses));
  return new Set(recipes.flatMap((r) => r.keeps).filter((k) => !uses.has(k)));
}

/** 플랜이 쓰지 못하고 남는 얼른 먹어야 할 재료 이름 (중복 없이, 급한 순) */
export function uncoveredSoon(result: PlanResult, items: readonly Item[], today: DateKey): string[] {
  const used = new Set(result.slots.flatMap((s) => (s.recipe ? s.recipe.uses : [])));
  const soon = items
    .filter((i) => stateOf(i, today) === 'soon' && !used.has(i.name))
    .sort((a, b) => daysLeft(a, today) - daysLeft(b, today));
  return [...new Set(soon.map((i) => i.name))];
}

/**
 * 얼른 먹어야 할 재료를 모두 쓰는 가장 적은 집밥 횟수 (지금 횟수부터 최대 7번까지 실제로 짜 본다).
 * 지금 횟수로 충분하면 그 횟수, 7번으로도 안 되면 null.
 */
export function minMealsToCover(items: readonly Item[], recipes: readonly Recipe[], plan: Plan, today: DateKey): number | null {
  for (let m = plan.mealsPerWeek; m <= MAX_MEALS_PER_WEEK; m++) {
    // 횟수를 바꾸면 바꾸기 기록은 지워지므로(setMeals) 같은 조건으로 짜 본다
    const p = m === plan.mealsPerWeek ? plan : { ...plan, mealsPerWeek: m, swapIndex: {} };
    if (!uncoveredSoon(makePlan(items, recipes, p, today), items, today).length) return m;
  }
  return null;
}

/** 다 못 쓸 때 안내 문구 */
export function coverageText(names: readonly string[], m: number | null): string {
  const head = `얼른 먹어야 할 재료 ${names.length}개(${names.join(', ')})가 남아요.`;
  return m === null ? `${head} 따로 챙겨 드세요.` : `${head} 집밥을 ${m}번으로 늘리면 모두 먹을 수 있어요.`;
}

/** 홈의 오늘의 한 끼 (B-2). 따로 계산하지 않고 플랜의 오늘 끼니(day 0)를 그대로 쓴다. */
export type TodayMeal =
  /** 오늘 확정한 끼니가 있음: "오늘 한 끼 완료 · {메뉴}" */
  | { kind: 'done'; meal: DoneMeal }
  /** 플랜의 오늘 끼니 */
  | { kind: 'suggest'; slot: PlanSlot & { recipe: Recipe } }
  /** 급한 재료가 없고 오늘 끼니가 가볍게 먹는 메뉴 */
  | { kind: 'calm' }
  /** 오늘 끼니가 없거나 만들 수 있는 메뉴가 없음 */
  | { kind: 'none' };

export function todayMeal(result: PlanResult, plan: Plan, items: readonly Item[], today: DateKey): TodayMeal {
  const done = plan.doneMeals.filter((m) => m.date === today).at(-1);
  if (done) return { kind: 'done', meal: done };
  const slot = result.slots.find((s) => s.dayOffset === 0);
  if (!slot?.recipe) return { kind: 'none' };
  if (!slot.recipe.uses.length && !items.some((i) => stateOf(i, today) === 'soon')) return { kind: 'calm' };
  return { kind: 'suggest', slot: slot as PlanSlot & { recipe: Recipe } };
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
  const doneSoon = doneToday(plan, today).reduce((a, d) => a + d.soonUsed.length, 0);

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
