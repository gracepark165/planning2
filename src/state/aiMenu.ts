// AI 메뉴 제안 부르기 (수정명세 v4 V4-1b): 언제, 몇 번 부를지와 결과 저장.
// - 규칙 플랜이 못 채운 칸만 맡긴다 (menuTargets). 결과는 규칙 코드가 다시 검사한다 (checkMenus).
// - 한 번 부르고, 버려진 칸만 한 번 더 (최대 1회). 그래도 비면 그 칸은 폴백.
// - 결과는 "재고 상태 + 칸 + 제외 메뉴"로 만든 이름표로 기기에 저장해 두고, 같은 이름표면 다시 부르지 않는다.
// - 짧은 시간에 여러 번 바뀌면 마지막 한 번만 부른다 (1초). 기기당 하루 30회 (메뉴 이름 → 재료 채우기와 함께 센다).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MenuAiItem, MenuAiResult, MenuRequest } from '../../api/read';
import type { AiResult } from '../ai/client';
import { buildMenuRequest, checkMenus, menuTargets, withAiMenus, type AiSlot } from '../rules/menuCheck';
import type { PlanResult } from '../rules/plan';
import type { DateKey, Item, Plan, SubstituteTable } from '../rules/types';

export const AI_DAILY_LIMIT = 30;
const DEBOUNCE_MS = 1000;
const CACHE_KEY = 'fridge-planner-ai-menus';
const CACHE_MAX = 20;
const QUOTA_KEY = 'fridge-planner-ai-quota';

// ───────────────────────── 하루 한도 ─────────────────────────

export interface Quota {
  date: DateKey;
  count: number;
}
export const quotaLeft = (q: Quota | null, today: DateKey) => (q && q.date === today ? AI_DAILY_LIMIT - q.count : AI_DAILY_LIMIT);
export const quotaUse = (q: Quota | null, today: DateKey): Quota =>
  q && q.date === today ? { date: today, count: q.count + 1 } : { date: today, count: 1 };

/** 한 번 부를 때마다 한도를 하나 쓴다. 다 썼으면 false */
export interface QuotaGate {
  take(): boolean;
}

const readJson = <T>(key: string): T | null => {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const writeJson = (key: string, value: unknown) => {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 못 해도 동작 (다음에 다시 부를 뿐)
  }
};

/** 기기에 저장한 오늘 쓴 횟수로 하루 한도 문지기 (메뉴 제안·재료 채우기 공통) */
export const deviceQuota = (today: DateKey): QuotaGate => ({
  take() {
    const q = readJson<Quota>(QUOTA_KEY);
    if (quotaLeft(q, today) <= 0) return false;
    writeJson(QUOTA_KEY, quotaUse(q, today));
    return true;
  },
});

// ───────────────────────── 저장 (같은 요청이면 다시 부르지 않음) ─────────────────────────

/** 저장해 둔 결과: 통과한 메뉴와 폴백할 칸 */
export interface MenuEntry {
  menus: MenuAiItem[];
  failed: number[];
}

/** 요청 → 짧은 이름표 (재고 상태 + 칸 + 제외 메뉴가 같으면 같다) */
export function menuCacheKey(req: MenuRequest): string {
  const s = JSON.stringify(req);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `m${(h >>> 0).toString(36)}${s.length.toString(36)}`;
}

type Cache = Record<string, MenuEntry & { at: number }>;
const readCache = (): Cache => readJson<Cache>(CACHE_KEY) ?? {};
const writeCache = (key: string, entry: MenuEntry) => {
  const all = { ...readCache(), [key]: { ...entry, at: Date.now() } };
  const keep = Object.entries(all)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, CACHE_MAX);
  writeJson(CACHE_KEY, Object.fromEntries(keep));
};

// ───────────────────────── 부르기 (테스트에서는 가짜 call을 넣는다) ─────────────────────────

type Call = (req: MenuRequest) => Promise<AiResult<MenuAiResult>>;
const bySlot = (m: ReadonlyMap<number, MenuAiItem>) => [...m.values()].sort((a, b) => a.slotIndex - b.slotIndex);
export type MenuOutcome = { entry: MenuEntry; reason?: undefined } | { entry?: undefined; reason: 'limit' | 'error' };

/** 맡긴 칸을 요청하고 검사한다. 버려진 칸만 한 번 더 요청한다 (최대 1회). */
export async function requestMenus(
  req: MenuRequest,
  result: PlanResult,
  items: readonly Item[],
  table: SubstituteTable,
  call: Call,
  quota: QuotaGate,
): Promise<MenuOutcome> {
  if (!quota.take()) return { reason: 'limit' };
  const first = await call(req);
  if (!first.ok) return { reason: 'error' };
  let check = checkMenus(first.data, req, result, items, table);
  if (check.failed.length && quota.take()) {
    const retry: MenuRequest = {
      ...req,
      slots: req.slots.filter((s) => check.failed.includes(s.index)),
      excludeMenus: [...req.excludeMenus, ...[...check.accepted.values()].map((m) => m.name)],
    };
    const second = await call(retry);
    if (second.ok) {
      // 첫 번째에 통과한 메뉴를 먼저 다시 넣어서, 두 번째 메뉴가 같은 재료를 또 쓰지 않게 한 번에 검사한다
      const menus = [...check.accepted.values(), ...(Array.isArray(second.data?.menus) ? second.data.menus : [])];
      check = checkMenus({ menus }, req, result, items, table);
    }
  }
  return { entry: { menus: bySlot(check.accepted), failed: check.failed } };
}

/** 바꾸기: 그 칸만 다시 요청한다 (지금 메뉴는 제외). 다른 칸은 그대로. 못 찾으면 원래 메뉴 그대로 */
export async function swapMenu(
  entry: MenuEntry,
  slotIndex: number,
  req: MenuRequest,
  result: PlanResult,
  items: readonly Item[],
  table: SubstituteTable,
  call: Call,
  quota: QuotaGate,
): Promise<MenuOutcome> {
  if (!quota.take()) return { reason: 'limit' };
  const current = entry.menus.find((m) => m.slotIndex === slotIndex);
  const others = entry.menus.filter((m) => m.slotIndex !== slotIndex);
  const slot = req.slots.filter((s) => s.index === slotIndex);
  // 다른 AI 칸이 이미 쓰는 재료는 빼고 보낸다 (안 빼면 같은 재료를 또 써서 검사에서 버려진다)
  const used = new Map<string, number>();
  for (const m of others) for (const u of m.uses) used.set(u, (used.get(u) ?? 0) + 1);
  const avail = new Map(result.leftover.map((e) => [e.item.name, e.count]));
  const stock = req.stock.filter((s) => (avail.get(s.name) ?? 0) - (used.get(s.name) ?? 0) > 0);
  const res = await call({
    ...req,
    slots: slot,
    stock,
    mustUseFirst: req.mustUseFirst.filter((n) => stock.some((s) => s.name === n)),
    excludeMenus: [...req.excludeMenus, ...entry.menus.map((m) => m.name)],
  });
  if (!res.ok) return { reason: 'error' };
  const fresh = (Array.isArray(res.data?.menus) ? res.data.menus : []).filter((m) => m?.slotIndex === slotIndex);
  const check = checkMenus(
    { menus: [...others, ...fresh] },
    { ...req, excludeMenus: [...req.excludeMenus, ...(current ? [current.name] : [])] },
    result,
    items,
    table,
  );
  if (!check.accepted.has(slotIndex)) return { reason: 'error' };
  return { entry: { menus: bySlot(check.accepted), failed: check.failed } };
}

// ───────────────────────── 화면에서 쓰는 훅 ─────────────────────────

/** 칸마다 상태: 불러오는 중 / 폴백 (limit = 오늘 한도를 다 씀) */
export type AiSlotState = 'loading' | 'fallback' | 'limit';

export interface AiMenus {
  /** AI 메뉴를 넣은 플랜 (AI 칸에는 ai.howto) */
  result: PlanResult & { slots: AiSlot[] };
  /** AI에게 맡겼는데 아직 메뉴가 없는 칸의 상태 */
  states: Map<number, AiSlotState>;
  /** 폴백 칸에 보여줄 먼저 쓸 재료 */
  mustUseFirst: string[];
  /** AI 칸 바꾸기 (그 칸만 다시). 못 바꾸면 false */
  swap: (slotIndex: number) => Promise<boolean>;
  /** 바꾸는 중인 칸 (실제 AI는 10초쯤 걸려서 화면에 표시) */
  swapping: number | null;
}

export function useAiMenus(
  base: PlanResult,
  items: readonly Item[],
  plan: Plan,
  today: DateKey,
  table: SubstituteTable,
  call: Call,
): AiMenus {
  const targets = useMemo(() => menuTargets(base, items, today), [base, items, today]);
  const req = useMemo(() => (targets ? buildMenuRequest(targets, base, plan, today) : null), [targets, base, plan, today]);
  const key = req ? menuCacheKey(req) : null;
  const [entry, setEntry] = useState<MenuEntry | null>(() => (key ? readCache()[key] ?? null : null));
  const [reason, setReason] = useState<'limit' | 'error' | null>(null);
  const [loading, setLoading] = useState(false);
  const [swapping, setSwapping] = useState<number | null>(null);
  // 비동기로 늦게 온 결과가 다른 이름표의 결과를 덮지 않게
  const live = useRef({ key, req, base, items });
  live.current = { key, req, base, items };

  useEffect(() => {
    setReason(null);
    if (!key || !req) {
      setEntry(null);
      setLoading(false);
      return;
    }
    const cached = readCache()[key];
    if (cached) {
      setEntry(cached);
      setLoading(false);
      return;
    }
    setEntry(null);
    setLoading(true);
    const t = window.setTimeout(async () => {
      const out = await requestMenus(req, base, items, table, call, deviceQuota(today));
      if (live.current.key !== key) return;
      setLoading(false);
      if (out.entry) {
        writeCache(key, out.entry);
        setEntry(out.entry);
      } else setReason(out.reason);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
    // 이름표가 같으면 다시 부르지 않는다 (재고·칸·제외 메뉴가 이름표에 다 들어 있음)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const swap = useCallback(
    async (slotIndex: number) => {
      const { key: k, req: r, base: b, items: its } = live.current;
      if (!k || !r || !entry) return false;
      setSwapping(slotIndex);
      const out = await swapMenu(entry, slotIndex, r, b, its, table, call, deviceQuota(today)).finally(() => setSwapping(null));
      if (live.current.key !== k) return false;
      if (out.entry) {
        writeCache(k, out.entry);
        setEntry(out.entry);
        return true;
      }
      if (out.reason === 'limit') setReason('limit');
      return false;
    },
    [entry, table, call, today],
  );

  const accepted = useMemo(() => new Map((entry?.menus ?? []).map((m) => [m.slotIndex, m])), [entry]);
  const result = useMemo(() => withAiMenus(base, accepted), [base, accepted]);
  const states = useMemo(() => {
    const m = new Map<number, AiSlotState>();
    for (const s of targets?.slots ?? []) {
      if (accepted.has(s.index)) continue;
      m.set(s.index, loading ? 'loading' : reason === 'limit' ? 'limit' : 'fallback');
    }
    return m;
  }, [targets, accepted, loading, reason]);

  return { result, states, mustUseFirst: targets?.mustUseFirst ?? [], swap, swapping };
}
