// AI 메뉴 제안 (수정명세 v4 V4-1b): 규칙 플랜이 못 채운 칸만 AI에게 맡기고, AI가 낸 메뉴는 그대로 믿지 않고 여기서 다시 검사한다.
// 화면과 무관한 순수 함수. AI 호출은 앱(src/state/aiMenu.ts)이 하고, 테스트는 가짜 응답으로 한다.
//
// 언제 맡기나: 빈 칸("제안할 메뉴가 없어요")이 있거나, 앞으로 7일 안에 끝나는데 어떤 끼니에도 안 들어간 재료가 있을 때.
// 검사 (명세 순서):
//  1. 형식이 다르면 실패 (서버가 한 번 다시 부르고, 그래도 다르면 이 함수에서 모든 칸 실패)
//  2. uses·keeps 이름이 재고에 없으면: 같은 재료(다른 이름)나 대체 묶음이면 재고 이름으로, 아니면 buy로
//  3. 기본 양념은 어디에 있든 지운다
//  4. uses 재료의 남은 일수가 그 칸 날짜보다 짧으면 버린다
//  5. 다른 칸·기존 플랜과 이름이 같으면 버린다 (띄어쓰기는 무시)
//  6. 검사 뒤 uses가 비면 버린다
//  + 규칙 플랜이 쓰고 남은 양보다 많이 쓰면(두부 1모를 두 칸에서) 뒤 칸은 버린다

import type { MenuAiItem, MenuRequest } from '../../api/read';
import { canonicalName } from '../data';
import { BASIC_SEASONINGS } from './constants';
import { daysBetween } from './date';
import { LOST_WITHIN_DAYS, doneToday, findItem, type PlanResult, type PlanSlot } from './plan';
import { portionOf } from './portion';
import { daysLeft, stateOf } from './status';
import type { DateKey, Item, Plan, SubstituteTable } from './types';
import { groupOf } from './videoCheck';

export type { MenuAiItem } from '../../api/read';

export interface MenuTargets {
  /** AI에게 맡길 칸 */
  slots: PlanSlot[];
  /** 먼저 써 달라고 할 재료 (앞으로 7일 안에 끝나는데 어떤 끼니에도 안 들어간 것, 급한 순) */
  mustUseFirst: string[];
}

const nameKey = (n: string) => n.replace(/\s+/g, '');

/** AI에게 맡길 칸. 맡길 게 없거나(다 채워졌고 못 쓰는 재료도 없음) 남은 재고가 없으면 null */
export function menuTargets(result: PlanResult, items: readonly Item[], today: DateKey): MenuTargets | null {
  if (!result.leftover.some((e) => e.count > 0)) return null;
  const inMeals = new Set(result.slots.flatMap((s) => (s.recipe ? [...s.recipe.uses, ...s.recipe.keeps] : [])));
  const left = new Set(result.leftover.filter((e) => e.count > 0).map((e) => e.item.name));
  const lost = items
    .filter((i) => left.has(i.name) && !inMeals.has(i.name))
    .filter((i) => daysLeft(i, today) >= 0 && daysLeft(i, today) <= LOST_WITHIN_DAYS)
    .sort((a, b) => daysLeft(a, today) - daysLeft(b, today));
  const mustUseFirst = [...new Set(lost.map((i) => i.name))];

  const empty = result.slots.filter((s) => !s.recipe && !s.pinned);
  // 빈 칸이 없는데 못 쓰는 재료가 있으면, 재고를 안 쓰는 가벼운 끼니(계란말이 한 끼 등) 칸을 맡긴다
  const light = result.slots.filter((s) => s.recipe && !s.pinned && !s.recipe.uses.length);
  const slots = empty.length ? empty : mustUseFirst.length ? light : [];
  if (!slots.length || (!empty.length && !mustUseFirst.length)) return null;
  return { slots, mustUseFirst };
}

/** /api/menu 요청: 재료 이름·수량·상태·남은 일수·쓰는 방식뿐 (사용자 식별 정보 없음) */
export function buildMenuRequest(
  targets: MenuTargets,
  result: PlanResult,
  plan: Plan,
  today: DateKey,
  extraExclude: readonly string[] = [],
): MenuRequest {
  const stock = result.leftover
    .filter((e) => e.count > 0)
    .map(({ item, count }) => {
      const portion = portionOf(item);
      return {
        name: item.name,
        qty: portion === 'pieces' ? `소분 ${count}${item.unit ?? '개'}` : item.qty,
        daysLeft: daysLeft(item, today),
        state: stateOf(item, today),
        portion,
        ...(portion === 'level' ? { level: item.remaining } : {}),
      };
    });
  const excludeMenus = [
    ...new Set([
      ...result.slots.flatMap((s) => (s.recipe && !targets.slots.includes(s) ? [s.recipe.name] : [])),
      ...doneToday(plan, today).map((d) => d.recipe),
      ...plan.rejectedRecipes,
      ...extraExclude,
    ]),
  ];
  return {
    today,
    slots: targets.slots.map((s) => ({ index: s.index, date: s.date })),
    stock,
    mustUseFirst: targets.mustUseFirst,
    excludeMenus,
    basicSeasonings: [...BASIC_SEASONINGS],
  };
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const strList = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.map((x) => str(x, 40)).filter(Boolean))] : [];

/** AI가 낸 메뉴를 검사한다. 통과한 메뉴(칸 번호 → 메뉴)와 실패한 칸 */
export function checkMenus(
  raw: unknown,
  req: MenuRequest,
  result: PlanResult,
  items: readonly Item[],
  table: SubstituteTable,
): { accepted: Map<number, MenuAiItem>; failed: number[] } {
  const accepted = new Map<number, MenuAiItem>();
  const menus = raw && typeof raw === 'object' && Array.isArray((raw as { menus?: unknown }).menus) ? (raw as { menus: unknown[] }).menus : [];
  const stockNames = req.stock.map((s) => s.name);
  const seasonings = new Set(req.basicSeasonings.map(canonicalName));
  const taken = new Set(req.excludeMenus.map(nameKey));
  const slotDay = new Map(req.slots.map((s) => [s.index, daysBetween(req.today, s.date)]));
  // 규칙 플랜이 쓰고 남은 양 (몇 끼 더 쓸 수 있는지)
  const avail = new Map(result.leftover.map((e) => [e.item.name, e.count]));
  const never = (a: string, b: string) => table.neverSuggest.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

  /** 재고 이름으로 맞추기: 같은 재료(다른 이름 포함) → 같은 대체 묶음 → 없음 */
  const toStock = (n: string): string | undefined => {
    const c = canonicalName(n);
    if (stockNames.includes(c)) return c;
    const g = groupOf(c, table);
    return g ? stockNames.find((s) => g.members.includes(s) && !never(c, s)) : undefined;
  };

  for (const m of menus) {
    if (!m || typeof m !== 'object') continue;
    const x = m as Record<string, unknown>;
    const idx = x.slotIndex;
    if (typeof idx !== 'number' || !slotDay.has(idx) || accepted.has(idx)) continue;
    const name = str(x.name, 40);
    if (!name || taken.has(nameKey(name))) continue;

    const uses: string[] = [];
    const keeps: string[] = [];
    const buy: string[] = [];
    const add = (list: string[], n: string) => !list.includes(n) && list.push(n);
    const sort = (n: string, into: string[]) => {
      if (seasonings.has(canonicalName(n))) return;
      const s = toStock(n);
      if (s) {
        if (!uses.includes(s)) add(into, s);
      } else add(buy, canonicalName(n));
    };
    for (const n of strList(x.uses)) sort(n, uses);
    for (const n of strList(x.keeps)) sort(n, keeps);
    for (const n of strList(x.buy)) if (!seasonings.has(canonicalName(n)) && !toStock(n)) add(buy, canonicalName(n));

    if (!uses.length) continue;
    const day = slotDay.get(idx)!;
    if (uses.some((u) => daysLeft(findItem(items, u, req.today)!, req.today) < day)) continue;
    if (uses.some((u) => (avail.get(u) ?? 0) <= 0)) continue;
    for (const u of uses) avail.set(u, avail.get(u)! - 1);

    taken.add(nameKey(name));
    accepted.set(idx, { slotIndex: idx, name, uses, keeps, buy, howto: str(x.howto, 60) });
  }
  return { accepted, failed: req.slots.map((s) => s.index).filter((i) => !accepted.has(i)) };
}

/** AI 칸이 들어간 플랜 칸 (PlanSlot.ai) */
export type AiSlot = PlanSlot;

/** 검사한 AI 메뉴를 플랜 칸에 넣는다. AI 메뉴가 쓴 만큼 남은 재고에서도 뺀다 ("이번에 못 쓰는 재료"에 남지 않게) */
export function withAiMenus<T extends PlanResult>(result: T, accepted: ReadonlyMap<number, MenuAiItem>): T & { slots: AiSlot[] } {
  const used = new Map<string, number>();
  for (const [index, m] of accepted) {
    if (result.slots.find((s) => s.index === index)?.pinned) continue;
    for (const u of m.uses) used.set(u, (used.get(u) ?? 0) + 1);
  }
  return {
    ...result,
    leftover: result.leftover
      .map((e) => ({ ...e, count: e.count - (used.get(e.item.name) ?? 0) }))
      .filter((e) => e.count > 0),
    slots: result.slots.map((s): AiSlot => {
      const m = accepted.get(s.index);
      if (!m || s.pinned) return s;
      return {
        ...s,
        recipe: { name: m.name, uses: m.uses, keeps: m.keeps, buy: m.buy },
        candidateCount: 2, // 바꾸기 = 그 칸만 다시 요청
        ai: { howto: m.howto },
      };
    }),
  };
}
