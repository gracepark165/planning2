import { describe, expect, it } from 'vitest';
import { PLAN_RECIPES } from '../data';
import { makeSampleInventory } from '../data/sampleInventory';
import { emptyPlan } from '../state/store';
import { addDays } from './date';
import { daysLeft } from './status';
import { coverageText, makePlan, minMealsToCover, reasonOf, summarizePlan, todayMeal, uncoveredSoon } from './plan';
import type { Item, Plan, Recipe } from './types';

const today = '2026-10-27';
const inv = makeSampleInventory(today);
const planOf = (p: Partial<Plan>): Plan => ({ ...emptyPlan(), ...p });
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

const names = (n: number, p: Partial<Plan> = {}) =>
  makePlan(inv, PLAN_RECIPES, planOf({ mealsPerWeek: n, ...p }), today).slots.map((s) => s.recipe?.name ?? null);

const CURRY = '닭안심 버터카레', MANDU = '군만두와 오이무침', BULGOGI = '소불고기 덮밥';
const PASTA = '새우 크림 파스타', SAMGYUP = '삼겹살 구이', BACON = '베이컨 계란볶음밥';
const days = (n: number, p: Partial<Plan> = {}) =>
  makePlan(inv, PLAN_RECIPES, planOf({ mealsPerWeek: n, ...p }), today).slots.map((s) => s.dayOffset);

// 샘플 재고의 얼른 먹어야 할 재료(남은 일수): 닭안심 1, 소고기 불고기용 2, 오이 2, 우유 3
describe('급한 재료 먼저 (A-4)', () => {
  it('집밥 4번: 얼른 먹어야 할 재료 4개를 모두, 급한 순서로 가장 빠른 날에', () => {
    expect(names(4)).toEqual([CURRY, MANDU, BULGOGI, PASTA]);
    expect(days(4)).toEqual([0, 1, 2, 3]);
    // 재료별로 쓰는 날: 닭안심 → 소고기 불고기용·오이 → 우유
    const { slots } = makePlan(inv, PLAN_RECIPES, planOf({ mealsPerWeek: 4 }), today);
    const dayOf = (name: string) => slots.find((s) => s.recipe?.uses.includes(name))!.dayOffset;
    expect(dayOf('닭안심')).toBe(0);
    expect([dayOf('소고기 불고기용'), dayOf('오이')].sort()).toEqual([1, 2]);
    expect(dayOf('우유')).toBe(3);
  });

  it('급한 재료를 다 배치한 뒤 남은 끼니는 남은 날에 고르게', () => {
    expect(names(5)).toEqual([CURRY, MANDU, BULGOGI, PASTA, SAMGYUP]);
    expect(days(5)).toEqual([0, 1, 2, 3, 4]);
    expect(days(6)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(names(7).slice(0, 6)).toEqual([CURRY, MANDU, BULGOGI, PASTA, SAMGYUP, BACON]);
    expect(days(7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('급한 재료가 없으면 예전처럼 한 주에 고르게 펴진다', () => {
    const calm = inv.filter((i) => !['닭안심', '소고기 불고기용', '오이', '우유'].includes(i.name));
    const d = (n: number) => makePlan(calm, PLAN_RECIPES, planOf({ mealsPerWeek: n }), today).slots.map((s) => s.dayOffset);
    expect(d(4)).toEqual([0, 1, 3, 5]);
    expect(d(2)).toEqual([0, 3]);
    expect(d(7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('집밥이 적으면 급한 순서대로 채우고 남는 재료를 알려준다', () => {
    expect(names(3)).toEqual([CURRY, MANDU, BULGOGI]);
    expect(names(2)).toEqual([CURRY, MANDU]);
  });

  it('어떤 집밥 횟수·바꾸기에서도 소비기한이 지난 날에 그 재료를 쓰지 않는다', () => {
    for (let n = 1; n <= 7; n++) {
      for (const swap of [{}, { 0: 1 }, { 1: 1 }, { 2: 2 }, { 0: 3, 3: 1 }] as Record<number, number>[]) {
        const { slots } = makePlan(inv, PLAN_RECIPES, planOf({ mealsPerWeek: n, swapIndex: swap }), today);
        for (const s of slots)
          for (const u of s.recipe?.uses ?? []) {
            const left = Math.min(...inv.filter((i) => i.name === u).map((i) => daysLeft(i, today)));
            expect(left, `${n}번 ${s.recipe!.name} ${u}`).toBeGreaterThanOrEqual(s.dayOffset);
          }
        // 하루에 한 끼
        expect(new Set(slots.map((s) => s.dayOffset)).size).toBe(slots.length);
      }
    }
  });

  it('얼른 먹어야 할 재료 두 개를 같이 쓰는 레시피에 가점', () => {
    const items = [item('A', 2, 0), item('Z1', 30, 20), item('Z2', 30, 20), item('B', 2, 0), item('C', 3, 0)];
    // 급함 점수만 보면 A+Z1+Z2(8+5+5=18)가 B+C(8+7=15)보다 높지만, 얼른 먹어야 할 재료를 2개 쓰는 쪽을 먼저
    const recipes = [rec('A요리', ['A', 'Z1', 'Z2']), rec('B+C요리', ['B', 'C'])];
    const { slots } = makePlan(items, recipes, planOf({ mealsPerWeek: 1 }), today);
    expect(slots[0].recipe?.name).toBe('B+C요리');
  });

  it('오늘 이미 먹은 끼니가 있으면 다음 끼니는 내일부터', () => {
    const done = [{ recipe: CURRY, usedItems: [], soonUsed: ['닭안심'], at: 'T', date: today }];
    const items = inv.filter((i) => i.name !== '닭안심');
    const { slots } = makePlan(items, PLAN_RECIPES, planOf({ mealsPerWeek: 4, doneMeals: done }), today);
    expect(slots.map((s) => s.dayOffset)).toEqual([1, 2, 3]);
    expect(slots.map((s) => s.recipe?.name)).toEqual([MANDU, BULGOGI, PASTA]);
  });
});

describe('다 못 쓸 때 안내 (A-4)', () => {
  const cover = (n: number, p: Partial<Plan> = {}) => {
    const plan = planOf({ mealsPerWeek: n, ...p });
    const result = makePlan(inv, PLAN_RECIPES, plan, today);
    return { left: uncoveredSoon(result, inv, today), m: minMealsToCover(inv, PLAN_RECIPES, plan, today) };
  };

  it('집밥 3번: 우유가 남고, 4번이면 모두 먹을 수 있다', () => {
    expect(cover(3)).toEqual({ left: ['우유'], m: 4 });
    expect(coverageText(['우유'], 4)).toBe('얼른 먹어야 할 재료 1개(우유)가 남아요. 집밥을 4번으로 늘리면 모두 먹을 수 있어요.');
  });

  it('집밥 2번: 두 개가 남는다', () => {
    expect(cover(2)).toEqual({ left: ['소고기 불고기용', '우유'], m: 4 });
  });

  it('집밥 4번 이상이면 안내하지 않는다', () => {
    for (const n of [4, 5, 6, 7]) expect(cover(n).left).toEqual([]);
    expect(cover(4).m).toBe(4);
  });

  it('7번으로도 안 되면 "따로 챙겨 드세요"만', () => {
    expect(cover(4, { rejectedRecipes: [PASTA] })).toEqual({ left: ['우유'], m: null });
    expect(coverageText(['우유', '오이'], null)).toBe('얼른 먹어야 할 재료 2개(우유, 오이)가 남아요. 따로 챙겨 드세요.');
  });
});

describe('바꾸기·건너뛰기', () => {
  it('바꾸기: 그 끼니의 다음 후보', () => {
    expect(names(4, { swapIndex: { 1: 1 } })).toEqual([CURRY, BULGOGI, MANDU, PASTA]);
  });

  it('바꾸기를 후보 수만큼 누르면 처음으로 돌아온다', () => {
    const n = makePlan(inv, PLAN_RECIPES, planOf({ mealsPerWeek: 4 }), today).slots[0].candidateCount;
    expect(names(4, { swapIndex: { 0: n } })).toEqual(names(4));
  });

  it('건너뛰기: 그 레시피는 이번 주 후보에서 빠진다', () => {
    expect(names(4, { rejectedRecipes: [BULGOGI] })).not.toContain(BULGOGI);
    expect(names(5, { rejectedRecipes: [CURRY] })).not.toContain(CURRY);
  });

});

describe('배치 이유', () => {
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
  it('쓰는 재료의 남은 일수가 그날보다 짧으면 그날에는 배치하지 않는다', () => {
    const items = [item('두부', 1, 0)];
    const { slots } = makePlan(items, [rec('두부부침', ['두부'])], planOf({ mealsPerWeek: 2 }), today);
    // 두부는 1일 남음 → 오늘 배치. (이미 써서 다음 끼니는 비어 있음)
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

  it('소분 품목이 여러 끼에 쓰이면 메뉴가 겹치지 않게 다른 레시피 먼저', () => {
    const items = [item('닭가슴살', 90, 0, { portioned: true, count: 3, unit: '봉', qty: '소분 3봉' })];
    const recipes = [rec('볶음밥', ['닭가슴살']), rec('카레', ['닭가슴살']), rec('샐러드', ['닭가슴살'])];
    const { slots } = makePlan(items, recipes, planOf({ mealsPerWeek: 3 }), today);
    expect(slots.map((s) => s.recipe?.name)).toEqual(['볶음밥', '카레', '샐러드']);
    // 이미 확정한 메뉴도 뒤로 간다
    const done = [{ recipe: '볶음밥', usedItems: [], soonUsed: [], at: '', date: addDays(today, -1) }];
    const after = makePlan(items, recipes, planOf({ mealsPerWeek: 3, doneMeals: done }), today);
    expect(after.slots.map((s) => s.recipe?.name)).toEqual(['카레', '샐러드']);
  });

  it('이번 주에 이미 확정한 끼니 수만큼 앞 끼니는 건너뛴다', () => {
    const done = [{ recipe: 'x', usedItems: [], soonUsed: [], at: '', date: addDays(today, -1) }]; // 10/26(월)
    const { slots } = makePlan(inv, PLAN_RECIPES, planOf({ mealsPerWeek: 4, doneMeals: done }), today);
    expect(slots.map((s) => s.index)).toEqual([1, 2, 3]);
  });

  it('지난주에 확정한 끼니·날짜 없는 예전 기록은 세지 않는다 (주가 바뀌면 플랜이 다시 N끼)', () => {
    const old = [1, 2, 3, 4].map((n) => ({ recipe: `x${n}`, usedItems: [], soonUsed: ['a'], at: '', date: addDays(today, -1 - n) }));
    const noDate = [{ recipe: 'y', usedItems: [], soonUsed: [], at: '' }];
    const plan = planOf({ mealsPerWeek: 4, doneMeals: [...old, ...noDate] });
    const result = makePlan(inv, PLAN_RECIPES, plan, today);
    expect(result.slots).toHaveLength(4);
    expect(summarizePlan(result, inv, plan, today).soonTotal).toBe(4); // 지난주에 쓴 재료는 세지 않음
  });

  it('같은 입력이면 같은 결과', () => {
    const p = planOf({ mealsPerWeek: 4 });
    expect(makePlan(inv, PLAN_RECIPES, p, today)).toEqual(makePlan(inv, PLAN_RECIPES, p, today));
  });
});

describe('플랜 요약', () => {
  // 계산 규칙은 프로토타입 planView와 같고, 플랜은 급한 재료 먼저(A-4)로 짠 결과
  const summary = (n: number) => {
    const plan = planOf({ mealsPerWeek: n });
    const s = summarizePlan(makePlan(inv, PLAN_RECIPES, plan, today), inv, plan, today);
    return { ...s, lost: s.lost.map((i) => i.name) };
  };

  it('샘플 재고·집밥 4번: 얼른 먹어야 할 재료 4개를 모두 쓴다', () => {
    expect(summary(4)).toEqual({
      soonTotal: 4, // 닭안심, 소고기 불고기용, 오이, 우유
      soonSaved: 4,
      buyAll: ['감자', '당근', '생크림'],
      lost: ['삼겹살', '삼겹 베이컨'], // 대파는 소불고기의 상비 재료라 빠짐
    });
  });

  it('샘플 재고·집밥 2번 / 7번', () => {
    expect(summary(2)).toEqual({
      soonTotal: 4,
      soonSaved: 2,
      buyAll: ['감자', '당근'],
      lost: ['소고기 불고기용', '우유', '삼겹살', '삼겹 베이컨', '대파', '새우살'],
    });
    expect(summary(7)).toEqual({ soonTotal: 4, soonSaved: 4, buyAll: ['감자', '당근', '생크림', '상추'], lost: [] });
  });

  it('이미 확정한 끼니의 곧 상할 재료도 센다', () => {
    const plan = planOf({
      mealsPerWeek: 4,
      doneMeals: [{ recipe: 'x', usedItems: [], soonUsed: ['a', 'b'], at: '', date: addDays(today, -1) }],
    });
    const s = summarizePlan(makePlan(inv, PLAN_RECIPES, plan, today), inv, plan, today);
    expect(s.soonTotal).toBe(6);
  });
});

describe('오늘의 한 끼 (B-2): 플랜의 오늘 끼니를 그대로 쓴다', () => {
  const at = (items: Item[], p: Partial<Plan> = {}) => {
    const plan = planOf({ mealsPerWeek: 4, ...p });
    return todayMeal(makePlan(items, PLAN_RECIPES, plan, today), plan, items, today);
  };

  it('추천: 플랜의 첫 끼니(오늘)와 같은 메뉴', () => {
    const t = at(inv);
    expect(t.kind).toBe('suggest');
    if (t.kind === 'suggest') expect(t.slot).toMatchObject({ index: 0, dayOffset: 0, recipe: { name: CURRY } });
  });

  it('다른 메뉴 = 오늘 끼니의 바꾸기', () => {
    const t = at(inv, { swapIndex: { 0: 1 } });
    expect(t.kind === 'suggest' && t.slot.recipe.name).toBe(names(4, { swapIndex: { 0: 1 } })[0]);
  });

  it('오늘 확정한 끼니가 있으면 완료 (가장 최근 것)', () => {
    const done = [
      { recipe: 'x', usedItems: [], soonUsed: [], at: 'T0', date: addDays(today, -1) },
      { recipe: CURRY, usedItems: [], soonUsed: [], at: 'T1', date: today },
    ];
    expect(at(inv, { doneMeals: done })).toEqual({ kind: 'done', meal: done[1] });
    // 어제 먹은 것만 있으면 오늘은 다시 추천
    expect(at(inv, { doneMeals: [done[0]] }).kind).toBe('suggest');
  });

  it('급한 재료가 없고 오늘 끼니가 "가볍게 먹어요"면 한 줄 안내', () => {
    const calm = [item('계란', 20, 0), item('대파', 10, 0)];
    expect(at(calm)).toEqual({ kind: 'calm' });
  });

  it('급한 재료가 있으면 가볍게 먹는 메뉴라도 추천으로 보여준다', () => {
    const t = at([item('계란', 20, 0), item('대파', 10, 0), item('두부', 1, 0)]);
    expect(t.kind === 'suggest' && t.slot.recipe.name).toBe('계란말이 한 끼');
  });

  it('만들 수 있는 메뉴가 없거나 이번 주 끼니를 다 먹었으면 none', () => {
    expect(at([])).toEqual({ kind: 'none' });
    const done = [{ recipe: 'x', usedItems: [], soonUsed: [], at: 'T', date: addDays(today, -1) }]; // 이번 주 월요일
    expect(at(inv, { mealsPerWeek: 1, doneMeals: done })).toEqual({ kind: 'none' });
  });
});

describe('영상에서 넣은 고정 끼니 (B-1)', () => {
  const curry = {
    id: 'v1', name: '버터크림치킨카레', uses: ['닭안심', '우유'], keeps: ['카레가루', '양파', '버터'], buy: [],
    source: 'video' as const, url: 'u', title: '버터크림치킨카레',
  };
  const plan4 = (p: Partial<Plan> = {}) => makePlan(inv, PLAN_RECIPES, planOf({ mealsPerWeek: 4, pinned: [curry], ...p }), today);

  it('가장 급한 재료(닭안심 D-1)의 기한 안에서 가장 가까운 빈 날에, 나머지는 그 주변에', () => {
    const { slots } = plan4();
    expect(slots.map((s) => [s.dayOffset, s.recipe?.name])).toEqual([
      [0, '버터크림치킨카레'],
      [1, MANDU],
      [2, BULGOGI],
      [3, SAMGYUP], // 우유는 영상 메뉴가 써서 파스타 대신 다음 후보
    ]);
    expect(slots[0]).toMatchObject({ pinned: curry, candidateCount: 1 });
  });

  it('급하지 않은 영상 메뉴는 얼른 먹어야 할 재료 끼니를 밀어내지 않는다 (자기 재료 기한 안의 가장 빠른 빈 날)', () => {
    const jeyuk = { ...curry, id: 'v3', name: '제육볶음', uses: ['삼겹살', '대파'], keeps: ['양파'], buy: ['고추장'] };
    const { slots } = makePlan(inv, PLAN_RECIPES, planOf({ mealsPerWeek: 4, pinned: [jeyuk] }), today);
    expect(slots.map((s) => [s.dayOffset, s.recipe?.name])).toEqual([
      [0, CURRY],
      [1, MANDU],
      [2, PASTA], // 대파(소분 1봉)를 제육볶음이 써서 소불고기 덮밥(대파 상비)은 못 만듦 → 우유 쓰는 파스타
      [3, '제육볶음'], // 급한 재료 끼니 다음, 삼겹살·대파 D-5 안
    ]);
    // 닭안심이 오늘까지여도 오늘은 닭안심 끼니
    const todayOnly = inv.map((i) => (i.name === '닭안심' ? { ...i, expiresAt: today } : i));
    const t = makePlan(todayOnly, PLAN_RECIPES, planOf({ mealsPerWeek: 4, pinned: [jeyuk] }), today);
    expect(t.slots[0].recipe?.name).toBe(CURRY);
  });

  it('영상 메뉴가 얼른 먹어야 할 재료를 쓰면 급한 순서대로 경쟁한다', () => {
    // 버터크림치킨카레(닭안심 D-1)는 오이·소고기(D-2)보다 급해서 오늘
    const { slots } = plan4();
    expect(slots[0].recipe?.name).toBe('버터크림치킨카레');
  });

  it('고정 끼니는 다시 짜도(바꾸기·집밥 횟수) 그대로, 바꾸기 기록은 다른 끼니에만', () => {
    const { slots } = plan4({ swapIndex: { 0: 3, 1: 1 } });
    expect(slots[0].recipe?.name).toBe('버터크림치킨카레');
    expect(makePlan(inv, PLAN_RECIPES, planOf({ mealsPerWeek: 6, pinned: [curry] }), today).slots[0].recipe?.name).toBe(
      '버터크림치킨카레',
    );
  });

  it('오늘 한 끼로 고른 영상 메뉴는 오늘에', () => {
    const later = { ...curry, id: 'v2', name: '삼겹 덮밥', uses: ['삼겹살'], keeps: [] };
    const { slots } = makePlan(inv, PLAN_RECIPES, planOf({ mealsPerWeek: 4, pinned: [{ ...later, date: today }] }), today);
    expect(slots[0]).toMatchObject({ dayOffset: 0, recipe: { name: '삼겹 덮밥' } });
    // 날짜가 지난 "오늘"은 무시하고 다시 배치 (급한 재료 끼니 다음, 삼겹살 기한 안)
    const stale = makePlan(inv, PLAN_RECIPES, planOf({ mealsPerWeek: 4, pinned: [{ ...later, date: addDays(today, -1) }] }), today);
    expect(stale.slots.find((s) => s.pinned)!.dayOffset).toBe(3);
  });

  it('오늘의 한 끼도 고정 끼니를 그대로 보여준다', () => {
    const plan = planOf({ mealsPerWeek: 4, pinned: [curry] });
    const t = todayMeal(makePlan(inv, PLAN_RECIPES, plan, today), plan, inv, today);
    expect(t.kind === 'suggest' && t.slot.recipe.name).toBe('버터크림치킨카레');
  });

  it('고정 끼니의 사야 할 재료도 한 번에 사야 할 재료에 들어간다', () => {
    const jeyuk = { ...curry, id: 'v3', name: '제육볶음', uses: ['삼겹살', '대파'], keeps: ['양파'], buy: ['고추장'] };
    const plan = planOf({ mealsPerWeek: 4, pinned: [jeyuk] });
    expect(summarizePlan(makePlan(inv, PLAN_RECIPES, plan, today), inv, plan, today).buyAll).toContain('고추장');
  });
});
