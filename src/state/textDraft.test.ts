import { describe, expect, it } from 'vitest';
import { CATALOG, findCatalog } from '../data';
import { parseItem } from '../rules/textInput';
import {
  assumeOneCount,
  chooseExpiryDays,
  draftFromParsed,
  draftQty,
  draftToItem,
  issuesOf,
  renameRow,
  shiftDraftCount,
  shiftDraftExpiry,
  togglePortion,
  unportionAsOne,
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
    expect(issuesOf(draft('가리비 2팩'))).toEqual(['expiry']);
    expect(issuesOf(draft('냉동새우살 1kg 소분 4봉'))).toEqual(['name']);
    expect(issuesOf(draft('가리비 소분'))).toEqual(['count', 'expiry']);
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
    const r = chooseExpiryDays(draft('가리비 2팩'), 0, today);
    expect(shiftDraftExpiry(r, -1, today).expiresAt).toBe(today);
  });

  it('개수 ±: 못 읽은 개수는 +면 1부터, 범위는 1~30', () => {
    const unknown = draft('대파 소분');
    expect(shiftDraftCount(unknown, 1).count).toBe(1);
    expect(shiftDraftCount(unknown, -1).count).toBe(1);
    expect(shiftDraftCount({ ...unknown, count: 30 }, 1).count).toBe(30);
  });

  it('사전에 없는 재료는 소비기한을 고르면 넣을 수 있다', () => {
    const r = chooseExpiryDays(draft('가리비 2팩'), 3, today);
    expect(r).toMatchObject({ expiresAt: '2026-10-30', expiryBasis: 'user' });
    expect(issuesOf(r)).toEqual([]);
  });
});

describe('개수를 모를 때 빠져나갈 길 (A-8)', () => {
  const pending = (rows: ReturnType<typeof draft>[]) => rows.filter((r) => issuesOf(r).length).length;

  it('잘 모르겠어요: 1개로 두고 확인 표시를 푼다 (소분은 그대로)', () => {
    const r = assumeOneCount(draft('대파 소분'));
    expect(r).toMatchObject({ count: 1, portioned: true, location: '냉장', expiresAt: '2026-11-26' }); // 소분 30일
    expect(issuesOf(r)).toEqual([]);
    expect(draftQty(r)).toBe('소분 1개');
  });

  it('소분 안 함으로 바꾸기: 포장 그대로 1개, 위치·소비기한은 소분 안 한 기준으로', () => {
    const r = unportionAsOne(draft('대파 소분'), today, findCatalog);
    expect(r).toMatchObject({ count: 1, portioned: false, location: '냉장', expiresAt: '2026-11-03' }); // 대파 7일
    expect(issuesOf(r)).toEqual([]);
    expect(draftQty(r)).toBe('1개');
    // 고기도 소분 기준(냉동 90일)에서 품목 기본(냉장 3일)으로
    const meat = unportionAsOne(draft('닭가슴살 소분'), today, findCatalog);
    expect(meat).toMatchObject({ portioned: false, count: 1, location: '냉장', expiresAt: '2026-10-30' });
  });

  it('두 버튼 각각 "확인할 줄이 N개 남았어요"가 하나씩 줄어든다', () => {
    const rows = [draft('대파 소분'), draft('닭가슴살 소분'), draft('우유 2개')];
    expect(pending(rows)).toBe(2);
    const a = [assumeOneCount(rows[0]), rows[1], rows[2]];
    expect(pending(a)).toBe(1);
    const b = [a[0], unportionAsOne(a[1], today, findCatalog), a[2]];
    expect(pending(b)).toBe(0);
  });

  it('다른 확인할 것(소비기한)은 그대로 남는다', () => {
    expect(issuesOf(assumeOneCount(draft('가리비 소분')))).toEqual(['expiry']);
  });

  it('직접 고친 소비기한은 소분 안 함으로 바꿔도 그대로', () => {
    const edited = shiftDraftExpiry(draft('대파 소분'), 1, today);
    expect(unportionAsOne(edited, today, findCatalog).expiresAt).toBe(edited.expiresAt);
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

describe('언제 샀는지·얼마나 남았는지 → 확인 화면 줄 (V4-2·V4-3)', () => {
  const day = '2026-10-30';
  const d = (text: string) => draftFromParsed(parseItem(text, CATALOG), 'k', day, findCatalog);

  it('계란 10구 지난주에 산거 → 이름 계란, 입고일 10/23, 소비기한 11/13(D-14), 읽었다고 표시', () => {
    const r = d('계란 10구 지난주에 산거');
    expect(r).toMatchObject({ name: '계란', enteredAt: '2026-10-23', expiresAt: '2026-11-13', enteredRead: true });
    expect(draftToItem(r, day, 'i1', findCatalog)).toMatchObject({ enteredAt: '2026-10-23', expiresAt: '2026-11-13' });
  });

  it('우유 반쯤 남음 → 남은 양 반쯤으로 들어간다', () => {
    const r = d('우유 반쯤 남음');
    expect(r).toMatchObject({ name: '우유', remaining: '반쯤' });
    expect(draftToItem(r, day, 'i2', findCatalog).remaining).toBe('반쯤');
  });

  it('아무 말이 없으면 입고일 오늘, 넉넉해요', () => {
    const r = d('두부 1모');
    expect(r.enteredRead).toBeFalsy();
    expect(draftToItem(r, day, 'i3', findCatalog)).toMatchObject({ enteredAt: day, remaining: '넉넉해요' });
  });
});
