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
