import { describe, expect, it } from 'vitest';
import type { MenuAiItem, MenuRequest } from '../../api/read';
import { CATALOG, PLAN_RECIPES, SUBSTITUTES, findCatalog } from '../data';
import { buildMenuRequest, menuTargets } from '../rules/menuCheck';
import { makePlan } from '../rules/plan';
import { parseTextInput } from '../rules/textInput';
import { AI_DAILY_LIMIT, menuCacheKey, quotaLeft, quotaUse, requestMenus, swapMenu, type QuotaGate } from './aiMenu';
import { emptyPlan } from './store';
import { draftFromParsed, draftToItem } from './textDraft';

const today = '2026-10-30';
const REPRO = '닭가슴살 세봉지 소분, 계란 10구 지난주에 산거, 우유 반쯤 남음\n두부 1모, 김치 1통, 애호박 1개, 방울토마토 1팩';
const items = parseTextInput(REPRO, CATALOG).map((l, k) => draftToItem(draftFromParsed(l, `r${k}`, today, findCatalog), today, `r${k}`, findCatalog));
const plan = { ...emptyPlan(), mealsPerWeek: 4 };
const result = makePlan(items, PLAN_RECIPES, plan, today);
const req = buildMenuRequest(menuTargets(result, items, today)!, result, plan, today);

const menu = (slotIndex: number, name: string, uses: string[]): MenuAiItem => ({ slotIndex, name, uses, keeps: [], buy: [], howto: '' });
const gate = (n = 99): QuotaGate & { used: number } => ({ used: 0, take() { if (this.used >= n) return false; this.used++; return true; } });

describe('하루 한도 (V4-1b·V4-5 함께 30회)', () => {
  it('오늘 쓴 만큼 줄고, 날이 바뀌면 다시 30회', () => {
    expect(quotaLeft(null, today)).toBe(AI_DAILY_LIMIT);
    let q = quotaUse(null, today);
    q = quotaUse(q, today);
    expect(quotaLeft(q, today)).toBe(28);
    expect(quotaLeft(q, '2026-10-31')).toBe(30);
    expect(quotaUse(q, '2026-10-31')).toEqual({ date: '2026-10-31', count: 1 });
  });
});

describe('저장 이름표 (같은 재고·칸·제외 메뉴면 다시 부르지 않음)', () => {
  it('같은 요청이면 같은 이름표, 재고·칸·제외 메뉴가 바뀌면 다른 이름표', () => {
    expect(menuCacheKey(req)).toBe(menuCacheKey(JSON.parse(JSON.stringify(req))));
    expect(menuCacheKey({ ...req, excludeMenus: [...req.excludeMenus, '두부조림'] })).not.toBe(menuCacheKey(req));
    expect(menuCacheKey({ ...req, stock: req.stock.slice(1) })).not.toBe(menuCacheKey(req));
  });
});

describe('메뉴 요청 순서', () => {
  it('한 번 부르고, 버려진 칸만 한 번 더 요청한다 (최대 1회)', async () => {
    const calls: MenuRequest[] = [];
    const call = async (r: MenuRequest) => {
      calls.push(r);
      return calls.length === 1
        ? { ok: true as const, data: { menus: [menu(1, '두부 애호박 볶음', ['두부', '애호박']), menu(2, '닭가슴살 샐러드', ['우유'])] } }
        : { ok: true as const, data: { menus: [menu(2, '우유 계란찜', ['우유', '계란']), menu(3, '김치 볶음밥', ['김치'])] } };
    };
    const g = gate();
    const out = await requestMenus(req, result, items, SUBSTITUTES, call, g);
    expect(calls).toHaveLength(2);
    expect(calls[1].slots.map((s) => s.index)).toEqual([2, 3]); // 버려진 칸만
    expect(calls[1].excludeMenus).toContain('두부 애호박 볶음'); // 이미 고른 메뉴는 제외
    expect(out.entry?.menus.map((m) => m.name)).toEqual(['두부 애호박 볶음', '우유 계란찜', '김치 볶음밥']);
    expect(out.entry?.failed).toEqual([]);
    expect(g.used).toBe(2);
  });

  it('두 번째에도 비면 그 칸은 폴백', async () => {
    const call = async () => ({ ok: true as const, data: { menus: [menu(1, '두부 애호박 볶음', ['두부'])] } });
    const out = await requestMenus(req, result, items, SUBSTITUTES, call, gate());
    expect(out.entry?.failed).toEqual([2, 3]);
  });

  it('AI가 실패·오프라인이면 폴백(저장하지 않음), 한도를 다 쓰면 limit', async () => {
    const fail = async () => ({ ok: false as const, reason: 'ai-failed' as const });
    expect(await requestMenus(req, result, items, SUBSTITUTES, fail, gate())).toEqual({ reason: 'error' });
    expect(await requestMenus(req, result, items, SUBSTITUTES, fail, gate(0))).toEqual({ reason: 'limit' });
  });

  it('바꾸기: 그 칸만 다시 요청하고 지금 메뉴는 제외, 다른 칸은 그대로', async () => {
    const entry = { menus: [menu(1, '두부 애호박 볶음', ['두부', '애호박']), menu(2, '우유 계란찜', ['우유'])], failed: [3] };
    const calls: MenuRequest[] = [];
    const call = async (r: MenuRequest) => {
      calls.push(r);
      return { ok: true as const, data: { menus: [menu(1, '두부부침', ['두부'])] } };
    };
    const out = await swapMenu(entry, 1, req, result, items, SUBSTITUTES, call, gate());
    expect(calls[0].slots.map((s) => s.index)).toEqual([1]);
    expect(calls[0].excludeMenus).toEqual(expect.arrayContaining(['두부 애호박 볶음', '우유 계란찜']));
    expect(out.entry?.menus.map((m) => m.name)).toEqual(['두부부침', '우유 계란찜']);
  });

  it('바꾸기: 다른 AI 칸이 이미 쓰는 재료는 보내지 않는다 (배포에서 방울토마토를 또 써서 버려졌음)', async () => {
    const entry = { menus: [menu(1, '두부 애호박 볶음', ['두부', '애호박']), menu(2, '토마토 스크램블', ['방울토마토', '우유'])], failed: [3] };
    const calls: MenuRequest[] = [];
    const call = async (r: MenuRequest) => {
      calls.push(r);
      return { ok: true as const, data: { menus: [menu(2, '우유 계란찜', ['우유'])] } };
    };
    const out = await swapMenu(entry, 2, req, result, items, SUBSTITUTES, call, gate());
    const sent = calls[0].stock.map((s) => s.name);
    expect(sent).not.toContain('두부');
    expect(sent).not.toContain('애호박');
    // 바꾸는 칸이 쓰던 재료는 다시 쓸 수 있다
    expect(sent).toEqual(expect.arrayContaining(['방울토마토', '우유']));
    expect(calls[0].mustUseFirst).not.toContain('두부');
    expect(out.entry?.menus.map((m) => m.name)).toEqual(['두부 애호박 볶음', '우유 계란찜']);
  });
});
