// 확인 화면의 한 줄(초안). 읽은 결과(글 입력 규칙 읽기, 또는 AI 읽기)를 사용자가 고친 뒤 재고(Item)로 바꾼다.
// docs/text-input-rules.md 3장. 주문 화면(캡처)도 같은 확인 화면을 쓴다 (입고일만 마트 규칙으로).

import { COUNT_MAX, COUNT_MIN } from '../rules/constants';
import { addDays, daysBetween } from '../rules/date';
import { findKind } from '../data';
import { autoExpiresAt, defaultLocation, kindLocation, kindShelfDays } from '../rules/expiry';
import { portionQty } from '../rules/plan';
import type { ParsedLine } from '../rules/textInput';
import type { CatalogEntry, DateKey, ExpiryBasis, Item, ItemSource, Location, Remaining } from '../rules/types';

type Lookup = (name: string) => CatalogEntry | undefined;

export interface DraftRow {
  key: string;
  raw: string;
  name: string;
  /** 사전에서 찾은 이름 (직접 입력한 이름이면 undefined) */
  catalogName?: string;
  nameCandidates: string[];
  portioned: boolean;
  count?: number;
  unit: string;
  note?: string;
  location: Location;
  /** 사전에 없으면 사용자가 고를 때까지 undefined */
  expiresAt?: DateKey;
  expiryBasis: ExpiryBasis;
  /** "이름을 확인해 주세요"를 확인했는지 */
  nameChecked: boolean;
  /** 입고일. 없으면 오늘 (글 입력·소분은 오늘, 주문 화면은 마트 규칙으로 계산한 날) */
  enteredAt?: DateKey;
  /** 어디서 왔는지 (없으면 글 입력) */
  source?: ItemSource;
  /** AI가 읽은 줄이면 true (확인 화면에 "AI가 읽었어요" 표시) */
  byAi?: boolean;
  /** 사전에 없는 재료를 AI가 분류한 종류 (종류별 기본 기간표의 id). 소비기한은 그 표로 계산한다. */
  kind?: string;
  /** 고른 보관 위치 (AI가 읽은 보관 방법, 또는 사용자가 누른 것). 없으면 사전·종류의 기본 위치. */
  locationPick?: Location;
  /** 남은 양 ("반쯤 남음"을 읽었으면). 없으면 넉넉해요 (V4-3) */
  remaining?: Remaining;
  /** 글에서 언제 샀는지 읽어서 입고일을 정했으면 true ("들어온 날을 …로 읽었어요", V4-2) */
  enteredRead?: boolean;
}

export type DraftIssue = 'name' | 'count' | 'expiry';

/** 소비기한을 고를 때 보여줄 보기(일) — 사전에 없는 재료용 */
export const EXPIRY_CHOICES = [3, 7, 14, 30, 60];

/** 소비기한 계산의 기준일 */
const baseDate = (row: DraftRow, today: DateKey) => row.enteredAt ?? today;

/**
 * 보관 위치·소비기한을 다시 정한다. 사용자가 고친 값·주문 화면에서 읽은 소비기한은 그대로 둔다.
 * 순서: 재료 사전(또는 지난번 값) → AI가 고른 종류(종류별 기본 기간표) → 없음(사용자가 고름)
 */
export function refresh(row: DraftRow, today: DateKey, lookup: Lookup): DraftRow {
  const entry = row.catalogName ? lookup(row.catalogName) : undefined;
  const kind = entry ? undefined : findKind(row.kind);
  const location = kind
    ? kindLocation(kind, row.portioned, row.locationPick)
    : (row.locationPick ?? defaultLocation(entry, row.portioned));
  if (row.expiryBasis === 'user' || row.expiryBasis === 'label') return { ...row, location };
  const base = baseDate(row, today);
  if (entry) {
    return { ...row, location, expiresAt: autoExpiresAt(base, entry, row.portioned), expiryBasis: entry.mine ? 'mine' : 'table' };
  }
  if (kind) {
    return { ...row, location, expiresAt: addDays(base, kindShelfDays(kind, location, row.portioned)), expiryBasis: 'kind' };
  }
  return { ...row, location, expiresAt: undefined, expiryBasis: 'table' };
}

/** 보관 위치 고르기. 종류로 정한 소비기한은 위치에 따라 다시 계산한다 (냉동이면 더 길게). */
export function setDraftLocation(row: DraftRow, location: Location, today: DateKey, lookup: Lookup): DraftRow {
  return refresh({ ...row, locationPick: location }, today, lookup);
}

/** 입고일 바꾸기 (주문 화면에서 마트를 바꿨을 때). 자동으로 정한 소비기한만 다시 계산한다. */
export function setDraftEnteredAt(row: DraftRow, enteredAt: DateKey, lookup: Lookup): DraftRow {
  const next = { ...row, enteredAt };
  if (row.expiryBasis === 'user' || row.expiryBasis === 'label') return next;
  return refresh(next, enteredAt, lookup);
}

export function draftFromParsed(line: ParsedLine, key: string, today: DateKey, lookup: Lookup): DraftRow {
  // 사전에 없는 이름이어도 지난번에 넣은 적이 있으면 그 값으로
  const mine = line.catalogName ? undefined : lookup(line.name);
  const row: DraftRow = {
    key,
    raw: line.raw,
    name: mine?.name ?? line.name,
    catalogName: line.catalogName ?? mine?.name,
    nameCandidates: line.nameCandidates,
    portioned: line.portioned,
    count: line.count,
    unit: line.unit,
    note: line.note,
    location: '냉장',
    expiryBasis: 'table',
    nameChecked: !line.needs.includes('name') || !!mine,
    // "지난주에 산거" → 입고일, "반쯤 남음" → 남은 양 (V4-2·V4-3)
    ...(line.enteredAgo !== undefined ? { enteredAt: addDays(today, -line.enteredAgo), enteredRead: true } : {}),
    ...(line.remaining ? { remaining: line.remaining } : {}),
  };
  return refresh(row, today, lookup);
}

/** 이름 바꾸기: 후보 칩이나 직접 입력. 사전에 있으면 소비기한·위치를 다시 계산한다. */
export function renameRow(row: DraftRow, name: string, today: DateKey, lookup: Lookup): DraftRow {
  const trimmed = name.trim();
  if (!trimmed) return row;
  const entry = lookup(trimmed);
  const next: DraftRow = {
    ...row,
    name: entry?.name ?? trimmed, // 다른 이름이면 대표 이름으로 (달걀 → 계란)
    catalogName: entry?.name,
    nameChecked: true,
    // 이름이 바뀌면 이전 이름 기준으로 고른(읽은) 소비기한은 버린다
    expiryBasis: 'table',
    expiresAt: undefined,
  };
  return refresh(next, today, lookup);
}

export function togglePortion(row: DraftRow, today: DateKey, lookup: Lookup): DraftRow {
  return refresh({ ...row, portioned: !row.portioned }, today, lookup);
}

/** 개수를 모를 때 "잘 모르겠어요 (1개로 둘게요)": 1개로 채우고 확인 표시를 푼다 */
export const assumeOneCount = (row: DraftRow): DraftRow => ({ ...row, count: 1 });

/** 개수를 모를 때 "소분 안 함으로 바꾸기": 소분을 끄고 포장 그대로 1개 (위치·소비기한도 소분 안 한 기준으로) */
export function unportionAsOne(row: DraftRow, today: DateKey, lookup: Lookup): DraftRow {
  return refresh({ ...row, portioned: false, count: 1 }, today, lookup);
}

export function shiftDraftCount(row: DraftRow, delta: number): DraftRow {
  const base = row.count ?? (delta > 0 ? COUNT_MIN - 1 : COUNT_MIN + 1);
  return { ...row, count: Math.min(COUNT_MAX, Math.max(COUNT_MIN, base + delta)) };
}

/** 소비기한 ±1일 (입고일보다 앞으로는 가지 않음) */
export function shiftDraftExpiry(row: DraftRow, delta: number, today: DateKey): DraftRow {
  if (!row.expiresAt) return row;
  const base = baseDate(row, today);
  let expiresAt = addDays(row.expiresAt, delta);
  if (daysBetween(base, expiresAt) < 0) expiresAt = base;
  return { ...row, expiresAt, expiryBasis: 'user' };
}

/** 사전에 없는 재료: 소비기한을 "입고일 + N일"로 고른다 */
export function chooseExpiryDays(row: DraftRow, days: number, today: DateKey): DraftRow {
  return { ...row, expiresAt: addDays(baseDate(row, today), days), expiryBasis: 'user' };
}

export function issuesOf(row: DraftRow): DraftIssue[] {
  const out: DraftIssue[] = [];
  if (!row.nameChecked) out.push('name');
  if (row.count === undefined) out.push('count');
  if (!row.expiresAt) out.push('expiry');
  return out;
}

export const ISSUE_TEXT: Record<DraftIssue, string> = {
  name: '이름을 확인해 주세요',
  count: '몇 개로 나눴나요?',
  expiry: '소비기한을 골라 주세요',
};

/** 화면에 보일 수량 글자 */
export function draftQty(row: Pick<DraftRow, 'portioned' | 'count' | 'unit' | 'note'>): string {
  const count = row.count ?? 1;
  if (row.portioned) return portionQty(count, row.unit);
  if (row.note) return count === 1 && row.unit === '개' ? row.note : `${count}${row.unit}(${row.note})`;
  return `${count}${row.unit}`;
}

/** 확인이 끝난 줄을 재고로 바꾼다. 입고일 = 줄의 입고일, 없으면 오늘 (소분 품목은 소분한 날). */
export function draftToItem(row: DraftRow, today: DateKey, id: string, lookup: Lookup): Item {
  if (issuesOf(row).length) throw new Error(`확인이 안 끝난 줄이에요: ${row.raw}`);
  const entry = row.catalogName ? lookup(row.catalogName) : undefined;
  // 사전에 없는 재료는 품목군을 같이 저장한다 (상비 재료 제외에 씀)
  const group = entry ? (entry.mine ? entry.group : undefined) : findKind(row.kind)?.group;
  return {
    id,
    name: row.name,
    qty: draftQty(row),
    core: entry?.core ?? '',
    ...(group ? { group } : {}),
    location: row.location,
    enteredAt: baseDate(row, today),
    expiresAt: row.expiresAt!,
    expiryBasis: row.expiryBasis,
    remaining: row.remaining ?? '넉넉해요',
    source: row.source ?? 'text',
    portioned: row.portioned,
    ...(row.portioned ? { count: row.count, unit: row.unit } : {}),
    ...(row.note ? { note: row.note } : {}),
  };
}
