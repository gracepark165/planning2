// 냉장고 홈 목록 묶기 (2026-11-09, 사용자 요청)
// - 이름이 같은 재료(산 날·유통기한이 다른 것)는 한 줄로 접는다
// - 싱싱해요 구역은 큰 분류(육류·채소 …)로 묶고, 분류 옆에는 그 안에서 가장 임박한 날짜를 보여준다
import type { DateKey, Item } from './types';
import { daysLeft } from './status';

type Named = { name?: string };

/** 목록에서 바로 이어진 같은 이름 재료를 한 묶음으로 (groupForHome이 같은 이름을 붙여 놓은 순서 그대로) */
export function clusterSameName<T extends Named>(list: readonly T[]): T[][] {
  const out: T[][] = [];
  for (const i of list) {
    const last = out[out.length - 1];
    if (last && i.name !== undefined && last[0].name === i.name) last.push(i);
    else out.push([i]);
  }
  return out;
}

export interface CategoryGroup<T> {
  id: string;
  /** 분류 안 재료 (넘겨받은 목록 순서 = 유통기한이 가까운 순) */
  items: T[];
  /** 분류 안에서 가장 임박한 재료의 남은 일수 */
  nearestLeft: number;
}

/**
 * 큰 분류로 묶는다. 분류 안은 넘겨받은 목록 순서를 지키고,
 * 분류끼리는 가장 임박한 재료가 빠른 순서, 같으면 order(재료 추가 화면의 분류 순서) 순서.
 */
export function groupByCategory<T extends Pick<Item, 'enteredAt' | 'expiresAt'>>(
  list: readonly T[],
  today: DateKey,
  categoryOf: (item: T) => string,
  order: readonly string[],
): CategoryGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const i of list) {
    const id = categoryOf(i);
    const arr = map.get(id);
    if (arr) arr.push(i);
    else map.set(id, [i]);
  }
  const rank = (id: string) => {
    const k = order.indexOf(id);
    return k < 0 ? order.length : k;
  };
  return [...map.entries()]
    .map(([id, items]) => ({ id, items, nearestLeft: Math.min(...items.map((i) => daysLeft(i, today))) }))
    .sort((a, b) => a.nearestLeft - b.nearestLeft || rank(a.id) - rank(b.id));
}
