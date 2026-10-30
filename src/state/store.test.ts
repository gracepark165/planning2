import { describe, expect, it } from 'vitest';
import { findCatalog } from '../data';
import { addDays } from '../rules/date';
import { loadState, saveState, STORAGE_KEY } from './persist';
import { discardLabel } from '../rules/logs';
import { DISCARD_REASONS } from '../rules/constants';
import {
  initialState,
  newItemFromCatalog,
  newItemFromPick,
  reducer,
  showIntro,
  showNotifAsk,
  showOnboarding,
  showSamplePrompt,
  soonBanner,
} from './store';

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
    const s1 = reducer(s0, { type: 'finishItem', id: a.id, action: 'eat', today, at: 't1' });
    const s2 = reducer(s1, { type: 'finishItem', id: b.id, action: 'discard', today, at: 't2' });
    expect(s2.items).toHaveLength(12);
    expect(s2.logs).toEqual([
      // 기록할 때 상태를 같이 남긴다 (닭안심 D-1, 소고기 D-2 → 오늘 내일 해요)
      { itemId: a.id, name: '닭안심', action: 'eat', at: 't1', stateAtAction: 'soon', discardReason: null },
      { itemId: b.id, name: '소고기 불고기용', action: 'discard', at: 't2', stateAtAction: 'soon', discardReason: null },
    ]);
    // 없는 재료는 무시
    expect(reducer(s2, { type: 'finishItem', id: a.id, action: 'eat', today, at: 't3' })).toBe(s2);
  });

  it('처음 상태로 되돌리기', () => {
    const s1 = reducer(initialState(today), { type: 'finishItem', id: 'sample-1', action: 'eat', today, at: 't' });
    expect(reducer(s1, { type: 'reset', today })).toEqual(initialState(today));
  });

  it('처음 상태로 되돌려도 첫 사용 안내·알림 설정은 다시 묻지 않는다', () => {
    const s0 = initialState(today);
    const s1 = {
      ...s0,
      onboarding: { introSeen: true, seen: true, mode: 'mine' as const, sampleAsked: true, firstConfirmAt: null },
      notif: { ...s0.notif, optedLater: true, bannerClosedOn: today },
    };
    const s2 = reducer(s1, { type: 'reset', today });
    expect(s2.onboarding).toEqual(s1.onboarding);
    expect(s2.notif).toEqual(s1.notif);
    expect(s2.items).toEqual(s0.items);
  });

  it('이번 주 확정으로 뺀 재료도 상태를 같이 기록한다', () => {
    const s = reducer(initialState(today), {
      type: 'confirmMeal',
      recipe: { name: '닭안심 버터카레', uses: ['닭안심'], keeps: [], buy: [] },
      today,
      at: 'T',
    });
    expect(s.logs).toEqual([
      { itemId: 'sample-1', name: '닭안심', action: 'eat', at: 'T', stateAtAction: 'soon', discardReason: null },
    ]);
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
    expect(s1.plan.doneMeals[0]).toMatchObject({ recipe: '군만두와 오이무침', soonUsed: ['오이'], at: 'T1', date: today });
  });

  it('상비 재료는 빼지 않는다', () => {
    const s1 = reducer(initialState(today), { type: 'confirmMeal', recipe: curry, today, at: 'T1' });
    expect(s1.items.map((i) => i.name)).toEqual(expect.arrayContaining(['양파', '카레가루', '버터']));
  });

  it('되돌리기: 재고와 기록이 확정 전과 같아진다 (순서만 다를 수 있음)', () => {
    const s0 = reducer(initialState(today), { type: 'finishItem', id: 'sample-3', action: 'discard', today, at: 'T0' });
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

describe('첫 사용 안내 (B-6)', () => {
  const mine = newItemFromCatalog(findCatalog('감자')!, today, 'm1');

  it('처음 열면 안내 카드를 보여주고, 예시 재료에는 예시 표시가 있다', () => {
    const s = initialState(today);
    expect(showOnboarding(s)).toBe(true);
    expect(s.onboarding).toEqual({ introSeen: false, seen: false, mode: 'sample', sampleAsked: false, firstConfirmAt: null });
    expect(s.items.every((i) => i.sample)).toBe(true);
  });

  it('예시로 둘러볼게요: 카드만 닫고 예시 재료는 그대로', () => {
    const s0 = initialState(today);
    const s = reducer(s0, { type: 'onboard', mode: 'sample' });
    expect(showOnboarding(s)).toBe(false);
    expect(s.onboarding).toMatchObject({ seen: true, mode: 'sample' });
    expect(s.items).toEqual(s0.items);
  });

  it('내 재료로 시작할게요: 예시 재료만 지운다 (내 재료·지난번 값은 남김)', () => {
    const s0 = reducer(initialState(today), { type: 'addItems', items: [mine] });
    const s = reducer(s0, { type: 'onboard', mode: 'mine' });
    expect(showOnboarding(s)).toBe(false);
    expect(s.onboarding).toMatchObject({ seen: true, mode: 'mine' });
    expect(s.items).toEqual([mine]);
    expect(s.myFoods).toEqual(s0.myFoods);
  });

  it('내 재료를 하나라도 넣으면 "예시 재료는 지울까요?"를 한 번 묻는다', () => {
    const looked = reducer(initialState(today), { type: 'onboard', mode: 'sample' });
    expect(showSamplePrompt(looked)).toBe(false); // 예시 재료만 있을 때는 묻지 않음
    const added = reducer(looked, { type: 'addItems', items: [mine] });
    expect(showSamplePrompt(added)).toBe(true);
    // 첫 안내 카드를 아직 안 골랐으면 그 카드가 먼저
    expect(showSamplePrompt(reducer(initialState(today), { type: 'addItems', items: [mine] }))).toBe(false);
  });

  it('지우기: 예시 재료만 지우고 다시 묻지 않는다', () => {
    const added = reducer(reducer(initialState(today), { type: 'onboard', mode: 'sample' }), { type: 'addItems', items: [mine] });
    const s = reducer(added, { type: 'answerSamplePrompt', remove: true });
    expect(s.items).toEqual([mine]);
    expect(s.onboarding.sampleAsked).toBe(true);
    expect(showSamplePrompt(s)).toBe(false);
  });

  it('놔둘게요: 예시 재료를 두고 다시 묻지 않는다 (예시 재료로 되돌려도)', () => {
    const added = reducer(reducer(initialState(today), { type: 'onboard', mode: 'sample' }), { type: 'addItems', items: [mine] });
    const s = reducer(added, { type: 'answerSamplePrompt', remove: false });
    expect(s.items).toEqual(added.items);
    expect(showSamplePrompt(s)).toBe(false);
    const reset = reducer(reducer(s, { type: 'reset', today }), { type: 'addItems', items: [mine] });
    expect(showOnboarding(reset)).toBe(false);
    expect(showSamplePrompt(reset)).toBe(false);
  });
});

describe('오프닝 화면', () => {
  it('처음 열면 오프닝 화면, 시작하기를 누르면 다시 안 나온다', () => {
    const s0 = initialState(today);
    expect(showIntro(s0)).toBe(true);
    const s1 = reducer(s0, { type: 'finishIntro' });
    expect(showIntro(s1)).toBe(false);
    // 오프닝 다음에 첫 사용 안내 카드
    expect(showOnboarding(s1)).toBe(true);
    expect(s1.items).toEqual(s0.items);
  });

  it('예시 재료로 되돌려도 오프닝은 다시 안 나온다', () => {
    const s = reducer(reducer(initialState(today), { type: 'finishIntro' }), { type: 'reset', today });
    expect(showIntro(s)).toBe(false);
  });
});

describe('영상 메뉴 → 플랜·장보기 목록 (B-1)', () => {
  const curry = { id: 'v1', name: '버터크림치킨카레', uses: ['닭안심', '우유'], keeps: ['카레가루', '양파', '버터'], buy: [],
    source: 'video' as const, url: 'u', title: '버터크림치킨카레' };
  const jeyuk = { ...curry, id: 'v2', name: '제육볶음', uses: ['삼겹살', '대파'], keeps: ['양파'], buy: ['고추장'] };

  it('이번 주 플랜에 넣기: 고정 끼니로, 사야 할 재료는 장보기 목록에 (영상)', () => {
    const s = reducer(initialState(today), { type: 'pinMeal', meal: jeyuk, mealsPerWeek: 4 });
    expect(s.plan.pinned).toEqual([jeyuk]);
    expect(s.plan.mealsPerWeek).toBe(4);
    expect(s.shoppingList).toEqual([{ name: '고추장', from: 'video', checked: false }]);
  });

  it('집밥 횟수는 정해 준 값으로 (fitPin이 정함, 최대 7)', () => {
    expect(reducer(initialState(today), { type: 'pinMeal', meal: jeyuk, mealsPerWeek: 5 }).plan.mealsPerWeek).toBe(5);
    expect(reducer(initialState(today), { type: 'pinMeal', meal: jeyuk, mealsPerWeek: 9 }).plan.mealsPerWeek).toBe(7);
  });

  it('되돌리기(undoPin): 고정 끼니가 빠지고 집밥 횟수·장보기 목록이 넣기 전으로', () => {
    const s0 = initialState(today);
    const s1 = reducer(s0, { type: 'pinMeal', meal: jeyuk, mealsPerWeek: 5 });
    expect(s1.shoppingList).toHaveLength(1);
    const s2 = reducer(s1, { type: 'undoPin', id: jeyuk.id, mealsPerWeek: 4, shoppingList: s0.shoppingList });
    expect(s2.plan).toEqual({ ...s0.plan, mealsPerWeek: 4 });
    expect(s2.shoppingList).toEqual([]);
  });

  it('확정하면 쓰는 재료가 빠지고 고정 끼니는 완료로, 되돌리면 고정 끼니도 돌아온다', () => {
    const s1 = reducer(initialState(today), { type: 'pinMeal', meal: curry, mealsPerWeek: 4 });
    const s2 = reducer(s1, { type: 'confirmMeal', recipe: curry, today, at: 'T' });
    expect(s2.items.map((i) => i.name)).not.toContain('닭안심');
    expect(s2.items.map((i) => i.name)).toContain('카레가루');
    expect(s2.plan.pinned).toEqual([]);
    expect(s2.plan.doneMeals[0]).toMatchObject({ recipe: '버터크림치킨카레', pinned: curry });
    const s3 = reducer(s2, { type: 'undoMeal', at: 'T' });
    expect(s3.plan.pinned).toEqual([curry]);
    expect(s3.items.map((i) => i.name)).toContain('닭안심');
  });

  it('건너뛰기 = 영상 메뉴 지우기', () => {
    const s = reducer(reducer(initialState(today), { type: 'pinMeal', meal: curry, mealsPerWeek: 4 }), { type: 'removePinned', id: 'v1' });
    expect(s.plan.pinned).toEqual([]);
  });

  it('장보기 목록: 체크, ✕로 지우기(플랜 재료는 숨김), 냉장고에 넣으면 목록에서 빠진다', () => {
    let s = reducer(initialState(today), { type: 'pinMeal', meal: jeyuk, mealsPerWeek: 4 });
    s = reducer(s, { type: 'toggleShopping', name: '고추장' });
    expect(s.shoppingList).toEqual([{ name: '고추장', from: 'video', checked: true }]);
    s = reducer(s, { type: 'toggleShopping', name: '감자' }); // 플랜에서 온 재료를 체크
    expect(s.shoppingList.at(-1)).toEqual({ name: '감자', from: 'plan', checked: true });
    s = reducer(s, { type: 'removeShopping', name: '당근' }); // 플랜 재료를 ✕
    expect(s.shoppingList.at(-1)).toEqual({ name: '당근', from: 'plan', checked: false, removed: true });
    s = reducer(s, { type: 'removeShopping', name: '고추장' }); // 영상 재료를 ✕
    expect(s.shoppingList.map((i) => i.name)).not.toContain('고추장');
    s = reducer(s, { type: 'addItems', items: [newItemFromCatalog(findCatalog('감자')!, today, 'g1')] });
    expect(s.shoppingList.map((i) => i.name)).not.toContain('감자');
  });
});

describe('폐기 이유 (B-4)', () => {
  const discarded = () => reducer(initialState(today), { type: 'finishItem', id: 'sample-3', action: 'discard', today, at: 'T1' });

  it('칩은 상했어요·맛·식감이 변했어요·깜빡했어요·너무 많이 샀어요·기타', () => {
    expect(DISCARD_REASONS).toEqual(['상했어요', '맛·식감이 변했어요', '깜빡했어요', '너무 많이 샀어요', '기타']);
  });

  it('버렸어요 → 칩 하나로 이유를 붙인다', () => {
    const s = reducer(discarded(), { type: 'setDiscardReason', itemId: 'sample-3', at: 'T1', reason: '깜빡했어요' });
    expect(s.logs).toEqual([
      { itemId: 'sample-3', name: '오이', action: 'discard', at: 'T1', stateAtAction: 'soon', discardReason: '깜빡했어요' },
    ]);
    expect(discardLabel(s.logs[0])).toBe('버렸어요 · 깜빡했어요');
  });

  it('건너뛰기(이유 없음)는 null', () => {
    expect(discarded().logs[0].discardReason).toBeNull();
    expect(discardLabel(discarded().logs[0])).toBe('버렸어요');
  });

  it('다 먹었어요 기록에는 이유를 붙이지 않는다', () => {
    const s0 = reducer(initialState(today), { type: 'finishItem', id: 'sample-3', action: 'eat', today, at: 'T1' });
    expect(reducer(s0, { type: 'setDiscardReason', itemId: 'sample-3', at: 'T1', reason: '기타' })).toBe(s0);
  });

  it('새로고침해도 유지된다', () => {
    const m = new Map<string, string>();
    const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } as Storage;
    const s = reducer(discarded(), { type: 'setDiscardReason', itemId: 'sample-3', at: 'T1', reason: '깜빡했어요' });
    saveState(s, st);
    expect(loadState(st)!.logs[0].discardReason).toBe('깜빡했어요');
  });
});

describe('알림 A단계 (B-3)', () => {
  const onboarded = () => reducer(reducer(initialState(today), { type: 'finishIntro' }), { type: 'onboard', mode: 'sample' });
  /** 홈 화면 추가 카드가 뜬 상태 (세 번째로 연 날) */
  const ready = () => [0, 1, 2].reduce((s, d) => reducer(s, { type: 'appOpened', today: addDays(today, d) }), onboarded());

  it('처음 열면 소개 → 예시 안내 카드만, 홈 화면 추가 카드는 아직 없다 (V3-5)', () => {
    expect(showNotifAsk(initialState(today))).toBe(false);
    expect(showNotifAsk(onboarded())).toBe(false);
  });

  it('처음으로 "이걸로 할게요"를 누르면 나온다', () => {
    const recipe = { name: '닭안심 버터카레', uses: ['닭안심'], keeps: [], buy: [] };
    const s = reducer(onboarded(), { type: 'confirmMeal', recipe, today, at: 'T1' });
    expect(s.onboarding.firstConfirmAt).toBe('T1');
    expect(showNotifAsk(s)).toBe(true);
    // 되돌려도 처음 확정한 시각은 남는다, 두 번째 확정은 시각을 바꾸지 않는다
    const s2 = reducer(reducer(s, { type: 'undoMeal', at: 'T1' }), { type: 'confirmMeal', recipe, today, at: 'T2' });
    expect(s2.onboarding.firstConfirmAt).toBe('T1');
  });

  it('서로 다른 날 세 번째로 열면 나오고, 같은 날 세 번 열면 안 나온다', () => {
    let s = onboarded();
    for (let k = 0; k < 3; k++) s = reducer(s, { type: 'appOpened', today });
    expect(s.opens).toEqual({ count: 1, lastDate: today });
    expect(showNotifAsk(s)).toBe(false);
    s = reducer(s, { type: 'appOpened', today: addDays(today, 1) });
    expect(showNotifAsk(s)).toBe(false);
    s = reducer(s, { type: 'appOpened', today: addDays(today, 3) });
    expect(s.opens).toEqual({ count: 3, lastDate: addDays(today, 3) });
    expect(showNotifAsk(s)).toBe(true);
  });

  it('첫 사용 안내 카드와 같이 나오지 않는다', () => {
    let s = reducer(initialState(today), { type: 'finishIntro' });
    for (const d of [0, 1, 2]) s = reducer(s, { type: 'appOpened', today: addDays(today, d) });
    expect(showOnboarding(s)).toBe(true);
    expect(showNotifAsk(s)).toBe(false);
  });

  it('나중에: 다시 묻지 않는다 (새로고침해도)', () => {
    const s = reducer(ready(), { type: 'answerNotifAsk', choice: 'later', at: 'T' });
    expect(s.notif).toMatchObject({ askedAt: 'T', optedLater: true });
    expect(showNotifAsk(s)).toBe(false);
    const m = new Map<string, string>();
    const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } as Storage;
    saveState(s, st);
    expect(showNotifAsk(loadState(st)!)).toBe(false);
  });

  it('홈 화면에 추가하고 알림 받기: 물은 것으로 기록 (나중에 아님)', () => {
    const s = reducer(ready(), { type: 'answerNotifAsk', choice: 'install', at: 'T' });
    expect(s.notif).toMatchObject({ askedAt: 'T', optedLater: false });
    expect(showNotifAsk(s)).toBe(false);
  });

  it('배너: 얼른 먹어야 할 재료가 있을 때만 가장 급한 것 하나, 닫으면 그날은 다시 안 나온다', () => {
    const s = reducer(onboarded(), { type: 'answerNotifAsk', choice: 'later', at: 'T' });
    expect(soonBanner(s, today)?.name).toBe('닭안심');
    const closed = reducer(s, { type: 'closeBanner', today });
    expect(closed.notif.bannerClosedOn).toBe(today);
    expect(soonBanner(closed, today)).toBeUndefined();
    // 다음 날 다시 (그날 기준 얼른 먹어야 할 재료가 있으면)
    expect(soonBanner(closed, addDays(today, 1))).toBeDefined();
    // 얼른 먹어야 할 재료가 없으면 안 나온다
    expect(soonBanner({ ...s, items: s.items.filter((i) => i.name === '카레가루') }, today)).toBeUndefined();
  });

  it('배너는 첫 사용 안내·홈 화면 추가 카드가 떠 있을 때는 기다린다', () => {
    expect(soonBanner(initialState(today), today)).toBeUndefined();
    expect(soonBanner(ready(), today)).toBeUndefined();
    expect(soonBanner(onboarded(), today)?.name).toBe('닭안심');
  });

  it('알림 시간: 기본 오후 6시, 고르면 저장 (A단계는 저장만)', () => {
    expect(initialState(today).notif.time).toBe('18:00');
    expect(reducer(initialState(today), { type: 'setNotifTime', time: '20:00' }).notif.time).toBe('20:00');
  });
});

describe('산 재료는 장보기 목록에서 빠진다 (V3-7-1)', () => {
  const list = (names: string[]) => names.map((name) => ({ name, from: 'video' as const, checked: true }));
  const added = (name: string) => [newItemFromCatalog(findCatalog(name)!, today, `n-${name}`)];

  it('이름이 같으면 빠진다', () => {
    const s = reducer({ ...initialState(today), shoppingList: list(['고추장', '감자']) }, { type: 'addItems', items: added('감자') });
    expect(s.shoppingList.map((i) => i.name)).toEqual(['고추장']);
  });

  it('대체 묶음이 같은 이름도 같은 것으로 본다 (냉동새우 ↔ 새우살)', () => {
    const s = reducer({ ...initialState(today), shoppingList: list(['냉동새우', '고추장']) }, { type: 'addItems', items: added('새우살') });
    expect(s.shoppingList.map((i) => i.name)).toEqual(['고추장']);
  });

  it('다른 이름(달걀)으로 적어 둔 재료도 대표 이름(계란)으로 맞춰 본다', () => {
    const s = reducer({ ...initialState(today), shoppingList: list(['달걀']) }, { type: 'addItems', items: added('계란') });
    expect(s.shoppingList).toEqual([]);
  });

  it('제안하지 않는 쌍(대파 ↔ 양파)은 빼지 않는다', () => {
    const s = reducer({ ...initialState(today), shoppingList: list(['대파']) }, { type: 'addItems', items: added('양파') });
    expect(s.shoppingList.map((i) => i.name)).toEqual(['대파']);
  });
});

describe('직접 적은 떡은 떡 종류(냉장)로', () => {
  it('면·곡물·빵 분류에서 이름에 "떡"이 들어가면 냉장 떡, 아니면 빵(실온)', () => {
    const rice = newItemFromPick({ name: '가래떡', customKind: 'bread' }, today, 'r1', findCatalog)!;
    expect(rice).toMatchObject({ location: '냉장', expiryBasis: 'kind' });
    const bread = newItemFromPick({ name: '치아바타', customKind: 'bread' }, today, 'b1', findCatalog)!;
    expect(bread.location).toBe('실온');
  });
});
