// AI가 읽은 결과를 앱의 모양(확인 화면 줄, 영상 메뉴)으로 바꾼다. 화면과 무관한 순수 함수.
// AI 결과는 믿지 않고 한 번 걸러서 쓴다 (이름은 재료 사전 이름으로, 숫자는 범위 안으로, 날짜는 형식 확인).

import type { OrderAiResult, TextAiResult, VideoAiResult } from '../../api/read';
import { KINDS, findKind } from '../data';
import { COUNT_MAX, COUNT_MIN, LOCATIONS, UNIT_ALIASES } from '../rules/constants';
import { daysBetween } from '../rules/date';
import type { CatalogEntry, DateKey, Location, Retailer, SubstituteTable } from '../rules/types';
import { splitManualIngredients } from '../rules/videoCheck';
import { refresh, type DraftRow } from '../state/textDraft';

type Lookup = (name: string) => CatalogEntry | undefined;

const NAME_MAX = 30;
const cleanName = (v: unknown): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '';
const cleanCount = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= COUNT_MIN && v <= COUNT_MAX ? v : undefined;
const cleanUnit = (v: unknown): string | undefined => (typeof v === 'string' ? UNIT_ALIASES[v.trim()] : undefined);
const isDateKey = (v: unknown): v is DateKey =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

const cleanKind = (v: unknown): string | undefined => (typeof v === 'string' && findKind(v) ? v : undefined);
const cleanLocation = (v: unknown): Location | undefined =>
  LOCATIONS.includes(v as Location) ? (v as Location) : undefined;

/** AI에게 보낼 재료 사전 이름 목록 */
export const vocabularyOf = (catalog: readonly CatalogEntry[]) => catalog.map((c) => c.name);

/** AI에게 보낼 종류 목록: "id: 이름 (예: …)" */
export const kindListOf = () => KINDS.map((k) => `${k.id}: ${k.label} (예: ${k.examples})`);

// ───────────────────────── 주문 화면 ─────────────────────────

/** AI가 읽은 마트 이름 (모르면 undefined) */
export function retailerOf(ai: OrderAiResult, retailers: readonly Retailer[]): Retailer | undefined {
  return retailers.find((r) => r.name === ai.retailer);
}

/** AI가 읽은 주문일. 오늘보다 늦거나 30일보다 오래되면 믿지 않는다. */
export function orderDateOf(ai: OrderAiResult, today: DateKey): DateKey | undefined {
  if (!isDateKey(ai.orderDate)) return undefined;
  const ago = daysBetween(ai.orderDate, today);
  return ago >= 0 && ago <= 30 ? ai.orderDate : undefined;
}

/**
 * 주문 화면 결과 → 확인 화면 줄.
 * - 이름: 재료 사전(다른 이름 포함)에 있으면 사전 이름, 없으면 읽은 이름 그대로 ("소비기한을 골라 주세요")
 * - 개수: 주문 수량, 못 읽으면 1. 소분은 아님 (포장 그대로)
 * - 소비기한: 사진에 적혀 있고 입고일 이후면 그 날짜(label), 아니면 입고일 + 기본 기간표.
 *   사전에 없는 재료는 AI가 고른 종류와 보관 방법으로 종류별 기본 기간표를 쓴다 (날짜는 규칙이 계산).
 */
export function orderToDrafts(
  ai: OrderAiResult,
  enteredAt: DateKey,
  today: DateKey,
  newKey: () => string,
  lookup: Lookup,
): DraftRow[] {
  const items = Array.isArray(ai.items) ? ai.items.slice(0, 40) : [];
  return items.flatMap((it): DraftRow[] => {
    const read = cleanName(it?.name);
    if (!read) return [];
    const entry = lookup(read);
    const product = cleanName(it.product) || read;
    const weight = cleanName(it.weight);
    const label = isDateKey(it.expiresOn) && daysBetween(enteredAt, it.expiresOn) >= 0 ? it.expiresOn : undefined;
    const row: DraftRow = {
      key: newKey(),
      raw: product,
      name: entry?.name ?? read,
      catalogName: entry?.name,
      nameCandidates: entry ? [entry.name] : [],
      portioned: false,
      count: cleanCount(it.count) ?? 1,
      unit: cleanUnit(it.unit) ?? '개',
      ...(weight ? { note: weight } : {}),
      location: '냉장',
      // 사전(또는 지난번 값)에 없는 재료만 AI의 분류·보관 방법을 쓴다
      ...(entry ? {} : { kind: cleanKind(it.kind), locationPick: cleanLocation(it.storage) }),
      expiryBasis: label ? 'label' : 'table',
      ...(label ? { expiresAt: label } : {}),
      nameChecked: true,
      enteredAt,
      source: 'order',
      byAi: true,
    };
    return [refresh(row, today, lookup)];
  });
}

// ───────────────────────── 글 입력 보완 ─────────────────────────

/** 규칙으로 못 읽은 줄: 개수를 못 읽었거나, 사전에 없는 이름 */
export const needsAiHelp = (row: DraftRow) => row.count === undefined || !row.catalogName;

/**
 * AI가 다시 읽은 결과로 빈 곳만 채운다. 규칙이 읽은 값(소분 여부, 이미 읽은 개수)은 바꾸지 않는다.
 * targets[i] = AI에 보낸 i번째 줄의 key
 */
export function mergeTextAi(
  rows: readonly DraftRow[],
  targets: readonly string[],
  ai: TextAiResult,
  today: DateKey,
  lookup: Lookup,
): DraftRow[] {
  const byKey = new Map<string, TextAiResult['lines'][number]>();
  for (const l of Array.isArray(ai.lines) ? ai.lines : []) {
    const key = Number.isInteger(l?.index) ? targets[l.index] : undefined;
    if (key) byKey.set(key, l);
  }
  return rows.map((row) => {
    const l = byKey.get(row.key);
    if (!l) return row;
    let next = row;
    const entry = row.catalogName ? undefined : lookup(cleanName(l.name));
    if (entry) {
      next = { ...next, name: entry.name, catalogName: entry.name, nameCandidates: [entry.name], nameChecked: true };
    } else if (!row.catalogName && !row.kind && cleanKind(l.kind)) {
      // 사전에 없는 재료: 종류만 받아서 소비기한은 종류별 기본 기간표로
      next = { ...next, kind: cleanKind(l.kind), locationPick: next.locationPick ?? cleanLocation(l.storage) };
    }
    const count = cleanCount(l.count);
    if (next.count === undefined && count !== undefined) {
      next = { ...next, count, unit: next.unit === '개' ? (cleanUnit(l.unit) ?? next.unit) : next.unit };
    }
    if (next === row) return row;
    return refresh({ ...next, byAi: true }, today, lookup);
  });
}

// ───────────────────────── 영상 ─────────────────────────

export interface VideoMenu {
  title: string;
  names: string[];
  skipped: string[];
}

/** 영상 결과 → 메뉴 목록 (재료가 없는 메뉴는 뺀다). 기본 양념은 따로 모은다. */
export function videoMenusOf(ai: VideoAiResult, table: SubstituteTable): VideoMenu[] {
  if (ai.basis === 'none' || !Array.isArray(ai.menus)) return [];
  return ai.menus.slice(0, 5).flatMap((m): VideoMenu[] => {
    const title = cleanName(m?.title) || cleanName(ai.videoTitle) || '영상 속 메뉴';
    const list = Array.isArray(m?.ingredients) ? m.ingredients.map(cleanName).filter(Boolean).slice(0, 30) : [];
    const { names, skipped } = splitManualIngredients(list.join(','), table);
    return names.length ? [{ title, names, skipped }] : [];
  });
}
