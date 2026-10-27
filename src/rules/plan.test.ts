import { describe, expect, it } from 'vitest';
import { PLAN_RECIPES } from '../data';
import { makeSampleInventory } from '../data/sampleInventory';
import { emptyPlan } from '../state/store';
import { addDays } from './date';
import { makePlan, reasonOf, slotDay, summarizePlan } from './plan';
import type { Item, Plan, Recipe } from './types';

const today = '2026-10-27';
const inv = makeSampleInventory(today);
const planOf = (p: Partial<Plan>): Plan => ({ ...emptyPlan(), ...p });
const names = (n: number, p: Partial<Plan> = {}) =>
  makePlan(inv, PLAN_RECIPES, planOf({ mealsPerWeek: n, ...p }), today).slots.map((s) => s.recipe?.name ?? null);

describe('끼니 날짜', () => {
  it('끼니 i의 날짜 = floor(i*7/N)', () => {
    expect([0, 1, 2, 3].map((i) => slotDay(i, 4))).toEqual([0, 1, 3, 5]);
    expect([0, 1].map((i) => slotDay(i, 2))).toEqual([0, 3]);
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => slotDay(i, 7))).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

// 기대값은 reference/fridge-prototype.html 의 makePlan·reasonOf를 같은 샘플 재고로 실행한 결과
// (단, 정상 재료 문장은 사용자 요청으로 '○○을/를' → '○○이/가 넉넉할 때 써요'로 바꿈)
describe('프로토타입과 같은 플랜', () => {
  const CURRY = '닭안심 버터카레', MANDU = '군만두와 오이무침', BULGOGI = '소불고기 덮밥';
  const PASTA = '새우 크림 파스타', SAMGYUP = '삼겹살 구이', BACON = '베이컨 계란볶음밥';

  it('집밥 2~7번', () => {
    expect(names(2)).toEqual([CURRY, PASTA]);
    expect(names(3)).toEqual([CURRY, MANDU, SAMGYUP]);
    expect(names(4)).toEqual([CURRY, MANDU, PASTA, SAMGYUP]);
    expect(names(5)).toEqual([CURRY, MANDU, BULGOGI, SAMGYUP, BACON]);
    expect(names(6)).toEqual([CURRY, MANDU, BULGOGI, PASTA, SAMGYUP, BACON]);
    expect(names(7)).toEqual([CURRY, MANDU, BULGOGI, PASTA, SAMGYUP, BACON, null]);
  });

  it('후보 수와 날짜', () => {
    const { slots } = makePlan(inv, PLAN_RECIPES, planOf({ mealsPerWeek: 4 }), today);
    expect(slots.map((s) => s.candidateCount)).toEqual([7, 6, 4, 3]);
    expect(slots.map((s) => s.date)).toEqual([today, addDays(today, 1), addDays(today, 3), addDays(today, 5)]);
    const seven = makePlan(inv, PLAN_RECIPES, planOf({ mealsPerWeek: 7 }), today).slots;
    expect(seven[6].candidateCount).toBe(0);
  });

  it('바꾸기: 그 끼니의 다음 후보', () => {
    expect(names(4, { swapIndex: { 0: 1 } })).toEqual([MANDU, CURRY, PASTA, SAMGYUP]);
  });

  it('바꾸기를 후보 수만큼 누르면 처음으로 돌아온다', () => {
    expect(names(4, { swapIndex: { 0: 7 } })).toEqual(names(4));
  });

  it('건너뛰기: 그 레시피는 이번 주 후보에서 빠진다', () => {
    expect(names(4, { rejectedRecipes: [BULGOGI] })).toEqual([CURRY, MANDU, PASTA, SAMGYUP]);
    expect(names(5, { rejectedRecipes: [CURRY] })).not.toContain(CURRY);
  });

  it('배치 이유 문장', () => {
    const r = (name: string) => PLAN_RECIPES.find((x) => x.name === name)!;
    expect(reasonOf(r(CURRY), inv, today)).toBe('닭안심이 내일까지라서 먼저 배치했어요');
    expect(reasonOf(r(MANDU), inv, today)).toBe('오이가 2일 뒤까지라서 먼저 배치했어요');
    expect(reasonOf(r(BULGOGI), inv, today)).toBe('소고기 불고기용이 2일 뒤까지라서 먼저 배치했어요');
    expect(reasonOf(r(PASTA), inv, today)).toBe('우유가 3일 뒤까지라서 먼저 배치했어요');
    expect(reasonOf(r(SAMGYUP), inv, today)).toBe('삼겹살이 넉넉할 때 써요');
    expect(reasonOf(r(BACON), inv, today)).toBe('대파가 넉넉할 때 써요');
    expect(reasonOf(r('계란말이 한 끼'), inv, today)).toBe('급한 재료가 없어서 가볍게 먹어요');
  });
});

describe('규칙 세부', () => {
  const item = (name: string, left: number, ago: number, extra: Partial<Item> = {}): Item => ({
    id: name,
    name,
    qty: '1개',
    core: '',
    location: '냉장',
    enteredAt: addDays(today, -ago),
    expiresAt: addDays(today, left),
    expiryBasis: 'table',
    remaining: '넉넉해요',
    source: 'manual',
    portioned: false,
    ...extra,
  });
  const rec = (name: string, uses: string[], keeps: string[] = [], buy: string[] = []): Recipe => ({ name, uses, keeps, buy });

  it('쓰는 재료의 남은 일수가 그날보다 짧으면 그날에는 배치하지 않는다', () => {
    const items = [item('두부', 1, 0)];
    const { slots } = makePlan(items, [rec('두부부침', ['두부'])], planOf({ mealsPerWeek: 2 }), today);
    // 끼니 1의 날짜는 3일 뒤인데 두부는 1일 남음 → 끼니 0에만 배치. (끼니 0에서 이미 써서 끼니 1은 비어 있음)
    expect(slots.map((s) => s.recipe?.name ?? null)).toEqual(['두부부침', null]);
  });

  it('상비 재료가 없으면 후보가 아니다', () => {
    const { slots } = makePlan([item('두부', 5, 0)], [rec('두부조림', ['두부'], ['간장소스'])], planOf({ mealsPerWeek: 2 }), today);
    expect(slots.every((s) => s.recipe === null)).toBe(true);
  });

  it('쓰는 재료가 없는 레시피는 맨 뒤(대체용)', () => {
    const items = [item('계란', 20, 0), item('두부', 20, 0)];
    const recipes = [rec('계란말이', [], ['계란']), rec('두부부침', ['두부'])];
    const { slots } = makePlan(items, recipes, planOf({ mealsPerWeek: 2 }), today);
    expect(slots.map((s) => s.recipe?.name)).toEqual(['두부부침', '계란말이']);
  });

  it('남은 일수가 같으면 급함 점수가 높은 쪽 먼저', () => {
    const items = [item('A', 5, 0), item('B', 5, 0), item('C', 30, 20)]; // C는 잊혀지는 중(5점)
    const recipes = [rec('A요리', ['A']), rec('B+C요리', ['B', 'C'])];
    const { slots } = makePlan(items, recipes, planOf({ mealsPerWeek: 1 }), today);
    expect(slots[0].recipe?.name).toBe('B+C요리');
  });

  it('소분 품목은 한 끼에 1개씩, 개수만큼 여러 끼에 쓴다', () => {
    const items = [item('닭안심', 90, 0, { portioned: true, count: 3, unit: '덩이', qty: '소분 3덩이' })];
    const recipes = [rec('닭안심 구이', ['닭안심'])];
    const { slots, leftover } = makePlan(items, recipes, planOf({ mealsPerWeek: 4 }), today);
    expect(slots.map((s) => s.recipe?.name ?? null)).toEqual(['닭안심 구이', '닭안심 구이', '닭안심 구이', null]);
    expect(leftover).toEqual([]);
  });

  it('이미 확정한 끼니 수만큼 앞 끼니는 건너뛴다', () => {
    const done = [{ recipe: 'x', usedItems: [], soonUsed: [], at: '' }];
    const { slots } = makePlan(inv, PLAN_RECIPES, planOf({ mealsPerWeek: 4, doneMeals: done }), today);
    expect(slots.map((s) => s.index)).toEqual([1, 2, 3]);
  });

  it('같은 입력이면 같은 결과', () => {
    const p = planOf({ mealsPerWeek: 4 });
    expect(makePlan(inv, PLAN_RECIPES, p, today)).toEqual(makePlan(inv, PLAN_RECIPES, p, today));
  });
});

describe('플랜 요약', () => {
  // 기대값은 프로토타입 planView의 계산을 같은 샘플 재고로 실행한 결과
  const summary = (n: number) => {
    const plan = planOf({ mealsPerWeek: n });
    const s = summarizePlan(makePlan(inv, PLAN_RECIPES, plan, today), inv, plan, today);
    return { ...s, lost: s.lost.map((i) => i.name) };
  };

  it('샘플 재고·집밥 4번', () => {
    expect(summary(4)).toEqual({
      soonTotal: 4, // 닭안심, 소고기 불고기용, 오이, 우유
      soonSaved: 3, // 소고기 불고기용만 못 씀
      buyAll: ['감자', '당근', '생크림', '상추'],
      lost: ['소고기 불고기용', '삼겹 베이컨'], // 카레가루는 카레의 상비 재료라 빠짐
    });
  });

  it('샘플 재고·집밥 2번 / 7번', () => {
    expect(summary(2)).toEqual({
      soonTotal: 4,
      soonSaved: 2,
      buyAll: ['감자', '당근', '생크림'],
      lost: ['소고기 불고기용', '오이', '삼겹살', '삼겹 베이컨', '대파', '만두'],
    });
    expect(summary(7)).toEqual({ soonTotal: 4, soonSaved: 4, buyAll: ['감자', '당근', '생크림', '상추'], lost: [] });
  });

  it('이미 확정한 끼니의 곧 상할 재료도 센다', () => {
    const plan = planOf({ mealsPerWeek: 4, doneMeals: [{ recipe: 'x', usedItems: [], soonUsed: ['a', 'b'], at: '' }] });
    const s = summarizePlan(makePlan(inv, PLAN_RECIPES, plan, today), inv, plan, today);
    expect(s.soonTotal).toBe(6);
  });
});
