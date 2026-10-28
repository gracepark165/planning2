import { describe, expect, it } from 'vitest';
import { findCatalog } from '../data';
import { loadState, saveState, STORAGE_KEY } from './persist';
import { initialState, newItemFromCatalog, reducer } from './store';

const today = '2026-10-27';

describe('재고 상태 바꾸기', () => {
  it('처음 상태는 샘플 재고 14개, 기록 없음, 집밥 4회', () => {
    const s = initialState(today);
    expect(s.items).toHaveLength(14);
    expect(s.logs).toEqual([]);
    expect(s.plan.mealsPerWeek).toBe(4);
  });

  it('직접 추가: 입고일 오늘, 소비기한 자동, 기본 수량·위치', () => {
    const item = newItemFromCatalog(findCatalog('감자')!, today, 'x1');
    expect(item).toMatchObject({
      name: '감자',
      qty: '3개',
      location: '실온',
      enteredAt: today,
      expiresAt: '2026-11-26', // 30일
      expiryBasis: 'table',
      source: 'manual',
      portioned: false,
    });
    const s = reducer(initialState(today), { type: 'addItems', items: [item] });
    expect(s.items.at(-1)?.id).toBe('x1');
  });

  it('소비기한 ±1일과 남은 양은 해당 재료만 바꾼다', () => {
    const s0 = initialState(today);
    const id = s0.items[0].id;
    const s1 = reducer(s0, { type: 'shiftExpiry', id, delta: 1 });
    expect(s1.items[0].expiresAt).toBe('2026-10-29');
    expect(s1.items[0].expiryBasis).toBe('user');
    expect(s1.items[1]).toBe(s0.items[1]);
    const s2 = reducer(s1, { type: 'setRemaining', id, remaining: '반쯤' });
    expect(s2.items[0].remaining).toBe('반쯤');
  });

  it('다 먹었어요 / 버렸어요: 재고에서 빼고 기록을 남긴다', () => {
    const s0 = initialState(today);
    const [a, b] = s0.items;
    const s1 = reducer(s0, { type: 'finishItem', id: a.id, action: 'eat', at: 't1' });
    const s2 = reducer(s1, { type: 'finishItem', id: b.id, action: 'discard', at: 't2' });
    expect(s2.items).toHaveLength(12);
    expect(s2.logs).toEqual([
      { itemId: a.id, action: 'eat', at: 't1' },
      { itemId: b.id, action: 'discard', at: 't2' },
    ]);
    // 없는 재료는 무시
    expect(reducer(s2, { type: 'finishItem', id: a.id, action: 'eat', at: 't3' })).toBe(s2);
  });

  it('처음 상태로 되돌리기', () => {
    const s1 = reducer(initialState(today), { type: 'finishItem', id: 'sample-1', action: 'eat', at: 't' });
    expect(reducer(s1, { type: 'reset', today })).toEqual(initialState(today));
  });
});

describe('기기 안 저장', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    } as Storage;
  };

  it('저장한 상태를 그대로 불러온다', () => {
    const st = memory();
    const s = initialState(today);
    saveState(s, st);
    expect(loadState(st)).toEqual(s);
  });

  it('예전에 다른 이름(달걀)으로 넣은 재료는 대표 이름으로 맞춰 불러온다', () => {
    const st = memory();
    const s = initialState(today);
    saveState({ ...s, items: s.items.map((i) => (i.name === '계란' ? { ...i, name: '달걀' } : i)) }, st);
    expect(loadState(st)).toEqual(s);
  });

  it('없거나 깨진 값이면 null', () => {
    const st = memory();
    expect(loadState(st)).toBeNull();
    st.setItem(STORAGE_KEY, '{망가짐');
    expect(loadState(st)).toBeNull();
    st.setItem(STORAGE_KEY, JSON.stringify({ items: 'x' }));
    expect(loadState(st)).toBeNull();
  });

  it('저장소를 못 쓰는 환경에서도 오류가 나지 않는다', () => {
    const broken = {
      getItem: () => { throw new Error('막힘'); },
      setItem: () => { throw new Error('막힘'); },
    } as unknown as Storage;
    expect(loadState(broken)).toBeNull();
    expect(() => saveState(initialState(today), broken)).not.toThrow();
  });
});

describe('이번 주 플랜 상태', () => {
  const curry = { name: '닭안심 버터카레', uses: ['닭안심'], keeps: ['양파', '카레가루', '버터'], buy: ['감자', '당근'] };
  const mandu = { name: '군만두와 오이무침', uses: ['만두', '오이'], keeps: [], buy: [] };

  it('집밥 횟수를 바꾸면 바꾸기 기록이 초기화된다', () => {
    let s = reducer(initialState(today), { type: 'swap', slotIndex: 0 });
    s = reducer(s, { type: 'swap', slotIndex: 0 });
    expect(s.plan.swapIndex).toEqual({ 0: 2 });
    s = reducer(s, { type: 'setMeals', mealsPerWeek: 6 });
    expect(s.plan).toMatchObject({ mealsPerWeek: 6, swapIndex: {} });
  });

  it('건너뛰기는 한 번만 기록되고, 다시 보기로 모두 지운다', () => {
    let s = reducer(initialState(today), { type: 'skip', recipe: '소불고기 덮밥' });
    s = reducer(s, { type: 'skip', recipe: '소불고기 덮밥' });
    expect(s.plan.rejectedRecipes).toEqual(['소불고기 덮밥']);
    s = reducer(s, { type: 'clearRejected' });
    expect(s.plan.rejectedRecipes).toEqual([]);
  });

  it('확정: 쓰는 재료를 재고에서 빼고, 먹었어요 기록을 남긴다', () => {
    const s0 = initialState(today);
    const s1 = reducer(s0, { type: 'confirmMeal', recipe: mandu, today, at: 'T1' });
    expect(s1.items.map((i) => i.name)).not.toContain('만두');
    expect(s1.items.map((i) => i.name)).not.toContain('오이');
    expect(s1.items).toHaveLength(12);
    expect(s1.logs.map((l) => l.action)).toEqual(['eat', 'eat']);
    expect(s1.plan.doneMeals).toHaveLength(1);
    expect(s1.plan.doneMeals[0]).toMatchObject({ recipe: '군만두와 오이무침', soonUsed: ['오이'], at: 'T1' });
  });

  it('상비 재료는 빼지 않는다', () => {
    const s1 = reducer(initialState(today), { type: 'confirmMeal', recipe: curry, today, at: 'T1' });
    expect(s1.items.map((i) => i.name)).toEqual(expect.arrayContaining(['양파', '카레가루', '버터']));
  });

  it('되돌리기: 재고와 기록이 확정 전과 같아진다 (순서만 다를 수 있음)', () => {
    const s0 = reducer(initialState(today), { type: 'finishItem', id: 'sample-3', action: 'discard', at: 'T0' });
    const s1 = reducer(s0, { type: 'confirmMeal', recipe: curry, today, at: 'T1' });
    const s2 = reducer(s1, { type: 'confirmMeal', recipe: mandu, today, at: 'T2' });
    const s3 = reducer(s2, { type: 'undoMeal', at: 'T1' }); // 카레만 되돌림
    expect(s3.items.map((i) => i.name)).toContain('닭안심');
    expect(s3.items.map((i) => i.name)).not.toContain('만두');
    expect(s3.plan.doneMeals.map((d) => d.recipe)).toEqual(['군만두와 오이무침']);
    expect(s3.logs.map((l) => l.at)).toEqual(['T0', 'T2']);
    const s4 = reducer(s3, { type: 'undoMeal', at: 'T2' });
    expect(reducer(s4, { type: 'undoMeal', at: 'T2' })).toBe(s4); // 두 번 눌러도 한 번만
    const byId = (xs: { id: string }[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
    expect(byId(s4.items)).toEqual(byId(s0.items));
    expect(s4.logs).toEqual(s0.logs);
    expect(s4.plan.doneMeals).toEqual([]);
  });

  it('소분 품목은 한 끼에 1개씩 줄고, 되돌리면 다시 늘어난다', () => {
    const portion = {
      ...newItemFromCatalog(findCatalog('닭안심')!, today, 'p1'),
      portioned: true, count: 3, unit: '덩이', qty: '소분 3덩이', location: '냉동' as const,
    };
    const base = { ...initialState(today), items: [portion] };
    const s1 = reducer(base, { type: 'confirmMeal', recipe: curry, today, at: 'T1' });
    expect(s1.items[0]).toMatchObject({ id: 'p1', count: 2, qty: '소분 2덩이' });
    const s2 = reducer(s1, { type: 'confirmMeal', recipe: curry, today, at: 'T2' });
    const s3 = reducer(s2, { type: 'confirmMeal', recipe: curry, today, at: 'T3' });
    expect(s3.items).toEqual([]); // 마지막 1덩이를 쓰면 재고에서 빠짐
    const back = reducer(reducer(s3, { type: 'undoMeal', at: 'T3' }), { type: 'undoMeal', at: 'T2' });
    expect(back.items[0]).toMatchObject({ id: 'p1', count: 2, qty: '소분 2덩이' });
  });
});

describe('저장한 뒤에 고치기', () => {
  it('잘못 넣었어요: 지우기만 하고 기록은 남기지 않는다', () => {
    const s = reducer(initialState(today), { type: 'removeItem', id: 'sample-1' });
    expect(s.items.map((i) => i.id)).not.toContain('sample-1');
    expect(s.logs).toEqual([]);
  });

  it('보관 위치 바꾸기', () => {
    const s = reducer(initialState(today), { type: 'setLocation', id: 'sample-1', location: '냉동' });
    expect(s.items[0].location).toBe('냉동');
  });

  it('소분 개수 ±: 1~30 안에서만, 수량 글자도 같이 바뀐다', () => {
    const portion = { ...initialState(today).items[6] }; // 대파 소분 1봉
    expect(portion).toMatchObject({ name: '대파', portioned: true, count: 1 });
    let s = initialState(today);
    s = reducer(s, { type: 'shiftCount', id: portion.id, delta: -1 });
    expect(s.items[6].count).toBe(1); // 1보다 작아지지 않음
    s = reducer(s, { type: 'shiftCount', id: portion.id, delta: 2 });
    expect(s.items[6]).toMatchObject({ count: 3, qty: '소분 3봉' });
    s = reducer(s, { type: 'shiftCount', id: portion.id, delta: 100 });
    expect(s.items[6].count).toBe(30);
  });

  it('소분이 아닌 재료는 개수를 바꾸지 않는다', () => {
    const s0 = initialState(today);
    expect(reducer(s0, { type: 'shiftCount', id: 'sample-1', delta: 1 })).toEqual(s0);
  });
});
