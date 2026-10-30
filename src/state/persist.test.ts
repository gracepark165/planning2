import { describe, expect, it } from 'vitest';
import { loadState, migrate, saveState, STORAGE_KEY, STORAGE_VERSION } from './persist';
import { initialState } from './store';

const today = '2026-10-30';

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  } as Storage;
};

/** 저장 형식 v1 (버전 필드 없음) 그대로의 모습 */
const v1 = {
  items: [
    {
      id: 'sample-1', name: '닭안심', qty: '300g', core: '닭고기', location: '냉장',
      enteredAt: '2026-10-26', expiresAt: '2026-10-31', expiryBasis: 'label',
      remaining: '넉넉해요', source: 'order', portioned: false,
    },
    {
      id: 'sample-2', name: '우유', qty: '900ml', core: '', location: '냉장',
      enteredAt: '2026-10-24', expiresAt: '2026-11-03', expiryBasis: 'user',
      remaining: '반쯤', source: 'order', portioned: false,
    },
    {
      id: 'abc', name: '달걀', qty: '10구', core: '', location: '냉장',
      enteredAt: '2026-10-29', expiresAt: '2026-11-19', expiryBasis: 'table',
      remaining: '넉넉해요', source: 'manual', portioned: false,
    },
  ],
  logs: [{ itemId: 'x', action: 'discard', at: '2026-10-28T10:00:00.000Z' }],
  plan: { mealsPerWeek: 5, doneMeals: [], rejectedRecipes: ['소불고기 덮밥'], swapIndex: { 1: 2 } },
  myFoods: { 그래놀라: { name: '그래놀라', shelfDays: 60, location: '실온', group: 'grain' } },
};

describe('저장 형식 v1 → v2 옮기기', () => {
  const s = migrate(v1)!;

  it('예시 재료에 예시 표시, 근거는 "예시 재료" (직접 고친 값은 그대로)', () => {
    expect(s.items[0]).toMatchObject({ sample: true, expiryBasis: 'sample' });
    expect(s.items[1]).toMatchObject({ sample: true, expiryBasis: 'user', remaining: '반쯤' });
    expect(s.items[2].sample).toBeUndefined();
    expect(s.items[2]).toMatchObject({ name: '계란', expiryBasis: 'table' });
  });

  it('예전 기록은 상태 unknown, 버린 이유 null', () => {
    expect(s.logs).toEqual([
      { itemId: 'x', action: 'discard', at: '2026-10-28T10:00:00.000Z', stateAtAction: 'unknown', discardReason: null },
    ]);
  });

  it('플랜은 그대로, 고정 끼니는 빈 목록', () => {
    expect(s.plan).toEqual({ mealsPerWeek: 5, doneMeals: [], rejectedRecipes: ['소불고기 덮밥'], swapIndex: { 1: 2 }, pinned: [] });
    expect(s.myFoods).toEqual(v1.myFoods);
  });

  it('새 필드 기본값: 장보기 목록 비움, 이미 쓰던 사람이라 첫 사용 안내는 본 것으로, 알림 오후 6시', () => {
    expect(s.shoppingList).toEqual([]);
    expect(s.onboarding).toEqual({ seen: true, mode: 'sample' });
    expect(s.notif).toEqual({ askedAt: null, optedLater: false, time: '18:00', bannerClosedOn: null });
    expect(migrate({ ...v1, items: [v1.items[2]] })!.onboarding.mode).toBe('mine');
  });

  it('저장소에서 읽을 때도 옮기고, 다시 저장하면 v2로 저장된다', () => {
    const st = memory();
    st.setItem(STORAGE_KEY, JSON.stringify(v1));
    const loaded = loadState(st)!;
    expect(loaded).toEqual(s);
    saveState(loaded, st);
    expect(JSON.parse(st.getItem(STORAGE_KEY)!).version).toBe(STORAGE_VERSION);
    expect(loadState(st)).toEqual(s);
  });

  it('v2는 옮겨도 그대로 (예시 재료를 직접 고친 근거도 유지)', () => {
    const s0 = initialState(today);
    const s1 = { ...s0, items: s0.items.map((i, n) => (n === 0 ? { ...i, expiryBasis: 'table' as const } : i)) };
    expect(migrate({ version: 2, ...s1 })).toEqual(s1);
  });
});
