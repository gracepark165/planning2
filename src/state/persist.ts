// 기기 안(localStorage)에 저장. 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서도 앱은 동작해야 한다.

import { canonicalName } from '../data';
import type { AppState } from './store';

export const STORAGE_KEY = 'fridge-planner-v1';

export function loadState(storage: Storage | undefined = globalThis.localStorage): AppState | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.items) || !Array.isArray(data.logs) || !data.plan) return null;
    const state = data as AppState;
    // 예전에 다른 이름(달걀)으로 넣은 재료는 대표 이름(계란)으로 맞춘다
    return { ...state, items: state.items.map((i) => ({ ...i, name: canonicalName(i.name) })) };
  } catch {
    return null;
  }
}

export function saveState(state: AppState, storage: Storage | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 저장 실패는 무시 (다음 변경 때 다시 시도)
  }
}
