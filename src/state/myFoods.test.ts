import { describe, expect, it } from 'vitest';
import { CATALOG, findCatalog } from '../data';
import { parseItem } from '../rules/textInput';
import { stateOf } from '../rules/status';
import type { Item } from '../rules/types';
import { rememberItems, withMyFoods } from './myFoods';
import { initialState, reducer } from './store';
import { draftFromParsed, draftToItem, setDraftLocation, type DraftRow } from './textDraft';

const today = '2026-10-28';
const item = (over: Partial<Item>): Item => ({
  id: 'x',
  name: '요거트',
  qty: '1개',
  core: '',
  location: '냉장',
  enteredAt: today,
  expiresAt: '2026-11-07',
  expiryBasis: 'user',
  remaining: '넉넉해요',
  source: 'text',
  portioned: false,
  ...over,
});

describe('지난번 값 기억하기', () => {
  it('사전에 없는 재료만, 포장 표기·소분은 빼고 기억한다', () => {
    const mine = rememberItems({}, [
      item({ group: 'dairy' }),
      item({ id: 'y', name: '우유' }), // 사전에 있음
      item({ id: 'z', name: '두유', expiryBasis: 'label' }),
      item({ id: 'w', name: '어묵', portioned: true }),
    ]);
    expect(mine).toEqual({ 요거트: { name: '요거트', shelfDays: 10, location: '냉장', group: 'dairy' } });
  });

  it('다음에 같은 이름이 나오면 사전 항목처럼 채운다 (띄어쓰기 무시)', () => {
    const lookup = withMyFoods(findCatalog, { 그릭요거트: { name: '그릭요거트', shelfDays: 10, location: '냉장', group: 'dairy' } });
    expect(lookup('그릭 요거트')).toMatchObject({ name: '그릭요거트', shelfDays: 10, mine: true });
    expect(lookup('우유')?.mine).toBeUndefined(); // 사전이 먼저
    const row = draftFromParsed(parseItem('그릭 요거트 2개', CATALOG), 'k', today, lookup);
    expect(row).toMatchObject({ name: '그릭요거트', expiresAt: '2026-11-07', expiryBasis: 'mine', nameChecked: true });
    expect(draftToItem(row, today, 'id', lookup).group).toBe('dairy');
  });

  it('넣을 때, 냉장고에서 기한·위치를 고칠 때 기억한다', () => {
    let s = reducer(initialState(today), { type: 'addItems', items: [item({ id: 'n1', name: '훈제오리', group: 'meat' })] });
    expect(s.myFoods['훈제오리'].shelfDays).toBe(10);
    s = reducer(s, { type: 'shiftExpiry', id: 'n1', delta: 2 });
    s = reducer(s, { type: 'setLocation', id: 'n1', location: '냉동' });
    expect(s.myFoods['훈제오리']).toMatchObject({ shelfDays: 12, location: '냉동', group: 'meat' });
  });
});

describe('종류로 정한 줄: 보관 위치를 바꾸면 기간도 다시', () => {
  it('생고기 냉장 3일 → 냉동 90일', () => {
    const row: DraftRow = {
      key: 'k',
      raw: '오리고기',
      name: '오리고기',
      nameCandidates: [],
      portioned: false,
      count: 1,
      unit: '팩',
      location: '냉장',
      expiryBasis: 'kind',
      nameChecked: true,
      kind: 'rawMeat',
    };
    expect(setDraftLocation(row, '냉장', today, findCatalog).expiresAt).toBe('2026-10-31');
    expect(setDraftLocation(row, '냉동', today, findCatalog)).toMatchObject({ location: '냉동', expiresAt: '2027-01-26' });
  });
});

describe('사전에 없는 상비 재료도 잊혀지는 중에서 뺀다', () => {
  it('저장된 품목군으로 판단', () => {
    const old = { enteredAt: '2026-09-01', expiresAt: '2027-03-01' };
    expect(stateOf({ ...old, name: '부침가루', group: 'sauce' }, today)).toBe('ok');
    expect(stateOf({ ...old, name: '부침가루' }, today)).toBe('buried');
  });
});

describe('냉장고 비우기', () => {
  it('재료·기록·이번 주 확정을 지우고, 집밥 횟수와 지난번 값은 남긴다', () => {
    let s = reducer(initialState(today), { type: 'setMeals', mealsPerWeek: 6 });
    s = reducer(s, { type: 'addItems', items: [item({ id: 'n1', name: '훈제오리', group: 'meat' })] });
    s = reducer(s, { type: 'finishItem', id: s.items[0].id, action: 'eat', at: 't' });
    s = reducer(s, { type: 'clearAll' });
    expect(s.items).toEqual([]);
    expect(s.logs).toEqual([]);
    expect(s.plan).toMatchObject({ mealsPerWeek: 6, doneMeals: [], rejectedRecipes: [] });
    expect(s.myFoods['훈제오리']).toBeDefined();
  });
});
