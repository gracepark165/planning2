import { describe, expect, it } from 'vitest';
import { CATALOG, findCatalog } from '../data';
import { parseItem } from '../rules/textInput';
import {
  chooseExpiryDays,
  draftFromParsed,
  draftQty,
  draftToItem,
  issuesOf,
  renameRow,
  shiftDraftCount,
  shiftDraftExpiry,
  togglePortion,
} from './textDraft';

const today = '2026-10-27';
const draft = (text: string) => draftFromParsed(parseItem(text, CATALOG), 'k', today, findCatalog);

describe('확인 화면의 한 줄', () => {
  it('소분 고기: 냉동, 소분 기간표(90일)', () => {
    const r = draft('닭가슴살 세봉지 소분');
    expect(r).toMatchObject({ name: '닭가슴살', portioned: true, count: 3, unit: '봉', location: '냉동', expiresAt: '2027-01-25' });
    expect(issuesOf(r)).toEqual([]);
  });

  it('소분 채소: 품목 기본 위치(냉장), 30일', () => {
    expect(draft('대파 소분 한봉지')).toMatchObject({ location: '냉장', expiresAt: '2026-11-26' });
  });

  it('소분 아님: 품목 기본 위치·기간', () => {
    expect(draft('우유 2개')).toMatchObject({ location: '냉장', expiresAt: '2026-11-03', count: 2 });
    expect(draft('양파 3개')).toMatchObject({ location: '실온' });
  });

  it('확인할 것이 남은 줄', () => {
    expect(issuesOf(draft('대파 소분'))).toEqual(['count']);
    expect(issuesOf(draft('연어 2팩'))).toEqual(['expiry']);
    expect(issuesOf(draft('냉동새우살 1kg 소분 4봉'))).toEqual(['name']);
    expect(issuesOf(draft('연어 소분'))).toEqual(['count', 'expiry']);
  });
});

describe('고치기', () => {
  it('이름을 후보 칩으로 바꾸면 소비기한·위치를 다시 계산하고 확인된 것으로 본다', () => {
    const r = renameRow(draft('냉동새우살 1kg 소분 4봉'), '냉동새우', today, findCatalog);
    expect(r).toMatchObject({ name: '냉동새우', catalogName: '냉동새우', location: '냉동', expiresAt: '2026-12-26' });
    expect(issuesOf(r)).toEqual([]);
  });

  it('후보에 없으면 직접 입력: 사전에 없으면 소비기한을 골라야 한다', () => {
    const r = renameRow(draft('대파반단'), '  쪽파  ', today, findCatalog);
    expect(r).toMatchObject({ name: '쪽파', catalogName: '쪽파', expiresAt: '2026-11-03' });
    const typed = renameRow(draft('대파 2봉'), '루꼴라', today, findCatalog);
    expect(typed.catalogName).toBeUndefined();
    expect(issuesOf(typed)).toEqual(['expiry']);
    expect(renameRow(typed, '   ', today, findCatalog)).toBe(typed); // 빈 이름은 무시
  });

  it('"이대로 둘게요": 이름을 그대로 두고 확인', () => {
    const r = renameRow(draft('대파 양파 1개'), '대파', today, findCatalog);
    expect(issuesOf(r)).toEqual([]);
  });

  it('소분을 켜고 끄면 위치·소비기한이 바뀐다', () => {
    const on = togglePortion(draft('닭안심 2팩'), today, findCatalog);
    expect(on).toMatchObject({ portioned: true, location: '냉동', expiresAt: '2027-01-25' });
    const off = togglePortion(on, today, findCatalog);
    expect(off).toMatchObject({ portioned: false, location: '냉장', expiresAt: '2026-10-30' });
  });

  it('사용자가 고친 소비기한은 소분을 바꿔도 그대로', () => {
    const edited = shiftDraftExpiry(draft('닭안심 2팩'), 1, today);
    expect(edited).toMatchObject({ expiresAt: '2026-10-31', expiryBasis: 'user' });
    expect(togglePortion(edited, today, findCatalog).expiresAt).toBe('2026-10-31');
  });

  it('소비기한은 오늘보다 앞으로 가지 않는다', () => {
    const r = chooseExpiryDays(draft('연어 2팩'), 0, today);
    expect(shiftDraftExpiry(r, -1, today).expiresAt).toBe(today);
  });

  it('개수 ±: 못 읽은 개수는 +면 1부터, 범위는 1~30', () => {
    const unknown = draft('대파 소분');
    expect(shiftDraftCount(unknown, 1).count).toBe(1);
    expect(shiftDraftCount(unknown, -1).count).toBe(1);
    expect(shiftDraftCount({ ...unknown, count: 30 }, 1).count).toBe(30);
  });

  it('사전에 없는 재료는 소비기한을 고르면 넣을 수 있다', () => {
    const r = chooseExpiryDays(draft('연어 2팩'), 3, today);
    expect(r).toMatchObject({ expiresAt: '2026-10-30', expiryBasis: 'user' });
    expect(issuesOf(r)).toEqual([]);
  });
});

describe('재고로 바꾸기', () => {
  it('소분 품목: 입고일 오늘, 개수·단위·메모 보관', () => {
    const item = draftToItem(draft('새우살 400g 소분 5개'), today, 'id1', findCatalog);
    expect(item).toMatchObject({
      id: 'id1', name: '새우살', qty: '소분 5개', location: '냉동', enteredAt: today,
      expiresAt: '2026-12-26', expiryBasis: 'table', source: 'text', portioned: true, count: 5, unit: '개', note: '400g',
    });
  });

  it('소분 아님: 개수는 수량 글자에만', () => {
    const item = draftToItem(draft('우유 900ml 2개'), today, 'id2', findCatalog);
    expect(item).toMatchObject({ qty: '2개(900ml)', portioned: false, core: '' });
    expect(item.count).toBeUndefined();
    expect(draftToItem(draft('닭가슴살 2팩'), today, 'id3', findCatalog).core).toBe('닭고기');
  });

  it('수량 글자', () => {
    expect(draftQty({ portioned: false, count: 1, unit: '개', note: '600g' })).toBe('600g');
    expect(draftQty({ portioned: false, count: 30, unit: '구' })).toBe('30구');
    expect(draftQty({ portioned: true, count: 3, unit: '덩이' })).toBe('소분 3덩이');
  });

  it('확인이 안 끝난 줄은 넣지 않는다', () => {
    expect(() => draftToItem(draft('대파 소분'), today, 'x', findCatalog)).toThrow();
  });
});
