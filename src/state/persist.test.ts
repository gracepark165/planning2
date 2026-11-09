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

  it('예시 재료(sample- id)는 지우고 직접 넣은 재료만 남긴다 (v4, 빈 냉장고로 시작)', () => {
    expect(s.items).toHaveLength(1);
    expect(s.items[0].sample).toBeUndefined();
    expect(s.items[0]).toMatchObject({ name: '계란', expiryBasis: 'table' });
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
    expect(s.onboarding).toEqual({ introSeen: true, seen: true, mode: 'mine', sampleAsked: false, firstConfirmAt: null });
    expect(s.opens).toEqual({ count: 0, lastDate: null });
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

  it('1단계로 저장한 v2(오프닝·sampleAsked 없음)는 기본값으로 채운다', () => {
    const s0 = initialState(today);
    const old = { seen: true, mode: 'sample' }; // 1단계 때 저장된 모양
    expect(migrate({ version: 2, ...s0, onboarding: old })!.onboarding).toEqual({
      introSeen: true, // 이미 쓰던 사람에게는 오프닝을 보여주지 않는다
      seen: true,
      mode: 'sample',
      sampleAsked: false,
      firstConfirmAt: null,
    });
  });

  it('v2는 예시 재료만 빠지고 나머지는 그대로', () => {
    const s0 = initialState(today);
    const mine = { ...s0.items[0], id: 'm1', sample: undefined, expiryBasis: 'table' as const };
    const s1 = { ...s0, items: [...s0.items, mine] };
    expect(migrate({ version: 2, ...s1 })).toEqual({ ...s1, items: [mine] });
  });
});

describe('저장 형식 v2 → v3 (V3-5)', () => {
  it('열어 본 날 수·처음 확정 시각을 채우고, 이미 물어본 사람은 다시 묻지 않는다', () => {
    const s0 = initialState(today);
    const { opens: _o, ...v2 } = { ...s0, onboarding: { introSeen: true, seen: true, mode: 'sample' as const, sampleAsked: false } };
    const asked = { ...v2, notif: { ...s0.notif, askedAt: 'T' } };
    const s = migrate({ version: 2, ...asked })!;
    expect(s.opens).toEqual({ count: 0, lastDate: null });
    expect(s.onboarding.firstConfirmAt).toBeNull();
    expect(s.notif.askedAt).toBe('T');
  });
});

describe('저장 형식 v3 → v4 (2026-11-09: 예시 재료 지우기)', () => {
  it('v3까지 저장된 예시 재료는 한 번 지우고, v4에서 되돌리기로 넣은 예시 재료는 그대로 둔다', () => {
    const s0 = initialState(today);
    expect(s0.items.some((i) => i.sample)).toBe(true);
    expect(migrate({ version: 3, ...s0 })!.items).toEqual([]);
    expect(migrate({ version: 4, ...s0 })).toEqual(s0);
    expect(STORAGE_VERSION).toBe(4);
  });
});
