import { describe, expect, it } from 'vitest';
import { CATALOG, PLAN_RECIPES, SUBSTITUTES, findCatalog } from '../data';
import { draftFromParsed, draftToItem } from '../state/textDraft';
import { emptyPlan } from '../state/store';
import { addDays } from './date';
import { buildMenuRequest, checkMenus, menuTargets, withAiMenus } from './menuCheck';
import { makePlan } from './plan';
import { parseTextInput } from './textInput';
import type { Item, Plan } from './types';

const today = '2026-10-30';
const planOf = (p: Partial<Plan>): Plan => ({ ...emptyPlan(), ...p });
// 수정명세 v4 재현 시나리오
const REPRO = '닭가슴살 세봉지 소분, 계란 10구 지난주에 산거, 우유 반쯤 남음\n두부 1모, 김치 1통, 애호박 1개, 방울토마토 1팩';
const repro = (): Item[] =>
  parseTextInput(REPRO, CATALOG).map((l, k) => draftToItem(draftFromParsed(l, `r${k}`, today, findCatalog), today, `r${k}`, findCatalog));

const setup = () => {
  const items = repro();
  const plan = planOf({ mealsPerWeek: 4 });
  const result = makePlan(items, PLAN_RECIPES, plan, today);
  const targets = menuTargets(result, items, today)!;
  const req = buildMenuRequest(targets, result, plan, today);
  return { items, plan, result, targets, req };
};

describe('AI에게 맡길 칸과 요청 (V4-1b)', () => {
  it('재현 시나리오: 빈 칸 3개를 맡기고, D-7 재료(우유·두부·애호박·방울토마토)를 먼저 쓰라고 보낸다', () => {
    const { targets, req } = setup();
    expect(targets.slots).toHaveLength(3);
    expect([...req.mustUseFirst].sort()).toEqual(['두부', '방울토마토', '애호박', '우유'].sort());
    expect(req.excludeMenus).toContain('닭가슴살 샐러드');
    expect(req.basicSeasonings).toEqual(['소금', '후추', '식용유', '설탕', '간장', '참기름', '깨', '물']);
    // 보내는 것은 재료 이름·수량·상태·남은 일수·쓰는 방식뿐
    for (const s of req.stock) expect(Object.keys(s).every((k) => ['name', 'qty', 'daysLeft', 'state', 'portion', 'level'].includes(k))).toBe(true);
    expect(req.stock.find((s) => s.name === '우유')).toEqual({ name: '우유', qty: '1개', daysLeft: 7, state: 'ok', portion: 'level', level: '반쯤' });
  });

  it('규칙 메뉴로 다 채워지고 못 쓰는 재료도 없으면 부르지 않는다', () => {
    const items = repro().filter((i) => i.name === '닭가슴살');
    const plan = planOf({ mealsPerWeek: 1 });
    expect(menuTargets(makePlan(items, PLAN_RECIPES, plan, today), items, today)).toBeNull();
  });
});

describe('AI 메뉴 검사 (가짜 AI 응답)', () => {
  const ok = { slotIndex: 1, name: '두부 애호박 볶음', uses: ['두부', '애호박'], keeps: ['계란'], buy: [], howto: '두부와 애호박을 볶아요' };
  const run = (menus: unknown) => {
    const { req, result, items } = setup();
    return checkMenus({ menus }, req, result, items, SUBSTITUTES);
  };

  it('괜찮은 메뉴는 그대로', () => {
    const r = run([ok]);
    expect(r.accepted.get(1)).toEqual(ok);
    expect(r.failed).toEqual([2, 3]);
  });

  it('재고에 없는 재료는 사야 할 재료로 옮긴다', () => {
    const r = run([{ ...ok, uses: ['두부', '돼지고기'], keeps: ['양파'] }]);
    expect(r.accepted.get(1)).toMatchObject({ uses: ['두부'], keeps: [], buy: ['돼지고기', '양파'] });
  });

  it('대체 묶음 이름은 재고 이름으로 바꾼다 (찌개두부 → 두부), 다른 이름(달걀 → 계란)도', () => {
    const r = run([{ ...ok, uses: ['찌개두부'], keeps: ['달걀'] }]);
    expect(r.accepted.get(1)).toMatchObject({ uses: ['두부'], keeps: ['계란'] });
  });

  it('기본 양념은 어디에 있든 지운다', () => {
    const r = run([{ ...ok, uses: ['두부', '간장'], keeps: ['참기름', '계란'], buy: ['소금', '대파'] }]);
    expect(r.accepted.get(1)).toMatchObject({ uses: ['두부'], keeps: ['계란'], buy: ['대파'] });
  });

  it('남은 일수보다 늦은 칸에 쓰는 메뉴는 버린다', () => {
    const { req, result, items } = setup();
    const late = req.slots.find((s) => s.date > addDays(today, 7))?.index ?? req.slots.at(-1)!.index;
    const day = Math.round((Date.parse(req.slots.find((s) => s.index === late)!.date) - Date.parse(today)) / 86400000);
    const shortItems = items.map((i) => (i.name === '두부' ? { ...i, expiresAt: addDays(today, day - 1) } : i));
    const r = checkMenus({ menus: [{ ...ok, slotIndex: late, uses: ['두부'] }] }, req, result, shortItems, SUBSTITUTES);
    expect(r.accepted.has(late)).toBe(false);
  });

  it('이름이 겹치면 버린다 (기존 플랜·이번 응답 안)', () => {
    const r = run([
      { ...ok, slotIndex: 1, name: '닭가슴살 샐러드' },
      { ...ok, slotIndex: 2, name: '두부 애호박 볶음' },
      { ...ok, slotIndex: 3, name: '두부애호박볶음', uses: ['애호박'] },
    ]);
    expect([...r.accepted.keys()]).toEqual([2]);
  });

  it('쓰는 재료가 비면 버린다 (재고를 하나도 안 쓰는 메뉴)', () => {
    const r = run([{ ...ok, uses: ['돼지고기'], keeps: [] }, { ...ok, slotIndex: 2, uses: ['소금'] }]);
    expect(r.accepted.size).toBe(0);
  });

  it('한 번에 쓰는 재료(두부 1모)를 두 칸에서 쓰면 뒤 칸은 버린다', () => {
    const r = run([ok, { ...ok, slotIndex: 2, name: '두부조림', uses: ['두부'] }]);
    expect([...r.accepted.keys()]).toEqual([1]);
  });

  it('형식이 깨진 답이면 모든 칸이 실패 (폴백)', () => {
    const { req, result, items } = setup();
    expect(checkMenus('{망가짐', req, result, items, SUBSTITUTES)).toMatchObject({ failed: [1, 2, 3] });
    expect(checkMenus({ menus: '아무거나' }, req, result, items, SUBSTITUTES).accepted.size).toBe(0);
  });

  it('검사한 메뉴를 플랜 칸에 넣는다 (AI 제안 표시, howto)', () => {
    const { result } = setup();
    const merged = withAiMenus(result, new Map([[1, ok]]));
    const slot = merged.slots.find((s) => s.index === 1)!;
    expect(slot).toMatchObject({ recipe: { name: '두부 애호박 볶음', uses: ['두부', '애호박'] }, ai: { howto: '두부와 애호박을 볶아요' } });
    // AI 메뉴가 쓴 재료(한 번에 쓰는 두부·애호박)는 남은 재고에서 빠진다
    expect(merged.leftover.map((e) => e.item.name)).not.toEqual(expect.arrayContaining(['두부']));
    expect(merged.leftover.map((e) => e.item.name)).not.toContain('애호박');
  });
});
