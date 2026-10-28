// 글 입력 확인 화면의 한 줄(초안). 읽은 결과(ParsedLine)를 사용자가 고친 뒤 재고(Item)로 바꾼다.
// docs/text-input-rules.md 3장

import { COUNT_MAX, COUNT_MIN } from '../rules/constants';
import { addDays, daysBetween } from '../rules/date';
import { autoExpiresAt, defaultLocation } from '../rules/expiry';
import { portionQty } from '../rules/plan';
import type { ParsedLine } from '../rules/textInput';
import type { CatalogEntry, DateKey, ExpiryBasis, Item, Location } from '../rules/types';

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
}

export type DraftIssue = 'name' | 'count' | 'expiry';

/** 소비기한을 고를 때 보여줄 보기(일) — 사전에 없는 재료용 */
export const EXPIRY_CHOICES = [3, 7, 14, 30, 60];

/** 사전 기준으로 보관 위치·소비기한을 다시 정한다. 사용자가 고친 소비기한은 그대로 둔다. */
function refresh(row: DraftRow, today: DateKey, lookup: Lookup): DraftRow {
  const entry = row.catalogName ? lookup(row.catalogName) : undefined;
  const location = defaultLocation(entry, row.portioned);
  if (row.expiryBasis === 'user') return { ...row, location };
  return { ...row, location, expiresAt: autoExpiresAt(today, entry, row.portioned), expiryBasis: 'table' };
}

export function draftFromParsed(line: ParsedLine, key: string, today: DateKey, lookup: Lookup): DraftRow {
  const row: DraftRow = {
    key,
    raw: line.raw,
    name: line.name,
    catalogName: line.catalogName,
    nameCandidates: line.nameCandidates,
    portioned: line.portioned,
    count: line.count,
    unit: line.unit,
    note: line.note,
    location: '냉장',
    expiryBasis: 'table',
    nameChecked: !line.needs.includes('name'),
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
    // 이름이 바뀌면 이전 이름 기준으로 고른 소비기한은 버린다
    expiryBasis: 'table',
    expiresAt: undefined,
  };
  return refresh(next, today, lookup);
}

export function togglePortion(row: DraftRow, today: DateKey, lookup: Lookup): DraftRow {
  return refresh({ ...row, portioned: !row.portioned }, today, lookup);
}

export function shiftDraftCount(row: DraftRow, delta: number): DraftRow {
  const base = row.count ?? (delta > 0 ? COUNT_MIN - 1 : COUNT_MIN + 1);
  return { ...row, count: Math.min(COUNT_MAX, Math.max(COUNT_MIN, base + delta)) };
}

/** 소비기한 ±1일 (입고일=오늘보다 앞으로는 가지 않음) */
export function shiftDraftExpiry(row: DraftRow, delta: number, today: DateKey): DraftRow {
  if (!row.expiresAt) return row;
  let expiresAt = addDays(row.expiresAt, delta);
  if (daysBetween(today, expiresAt) < 0) expiresAt = today;
  return { ...row, expiresAt, expiryBasis: 'user' };
}

/** 사전에 없는 재료: 소비기한을 "오늘 + N일"로 고른다 */
export function chooseExpiryDays(row: DraftRow, days: number, today: DateKey): DraftRow {
  return { ...row, expiresAt: addDays(today, days), expiryBasis: 'user' };
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

/** 확인이 끝난 줄을 재고로 바꾼다. 입고일 = 오늘 (소분 품목은 소분한 날). */
export function draftToItem(row: DraftRow, today: DateKey, id: string, lookup: Lookup): Item {
  if (issuesOf(row).length) throw new Error(`확인이 안 끝난 줄이에요: ${row.raw}`);
  const entry = row.catalogName ? lookup(row.catalogName) : undefined;
  return {
    id,
    name: row.name,
    qty: draftQty(row),
    core: entry?.core ?? '',
    location: row.location,
    enteredAt: today,
    expiresAt: row.expiresAt!,
    expiryBasis: row.expiryBasis,
    remaining: '넉넉해요',
    source: 'text',
    portioned: row.portioned,
    ...(row.portioned ? { count: row.count, unit: row.unit } : {}),
    ...(row.note ? { note: row.note } : {}),
  };
}
