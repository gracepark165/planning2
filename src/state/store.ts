// 앱 상태와 상태를 바꾸는 규칙(리듀서). 화면과 무관한 순수 함수다.
// "오늘"·시각·새 id는 액션에 담아서 넘긴다 (리듀서 안에서 만들지 않음).

import { makeSampleInventory } from '../data/sampleInventory';
import { autoExpiresAt, defaultLocation, shiftExpiry } from '../rules/expiry';
import type { CatalogEntry, DateKey, Item, MealLog, Plan, Remaining } from '../rules/types';

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
  | { type: 'reset'; today: DateKey };

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
  }
}
