// 앱 상태와 상태를 바꾸는 규칙(리듀서). 화면과 무관한 순수 함수다.
// "오늘"·시각·새 id는 액션에 담아서 넘긴다 (리듀서 안에서 만들지 않음).

import { makeSampleInventory } from '../data/sampleInventory';
import { autoExpiresAt, defaultLocation, shiftExpiry } from '../rules/expiry';
import { findItem, portionQty } from '../rules/plan';
import { stateOf } from '../rules/status';
import { COUNT_MAX, COUNT_MIN } from '../rules/constants';
import type { CatalogEntry, DateKey, Item, Location, MealLog, Plan, Recipe, Remaining } from '../rules/types';

export interface AppState {
  items: Item[];
  logs: MealLog[];
  plan: Plan;
}

export type Action =
  | { type: 'addItems'; items: Item[] }
  | { type: 'shiftExpiry'; id: string; delta: number }
  | { type: 'setRemaining'; id: string; remaining: Remaining }
  | { type: 'finishItem'; id: string; action: MealLog['action']; at: string }
  | { type: 'reset'; today: DateKey }
  // 저장한 뒤에 고치기
  | { type: 'removeItem'; id: string }
  | { type: 'setLocation'; id: string; location: Location }
  | { type: 'shiftCount'; id: string; delta: number }
  // 이번 주 플랜
  | { type: 'setMeals'; mealsPerWeek: number }
  | { type: 'swap'; slotIndex: number }
  | { type: 'skip'; recipe: string }
  | { type: 'clearRejected' }
  | { type: 'confirmMeal'; recipe: Recipe; today: DateKey; at: string }
  | { type: 'undoMeal'; at: string };

export const DEFAULT_MEALS_PER_WEEK = 4;

export function emptyPlan(): Plan {
  return { mealsPerWeek: DEFAULT_MEALS_PER_WEEK, doneMeals: [], rejectedRecipes: [], swapIndex: {} };
}

/** 처음 열었을 때 / 처음 상태로 되돌리기 */
export function initialState(today: DateKey): AppState {
  return { items: makeSampleInventory(today), logs: [], plan: emptyPlan() };
}

/** 직접 추가(FR-07): 사전 항목으로 재료 하나를 만든다. 소비기한은 자동. */
export function newItemFromCatalog(entry: CatalogEntry, today: DateKey, id: string): Item {
  return {
    id,
    name: entry.name,
    qty: entry.defaultQty ?? '1개',
    core: entry.core,
    location: defaultLocation(entry, false),
    enteredAt: today,
    expiresAt: autoExpiresAt(today, entry, false) as DateKey,
    expiryBasis: 'table',
    remaining: '넉넉해요',
    source: 'manual',
    portioned: false,
  };
}

const updateItem = (state: AppState, id: string, fn: (i: Item) => Item): AppState => ({
  ...state,
  items: state.items.map((i) => (i.id === id ? fn(i) : i)),
});

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'addItems':
      return { ...state, items: [...state.items, ...action.items] };
    case 'shiftExpiry':
      return updateItem(state, action.id, (i) => shiftExpiry(i, action.delta));
    case 'setRemaining':
      return updateItem(state, action.id, (i) => ({ ...i, remaining: action.remaining }));
    case 'finishItem': {
      if (!state.items.some((i) => i.id === action.id)) return state;
      return {
        ...state,
        items: state.items.filter((i) => i.id !== action.id),
        logs: [...state.logs, { itemId: action.id, action: action.action, at: action.at }],
      };
    }
    case 'reset':
      return initialState(action.today);
    case 'removeItem':
      // "잘못 넣었어요": 기록 없이 지운다 (버린 것으로 세지 않음)
      return { ...state, items: state.items.filter((i) => i.id !== action.id) };
    case 'setLocation':
      return updateItem(state, action.id, (i) => ({ ...i, location: action.location }));
    case 'shiftCount':
      return updateItem(state, action.id, (i) => {
        if (!i.portioned) return i;
        const count = Math.min(COUNT_MAX, Math.max(COUNT_MIN, (i.count ?? 1) + action.delta));
        return count === i.count ? i : withCount(i, count);
      });
    case 'setMeals':
      return { ...state, plan: { ...state.plan, mealsPerWeek: action.mealsPerWeek, swapIndex: {} } };
    case 'swap': {
      const { swapIndex } = state.plan;
      const next = { ...swapIndex, [action.slotIndex]: (swapIndex[action.slotIndex] ?? 0) + 1 };
      return { ...state, plan: { ...state.plan, swapIndex: next } };
    }
    case 'skip':
      if (state.plan.rejectedRecipes.includes(action.recipe)) return state;
      return {
        ...state,
        plan: { ...state.plan, rejectedRecipes: [...state.plan.rejectedRecipes, action.recipe], swapIndex: {} },
      };
    case 'clearRejected':
      return { ...state, plan: { ...state.plan, rejectedRecipes: [], swapIndex: {} } };
    case 'confirmMeal':
      return confirmMeal(state, action.recipe, action.today, action.at);
    case 'undoMeal':
      return undoMeal(state, action.at);
  }
}

const withCount = (item: Item, count: number): Item => ({ ...item, count, qty: portionQty(count, item.unit) });

/** "이걸로 할게요": 쓰는 재료를 재고에서 뺀다. 소분 품목은 1개만 줄인다. */
function confirmMeal(state: AppState, recipe: Recipe, today: DateKey, at: string): AppState {
  let items = state.items;
  const logs = [...state.logs];
  const usedItems: Item[] = [];
  const soonUsed: string[] = [];
  for (const name of recipe.uses) {
    const it = findItem(items, name, today);
    if (!it) continue;
    usedItems.push(it);
    if (stateOf(it, today) === 'soon') soonUsed.push(name);
    items =
      it.portioned && (it.count ?? 1) > 1
        ? items.map((i) => (i.id === it.id ? withCount(i, (i.count ?? 1) - 1) : i))
        : items.filter((i) => i.id !== it.id);
    logs.push({ itemId: it.id, action: 'eat', at });
  }
  const doneMeals = [...state.plan.doneMeals, { recipe: recipe.name, usedItems, soonUsed, at }];
  return { items, logs, plan: { ...state.plan, doneMeals, swapIndex: {} } };
}

/** 확정 되돌리기(확정 시각으로 찾음): 뺀 재료를 다시 넣고 그때 남긴 기록을 지운다. 이미 되돌렸으면 무시. */
function undoMeal(state: AppState, at: string): AppState {
  const done = state.plan.doneMeals.find((d) => d.at === at);
  if (!done) return state;
  let items = state.items;
  for (const used of done.usedItems) {
    const cur = items.find((i) => i.id === used.id);
    items = cur
      ? items.map((i) => (i.id === used.id ? withCount(i, (i.count ?? 0) + 1) : i))
      : [...items, used];
  }
  const usedIds = new Set(done.usedItems.map((i) => i.id));
  const logs = state.logs.filter((l) => !(l.at === done.at && l.action === 'eat' && usedIds.has(l.itemId)));
  const doneMeals = state.plan.doneMeals.filter((d) => d !== done);
  return { items, logs, plan: { ...state.plan, doneMeals, swapIndex: {} } };
}
