// 앱 상태와 상태를 바꾸는 규칙(리듀서). 화면과 무관한 순수 함수다.
// "오늘"·시각·새 id는 액션에 담아서 넘긴다 (리듀서 안에서 만들지 않음).

import { SUBSTITUTES, findKind } from '../data';
import { boughtAs } from '../rules/shopping';
import { makeSampleInventory } from '../data/sampleInventory';
import { addDays } from '../rules/date';
import { autoExpiresAt, defaultLocation, shiftExpiry } from '../rules/expiry';
import { findItem, portionQty } from '../rules/plan';
import { mostUrgentSoon, stateOf } from '../rules/status';
import { COUNT_MAX, COUNT_MIN, MAX_MEALS_PER_WEEK } from '../rules/constants';
import { rememberItems, type MyFoods } from './myFoods';
import type {
  CatalogEntry,
  DateKey,
  Item,
  Location,
  MealLog,
  NotifSettings,
  Onboarding,
  Opens,
  PinnedMeal,
  Plan,
  Recipe,
  Remaining,
  ShoppingItem,
} from '../rules/types';

export interface AppState {
  items: Item[];
  logs: MealLog[];
  plan: Plan;
  /** 사전에 없는 재료를 넣을 때 정한 값 (다음에 자동으로 채운다) */
  myFoods: MyFoods;
  /** 장보기 목록 (플랜·영상 확인에서 담은 사야 할 재료) */
  shoppingList: ShoppingItem[];
  onboarding: Onboarding;
  notif: NotifSettings;
  opens: Opens;
}

export type Action =
  | { type: 'addItems'; items: Item[] }
  | { type: 'shiftExpiry'; id: string; delta: number }
  | { type: 'setRemaining'; id: string; remaining: Remaining }
  | { type: 'finishItem'; id: string; action: MealLog['action']; today: DateKey; at: string }
  /** 버렸어요 다음에 고른 이유 (B-4). 기록은 재료 id + 시각으로 찾는다 */
  | { type: 'setDiscardReason'; itemId: string; at: string; reason: string }
  | { type: 'reset'; today: DateKey }
  /** 냉장고 비우기: 예시 재료를 지우고 내 재료로 처음부터 채울 때. 지난번 값(myFoods)과 집밥 횟수는 남긴다. */
  | { type: 'clearAll' }
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
  | { type: 'undoMeal'; at: string }
  // 영상 확인 → 플랜·장보기 목록 (B-1)
  /**
   * 영상 메뉴를 고정 끼니로 넣는다. 사야 할 재료는 장보기 목록에.
   * 집밥 횟수는 fitPin으로 정한 값 (급한 재료를 밀어내지 않게 늘린 횟수)
   */
  | { type: 'pinMeal'; meal: PinnedMeal; mealsPerWeek: number }
  /** 집밥을 늘려 넣은 영상 메뉴 되돌리기: 고정 끼니를 빼고 집밥 횟수·장보기 목록을 넣기 전으로 */
  | { type: 'undoPin'; id: string; mealsPerWeek: number; shoppingList: ShoppingItem[] }
  /** 고정 끼니 건너뛰기 = 영상 메뉴 지우기 */
  | { type: 'removePinned'; id: string }
  /** 장보기 목록 체크 (플랜에서 온 재료면 저장해 둔다) */
  | { type: 'toggleShopping'; name: string }
  /** 장보기 목록 ✕ */
  | { type: 'removeShopping'; name: string }
  // 첫 사용 안내
  /** 오프닝 화면의 시작하기 */
  | { type: 'finishIntro' }
  /** 안내 카드: 내 재료로 시작할게요(mine, 예시 재료를 지움) / 예시로 둘러볼게요(sample) */
  | { type: 'onboard'; mode: Onboarding['mode'] }
  /** "예시 재료는 지울까요?": 지우기(remove) / 놔둘게요 */
  | { type: 'answerSamplePrompt'; remove: boolean }
  // 알림 A단계 (B-3)
  /** "알려드릴까요?" 카드: 홈 화면에 추가하고 알림 받기(install) / 나중에(later, 다시 묻지 않음) */
  | { type: 'answerNotifAsk'; choice: 'install' | 'later'; at: string }
  /** 앱을 열었다 (하루에 한 번만 센다) */
  | { type: 'appOpened'; today: DateKey }
  /** 인앱 배너 닫기 (그날은 다시 안 보여줌) */
  | { type: 'closeBanner'; today: DateKey }
  /** 알림 시간 'HH:MM' (A단계는 저장만, B단계에서 씀) */
  | { type: 'setNotifTime'; time: string };

export const DEFAULT_MEALS_PER_WEEK = 4;

export function emptyPlan(): Plan {
  return { mealsPerWeek: DEFAULT_MEALS_PER_WEEK, doneMeals: [], rejectedRecipes: [], swapIndex: {}, pinned: [] };
}

export const DEFAULT_NOTIF_TIME = '18:00';

export function defaultNotif(): NotifSettings {
  return { askedAt: null, optedLater: false, time: DEFAULT_NOTIF_TIME, bannerClosedOn: null };
}

/** 처음 열었을 때 / 처음 상태로 되돌리기 */
export function initialState(today: DateKey): AppState {
  return {
    items: makeSampleInventory(today),
    logs: [],
    plan: emptyPlan(),
    myFoods: {},
    shoppingList: [],
    onboarding: { introSeen: false, seen: false, mode: 'sample', sampleAsked: false, firstConfirmAt: null },
    notif: defaultNotif(),
    opens: { count: 0, lastDate: null },
  };
}

/** 기록 한 줄. 기록할 때 재료 상태를 같이 남긴다 (이번 주 요약용) */
const logOf = (item: Item, action: MealLog['action'], today: DateKey, at: string): MealLog => ({
  itemId: item.id,
  name: item.name,
  action,
  at,
  stateAtAction: stateOf(item, today),
  discardReason: null,
});

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
    expiryBasis: entry.mine ? 'mine' : 'table',
    ...(entry.mine ? { group: entry.group } : {}),
    remaining: '넉넉해요',
    source: 'manual',
    portioned: false,
  };
}

/** 재료 추가 화면에서 고른 것: 사전(또는 지난번 값) 이름, 또는 목록에 없어서 직접 적은 이름 + 그 분류의 종류 */
export interface AddPick {
  name: string;
  /** 직접 적은 재료면 분류의 종류 id (종류별 기본 기간표로 소비기한) */
  customKind?: string;
}

/** 고른 것 → 재고. 사전·지난번 값에 있으면 그 값, 없으면 분류의 종류 기본 기간. 둘 다 없으면 undefined. */
export function newItemFromPick(
  pick: AddPick,
  today: DateKey,
  id: string,
  lookup: (name: string) => CatalogEntry | undefined,
): Item | undefined {
  const entry = lookup(pick.name);
  if (entry) return newItemFromCatalog(entry, today, id);
  const name = pick.name.trim();
  // "면·곡물·빵" 분류에서 직접 적은 떡(가래떡 등)은 빵이 아니라 떡 종류(냉장)로
  const kind = findKind(pick.customKind === 'bread' && name.includes('떡') ? 'riceCake' : pick.customKind);
  if (!kind || !name) return undefined;
  return {
    id,
    name,
    qty: '1개',
    core: '',
    location: kind.location,
    enteredAt: today,
    expiresAt: addDays(today, kind.days),
    expiryBasis: 'kind',
    group: kind.group,
    remaining: '넉넉해요',
    source: 'manual',
    portioned: false,
  };
}

/** 처음 열었을 때 오프닝 화면을 보여줄지 */
export const showIntro = (state: AppState) => !state.onboarding.introSeen;

/** 첫 방문 안내 카드를 보여줄지 (오프닝 다음) */
export const showOnboarding = (state: AppState) => !state.onboarding.seen;

/** "예시 재료는 지울까요?": 안내 카드를 고른 뒤, 예시 재료와 내 재료가 같이 있을 때 한 번만 */
export const showSamplePrompt = (state: AppState) =>
  state.onboarding.seen &&
  !state.onboarding.sampleAsked &&
  state.items.some((i) => i.sample) &&
  state.items.some((i) => !i.sample);

/** 홈 화면 추가 카드를 보여주는 때: 앱을 연 날이 이만큼 되면 (V3-5) */
export const NOTIF_ASK_OPEN_DAYS = 3;

/**
 * "홈 화면에 추가해 두면 더 빨리 열 수 있어요" (V3-5): 처음으로 "이걸로 할게요"를 누른 뒤,
 * 또는 앱을 서로 다른 날 세 번째 열었을 때 중 먼저 오는 때 한 번만. 첫 사용 안내 카드와 같이 나오지 않는다.
 * 이미 물어봤거나 나중에를 골랐으면 다시 묻지 않는다.
 */
export const showNotifAsk = (state: AppState) =>
  state.onboarding.seen &&
  state.notif.askedAt === null &&
  !state.notif.optedLater &&
  (state.onboarding.firstConfirmAt !== null || state.opens.count >= NOTIF_ASK_OPEN_DAYS);

/**
 * 홈 위 인앱 배너가 짚을 가장 급한 재료 (V3-4). 없으면 배너를 숨긴다.
 * 오늘 닫았으면 없음, 첫 사용 안내·홈 화면 추가 카드가 떠 있을 때도 없음 (카드가 겹치지 않게).
 */
export function soonBanner(state: AppState, today: DateKey): Item | undefined {
  if (!state.onboarding.seen || showNotifAsk(state) || state.notif.bannerClosedOn === today) return undefined;
  return mostUrgentSoon(state.items, today);
}

/** 예시 재료만 지운다 (재고가 바뀌었으니 이번 주 추천은 첫 후보부터) */
const withoutSamples = (state: AppState): AppState => ({
  ...state,
  items: state.items.filter((i) => !i.sample),
  plan: { ...state.plan, swapIndex: {} },
});

const updateItem = (state: AppState, id: string, fn: (i: Item) => Item): AppState => ({
  ...state,
  items: state.items.map((i) => (i.id === id ? fn(i) : i)),
});

/** 고친 재료가 사전에 없는 재료면 고친 값을 기억한다 (다음에 같은 재료를 넣을 때 씀) */
const updateAndRemember = (state: AppState, id: string, fn: (i: Item) => Item): AppState => {
  const next = updateItem(state, id, fn);
  const item = next.items.find((i) => i.id === id);
  return item ? { ...next, myFoods: rememberItems(next.myFoods, [item]) } : next;
};

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'addItems': {
      // 재고가 바뀌면 이번 주 추천을 첫 후보부터 다시 (프로토타입과 같음).
      // 산 재료는 장보기 목록에서 뺀다 (이름이 같거나 대체 묶음이 같으면, V3-7-1)
      const bought = (name: string) => action.items.some((i) => boughtAs(name, i.name, SUBSTITUTES));
      return {
        ...state,
        items: [...state.items, ...action.items],
        plan: { ...state.plan, swapIndex: {} },
        myFoods: rememberItems(state.myFoods, action.items),
        shoppingList: state.shoppingList.filter((s) => !bought(s.name)),
      };
    }
    case 'shiftExpiry':
      return updateAndRemember(state, action.id, (i) => shiftExpiry(i, action.delta));
    case 'setRemaining':
      return updateItem(state, action.id, (i) => ({ ...i, remaining: action.remaining }));
    case 'finishItem': {
      const item = state.items.find((i) => i.id === action.id);
      if (!item) return state;
      return {
        ...state,
        items: state.items.filter((i) => i.id !== action.id),
        logs: [...state.logs, logOf(item, action.action, action.today, action.at)],
      };
    }
    case 'setDiscardReason': {
      const log = state.logs.find((l) => l.itemId === action.itemId && l.at === action.at && l.action === 'discard');
      if (!log) return state;
      return { ...state, logs: state.logs.map((l) => (l === log ? { ...l, discardReason: action.reason } : l)) };
    }
    case 'reset':
      // 첫 사용 안내·알림 설정은 다시 묻지 않는다
      return { ...initialState(action.today), onboarding: state.onboarding, notif: state.notif };
    case 'clearAll':
      return { ...state, items: [], logs: [], plan: { ...emptyPlan(), mealsPerWeek: state.plan.mealsPerWeek } };
    case 'removeItem':
      // "잘못 넣었어요": 기록 없이 지운다 (버린 것으로 세지 않음)
      return { ...state, items: state.items.filter((i) => i.id !== action.id) };
    case 'setLocation':
      return updateAndRemember(state, action.id, (i) => ({ ...i, location: action.location }));
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
    case 'pinMeal': {
      const { plan } = state;
      const mealsPerWeek = Math.min(MAX_MEALS_PER_WEEK, action.mealsPerWeek);
      const listed = new Set(state.shoppingList.map((s) => s.name));
      const newBuy = action.meal.buy.filter((n) => !listed.has(n));
      return {
        ...state,
        plan: { ...plan, mealsPerWeek, pinned: [...plan.pinned, action.meal], swapIndex: {} },
        // 이미 목록에 있던 재료(지웠던 플랜 재료 포함)는 영상 재료로 다시 보이게
        shoppingList: [
          ...state.shoppingList.map((s) =>
            action.meal.buy.includes(s.name) ? { name: s.name, from: 'video' as const, checked: s.checked } : s,
          ),
          ...newBuy.map((name) => ({ name, from: 'video' as const, checked: false })),
        ],
      };
    }
    case 'undoPin':
      return {
        ...state,
        plan: {
          ...state.plan,
          pinned: state.plan.pinned.filter((p) => p.id !== action.id),
          mealsPerWeek: action.mealsPerWeek,
          swapIndex: {},
        },
        shoppingList: action.shoppingList,
      };
    case 'removePinned':
      return {
        ...state,
        plan: { ...state.plan, pinned: state.plan.pinned.filter((p) => p.id !== action.id), swapIndex: {} },
      };
    case 'toggleShopping': {
      const cur = state.shoppingList.find((s) => s.name === action.name);
      return {
        ...state,
        shoppingList: cur
          ? state.shoppingList.map((s) => (s === cur ? { ...s, checked: !s.checked } : s))
          : [...state.shoppingList, { name: action.name, from: 'plan', checked: true }],
      };
    }
    case 'removeShopping': {
      const cur = state.shoppingList.find((s) => s.name === action.name);
      // 영상에서 담은 재료는 지우고, 플랜에서 온 재료는 다시 나오지 않게 숨김 표시
      if (cur?.from === 'video') return { ...state, shoppingList: state.shoppingList.filter((s) => s !== cur) };
      const hidden = { name: action.name, from: 'plan' as const, checked: false, removed: true };
      return {
        ...state,
        shoppingList: cur ? state.shoppingList.map((s) => (s === cur ? hidden : s)) : [...state.shoppingList, hidden],
      };
    }
    case 'answerNotifAsk':
      return { ...state, notif: { ...state.notif, askedAt: action.at, optedLater: action.choice === 'later' } };
    case 'appOpened':
      if (state.opens.lastDate === action.today) return state;
      return { ...state, opens: { count: state.opens.count + 1, lastDate: action.today } };
    case 'closeBanner':
      return { ...state, notif: { ...state.notif, bannerClosedOn: action.today } };
    case 'setNotifTime':
      return { ...state, notif: { ...state.notif, time: action.time } };
    case 'finishIntro':
      return { ...state, onboarding: { ...state.onboarding, introSeen: true } };
    case 'onboard': {
      const next = action.mode === 'mine' ? withoutSamples(state) : state;
      return { ...next, onboarding: { ...state.onboarding, seen: true, mode: action.mode } };
    }
    case 'answerSamplePrompt': {
      const next = action.remove ? withoutSamples(state) : state;
      return { ...next, onboarding: { ...state.onboarding, sampleAsked: true } };
    }
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
    logs.push(logOf(it, 'eat', today, at));
  }
  // 영상에서 넣은 고정 끼니를 확정하면 고정 끼니에서 빼고, 되돌릴 수 있게 같이 기록한다
  const pinned = state.plan.pinned.find((p) => p.id === (recipe as Partial<PinnedMeal>).id);
  const doneMeals = [
    ...state.plan.doneMeals,
    { recipe: recipe.name, usedItems, soonUsed, at, date: today, ...(pinned ? { pinned } : {}) },
  ];
  const pins = pinned ? state.plan.pinned.filter((p) => p !== pinned) : state.plan.pinned;
  // 처음 확정한 시각 (홈 화면 추가 카드를 보여줄 때, V3-5)
  const onboarding = state.onboarding.firstConfirmAt ? state.onboarding : { ...state.onboarding, firstConfirmAt: at };
  return { ...state, items, logs, onboarding, plan: { ...state.plan, doneMeals, pinned: pins, swapIndex: {} } };
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
  const pinned = done.pinned ? [...state.plan.pinned, done.pinned] : state.plan.pinned;
  return { ...state, items, logs, plan: { ...state.plan, doneMeals, pinned, swapIndex: {} } };
}
