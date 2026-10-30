// 기기 안(localStorage)에 저장. 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서도 앱은 동작해야 한다.
//
// 저장 형식 버전
// - v1 (버전 필드 없음): items, logs, plan, myFoods
// - v2 (2026-10-30): 예시 재료 표시(sample), 기록의 stateAtAction·discardReason, plan.pinned,
//   shoppingList, onboarding, notif
// 예전 버전을 읽으면 migrate()가 새 필드의 기본값을 채워서 옮긴다.

import { canonicalName } from '../data';
import { defaultNotif, type AppState } from './store';
import type { Item, MealLog } from '../rules/types';

export const STORAGE_KEY = 'fridge-planner-v1';
export const STORAGE_VERSION = 2;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** 저장된 값(어느 버전이든) → 지금 버전의 상태. 알아볼 수 없으면 null. */
export function migrate(data: unknown): AppState | null {
  if (!isObj(data) || !Array.isArray(data.items) || !Array.isArray(data.logs) || !isObj(data.plan)) return null;
  const version = typeof data.version === 'number' ? data.version : 1;

  const items = (data.items as Item[]).map((i) => {
    // 예전에 다른 이름(달걀)으로 넣은 재료는 대표 이름(계란)으로 맞춘다.
    const item: Item = { ...i, name: canonicalName(i.name) };
    // v1의 예시 재료(sample- id)는 예시 표시를 붙이고, 직접 고친 게 아니면 근거를 "예시 재료"로
    if (version < 2 && item.id.startsWith('sample-')) {
      item.sample = true;
      if (item.expiryBasis !== 'user') item.expiryBasis = 'sample';
    }
    return item;
  });

  const logs = (data.logs as Partial<MealLog>[]).map(
    (l) =>
      ({
        ...l,
        stateAtAction: l.stateAtAction ?? 'unknown',
        discardReason: l.discardReason ?? null,
      }) as MealLog,
  );

  const plan = data.plan as Partial<AppState['plan']>;
  const onboarding = isObj(data.onboarding) ? (data.onboarding as Partial<AppState['onboarding']>) : undefined;
  return {
    items,
    logs,
    plan: {
      mealsPerWeek: plan.mealsPerWeek ?? 4,
      doneMeals: arr(plan.doneMeals),
      rejectedRecipes: arr(plan.rejectedRecipes),
      swapIndex: isObj(plan.swapIndex) ? (plan.swapIndex as Record<number, number>) : {},
      pinned: arr(plan.pinned),
    },
    myFoods: isObj(data.myFoods) ? (data.myFoods as AppState['myFoods']) : {},
    shoppingList: arr(data.shoppingList),
    // 이미 쓰던 사람에게는 첫 사용 안내를 다시 보여주지 않는다
    onboarding: {
      introSeen: true,
      seen: true,
      mode: items.some((i) => i.sample) ? 'sample' : 'mine',
      sampleAsked: false,
      ...onboarding,
    },
    notif: { ...defaultNotif(), ...(isObj(data.notif) ? data.notif : {}) },
  };
}

export function loadState(storage: Storage | undefined = globalThis.localStorage): AppState | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveState(state: AppState, storage: Storage | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, ...state }));
  } catch {
    // 저장 실패는 무시 (다음 변경 때 다시 시도)
  }
}
