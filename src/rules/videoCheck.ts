// 영상 확인(FR-29/30): 영상 속 재료가 냉장고에 있는지, 없으면 대체할 재료가 있는지 (CLAUDE.md 10장)
//
// 1. 같은 묶음 안에서만 대체를 제안한다.
// 2. 후보가 여럿이면 곧 상할 → 묻힘 후보 → 남은 일수 순으로 먼저 제안한다.
// 3. 필요한 양은 비교하지 않는다. 기본 양념은 확인에서 뺀다.
// 4. "제안하지 않는 쌍"은 대체로 보지 않는다.

import { iga, ro } from './josa';
import { findItem } from './plan';
import { HOME_SECTION_ORDER, daysLeft, stateOf } from './status';
import type { DateKey, Item, SubstituteGroup, SubstituteTable } from './types';

export type VideoRow =
  | { name: string; kind: 'have'; item: Item }
  | { name: string; kind: 'sub'; sub: Item; candidateCount: number; group: SubstituteGroup }
  | { name: string; kind: 'none' };

/** 재료가 속한 대체 묶음 */
export function groupOf(name: string, table: SubstituteTable): SubstituteGroup | undefined {
  return table.groups.find((g) => g.members.includes(name));
}

const isNeverPair = (a: string, b: string, table: SubstituteTable) =>
  table.neverSuggest.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/** 급한 순서: 곧 상할 → 묻힘 후보 → 정상, 같으면 남은 일수가 적은 순 */
const byUrgency = (today: DateKey) => (a: Item, b: Item) =>
  HOME_SECTION_ORDER.indexOf(stateOf(a, today)) - HOME_SECTION_ORDER.indexOf(stateOf(b, today)) ||
  daysLeft(a, today) - daysLeft(b, today);

/** 대체 후보 (급한 순). 같은 묶음 안에서, 이름이 다른 재료만. */
export function substitutesFor(name: string, items: readonly Item[], today: DateKey, table: SubstituteTable): Item[] {
  const group = groupOf(name, table);
  if (!group) return [];
  return items
    .filter((i) => i.name !== name && group.members.includes(i.name) && !isNeverPair(name, i.name, table))
    .sort(byUrgency(today));
}

export function checkIngredients(
  names: readonly string[],
  items: readonly Item[],
  today: DateKey,
  table: SubstituteTable,
): VideoRow[] {
  return names
    .filter((n) => !table.basicSeasonings.includes(n))
    .map((name): VideoRow => {
      const item = findItem(items, name, today);
      if (item) return { name, kind: 'have', item };
      const cands = substitutesFor(name, items, today, table);
      if (cands.length) return { name, kind: 'sub', sub: cands[0], candidateCount: cands.length, group: groupOf(name, table)! };
      return { name, kind: 'none' };
    });
}

/** 제안 문구: "닭다리살 말고 닭안심으로 대체하는 건 어때요?" */
export const subQuestion = (want: string, sub: string) => `${want} 말고 ${sub}${ro(sub)} 대체하는 건 어때요?`;

/** 제안 근거 문구 */
export function subReason(row: Extract<VideoRow, { kind: 'sub' }>, today: DateKey): string {
  const st = stateOf(row.sub, today);
  const n = row.sub.name;
  const base =
    st === 'soon'
      ? `냉장고에 ${n}${iga(n)} 있는데, 지금 가장 급한 재료예요`
      : st === 'buried'
        ? `냉장고에 ${n}${iga(n)} 오래 숨어 있었어요`
        : `냉장고에 ${n}${iga(n)} 있어요`;
  return row.candidateCount > 1 ? `${base} · 같은 종류 중 소비기한이 더 가까운 걸 골랐어요` : base;
}

/** 직접 입력(FR-30): 쉼표·줄바꿈으로 나누고 기본 양념은 따로 뺀다 */
export function splitManualIngredients(text: string, table: SubstituteTable): { names: string[]; skipped: string[] } {
  const all = [...new Set(text.split(/[,，、\n]/).map((s) => s.trim()).filter(Boolean))];
  return {
    names: all.filter((n) => !table.basicSeasonings.includes(n)),
    skipped: all.filter((n) => table.basicSeasonings.includes(n)),
  };
}

/** 결과 머리말: "5개 중 4개가 냉장고에 있어요" */
export function videoHeadline(rows: readonly VideoRow[]): string {
  const have = rows.filter((r) => r.kind === 'have').length;
  return `${rows.length}개 중 ${have}개가 냉장고에 있어요`;
}
