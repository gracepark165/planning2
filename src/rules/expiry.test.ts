import { describe, expect, it } from 'vitest';
import { RETAILERS, findCatalog } from '../data';
import {
  autoExpiresAt,
  checkinDate,
  defaultLocation,
  expiryBasisText,
  refreshAutoExpiry,
  shelfDaysFor,
  shiftExpiry,
  setEntered,
  basisNote,
  enteredText,
  relocate,
} from './expiry';
import { emojiOf } from './emoji';
import { makeSampleInventory } from '../data/sampleInventory';
import { newItemFromCatalog } from '../state/store';
import type { Item, Retailer } from './types';

const cat = (name: string) => {
  const c = findCatalog(name);
  if (!c) throw new Error(`사전에 없음: ${name}`);
  return c;
};
const retailer = (name: string) => RETAILERS.find((r) => r.name === name) as Retailer;

const base: Item = {
  id: 't1',
  name: '대파',
  qty: '1단',
  core: '',
  location: '냉장',
  enteredAt: '2026-10-27',
  expiresAt: '2026-11-03',
  expiryBasis: 'table',
  remaining: '넉넉해요',
  source: 'manual',
  portioned: false,
};

describe('소비기한 자동 계산', () => {
  it('입고일 + 품목 기본 기간', () => {
    expect(autoExpiresAt('2026-10-27', cat('대파'), false)).toBe('2026-11-03'); // 7일
    expect(autoExpiresAt('2026-10-27', cat('닭가슴살'), false)).toBe('2026-10-30'); // 3일
    expect(autoExpiresAt('2026-12-20', cat('계란'), false)).toBe('2027-01-10'); // 21일, 해 넘김
  });

  it('소분이면 재료별 냉동 기간, 없으면 소분 기간표', () => {
    expect(shelfDaysFor(cat('닭가슴살'), true)).toBe(180); // 닭 조각 6개월
    expect(shelfDaysFor(cat('소고기'), true)).toBe(180); // 소 덩어리 6개월
    expect(shelfDaysFor(cat('소고기 다짐육'), true)).toBe(90); // 소 다짐육 3개월
    expect(shelfDaysFor(cat('삼겹살'), true)).toBe(120); // 돼지 덩어리 4개월
    expect(shelfDaysFor(cat('돼지고기 다짐육'), true)).toBe(60); // 돼지 다짐육 2개월
    expect(shelfDaysFor(cat('베이컨'), true)).toBe(30); // 육가공품 1개월
    expect(shelfDaysFor(cat('고등어'), true)).toBe(60); // 기름진 생선 2개월
    expect(shelfDaysFor(cat('오징어'), true)).toBe(90); // 오징어·조개 3개월
    expect(shelfDaysFor(cat('새우살'), true)).toBe(90); // 원래 냉동, 생새우 3개월
    expect(shelfDaysFor(cat('오리고기'), true)).toBe(90); // 냉동 기간 없음 → 소분 기간표(고기)
    expect(shelfDaysFor(cat('만두'), true)).toBe(60);
    expect(shelfDaysFor(cat('대파'), true)).toBe(30);
  });

  it('소분 안 해도 냉동으로 넣으면 냉동 기간, 원래 냉동인 재료는 그대로', () => {
    expect(shelfDaysFor(cat('닭가슴살'), false, '냉장')).toBe(3);
    expect(shelfDaysFor(cat('닭가슴살'), false, '냉동')).toBe(180);
    expect(shelfDaysFor(cat('햄'), false, '냉동')).toBe(30);
    expect(shelfDaysFor(cat('당근'), false, '냉동')).toBe(30); // 채소 → 소분 기간표
    expect(shelfDaysFor(cat('우유'), false, '냉동')).toBe(7); // 냉동 기간 없음 → 기본 기간
    expect(shelfDaysFor(cat('냉동새우'), false, '냉동')).toBe(90);
    expect(shelfDaysFor(cat('냉동밥'), false, '냉동')).toBe(60); // 조리된 밥 2개월
    expect(findCatalog('얼린밥')?.name).toBe('냉동밥');
  });

  it('소분 기간표에 없는 품목군은 품목 기본 기간', () => {
    expect(shelfDaysFor(cat('우유'), true)).toBe(7);
    expect(shelfDaysFor(cat('두부'), true)).toBe(7);
  });

  it('사전에 없는 재료는 계산하지 않는다 (사용자가 고름)', () => {
    expect(shelfDaysFor(undefined, false)).toBeUndefined();
    expect(autoExpiresAt('2026-10-27', undefined, true)).toBeUndefined();
  });

  it('소분 여부가 바뀌면 다시 계산하지만, 고친 값·표기 값은 그대로 둔다', () => {
    const portioned = { ...base, portioned: true };
    expect(refreshAutoExpiry(portioned, cat('대파')).expiresAt).toBe('2026-11-26'); // 30일
    const userEdited = { ...portioned, expiryBasis: 'user' as const };
    expect(refreshAutoExpiry(userEdited, cat('대파'))).toBe(userEdited);
    const fromLabel = { ...portioned, expiryBasis: 'label' as const };
    expect(refreshAutoExpiry(fromLabel, cat('대파'))).toBe(fromLabel);
  });
});

describe('소비기한 ±1일', () => {
  it('고치면 근거가 "직접 고친 값"이 된다', () => {
    const plus = shiftExpiry(base, 1);
    expect(plus.expiresAt).toBe('2026-11-04');
    expect(plus.expiryBasis).toBe('user');
    expect(expiryBasisText(plus)).toBe('직접 고친 값');
    expect(shiftExpiry(base, -1).expiresAt).toBe('2026-11-02');
    expect(base.expiresAt).toBe('2026-11-03'); // 원래 값은 그대로
  });

  it('입고일보다 앞으로는 가지 않는다', () => {
    const sameDay = { ...base, expiresAt: base.enteredAt };
    expect(shiftExpiry(sameDay, -1)).toBe(sameDay);
  });
});

describe('보관 위치 기본값', () => {
  it('소분 안 하면 품목 기본 위치', () => {
    expect(defaultLocation(cat('양파'), false)).toBe('실온');
    expect(defaultLocation(cat('닭가슴살'), false)).toBe('냉장');
    expect(defaultLocation(cat('새우'), false)).toBe('냉동');
  });

  it('소분한 육류·해산물·냉동식품은 냉동, 그 외는 품목 기본 위치', () => {
    expect(defaultLocation(cat('닭안심'), true)).toBe('냉동');
    expect(defaultLocation(cat('새우살'), true)).toBe('냉동');
    expect(defaultLocation(cat('대파'), true)).toBe('냉장');
    expect(defaultLocation(cat('양파'), true)).toBe('실온');
  });

  it('사전에 없으면 냉장', () => {
    expect(defaultLocation(undefined, true)).toBe('냉장');
  });
});

describe('입고일 (FR-17)', () => {
  it('컬리: 23시 전 주문은 다음 날, 23시 이후는 다다음 날', () => {
    expect(checkinDate('2026-10-26', retailer('컬리'))).toBe('2026-10-27');
    expect(checkinDate('2026-10-26', retailer('컬리'), 22)).toBe('2026-10-27');
    expect(checkinDate('2026-10-26', retailer('컬리'), 23)).toBe('2026-10-28');
  });

  it('B마트: 주문 당일 (시각 무관)', () => {
    expect(checkinDate('2026-10-26', retailer('B마트'), 23)).toBe('2026-10-26');
  });

  it('쿠팡: 임시로 주문일 + 2일', () => {
    expect(checkinDate('2026-10-30', retailer('쿠팡'))).toBe('2026-11-01');
  });
});

describe('기준 문구 (A-3: N일은 입고일과 소비기한의 차이)', () => {
  it('근거 문구: 출처별', () => {
    expect(expiryBasisText(base)).toBe('기본 기간표 기준 · 보통 7일');
    expect(expiryBasisText({ ...base, expiryBasis: 'label', source: 'order' })).toBe('주문 화면에 적힌 소비기한');
    expect(expiryBasisText({ ...base, expiryBasis: 'label', source: 'manual' })).toBe('포장에 적힌 소비기한');
    expect(expiryBasisText({ ...base, expiryBasis: 'user' })).toBe('직접 고친 값');
    expect(expiryBasisText({ ...base, expiryBasis: 'sample' })).toBe('예시 재료예요');
    expect(expiryBasisText({ ...base, expiryBasis: 'kind' })).toBe('비슷한 종류 기준 · 보통 7일');
    expect(expiryBasisText({ ...base, expiryBasis: 'mine' })).toBe('지난번에 정한 기간 · 보통 7일');
  });

  it('근거 아래 줄: "보통 N일"은 근거 줄에만, 아래에는 임시 값 안내만 (V4-6-3)', () => {
    expect(basisNote(base)).toBe('기간표는 검증 전 임시 값이에요');
    expect(basisNote({ ...base, expiryBasis: 'kind' })).toBe('기간표는 검증 전 임시 값이에요');
    for (const b of ['mine', 'label', 'user', 'sample'] as const) expect(basisNote({ ...base, expiryBasis: b })).toBeNull();
  });

  it('들어온 날 문구: 오늘·어제·N일·앞으로 (V4-6-4)', () => {
    expect(enteredText(0)).toBe('오늘 들어왔어요');
    expect(enteredText(1)).toBe('어제 들어왔어요');
    expect(enteredText(5)).toBe('들어온 지 5일');
    expect(enteredText(-2)).toBe('2일 뒤 들어와요');
  });

  // 화면에 "보통 N일"이 나오면 N은 반드시 (소비기한 − 입고일)
  const usualN = (i: Item) =>
    [expiryBasisText(i), basisNote(i) ?? ''].flatMap((t) => [...t.matchAll(/보통 (\d+)일/g)].map((m) => Number(m[1])));
  const gap = (i: Item) => Math.round((Date.parse(i.expiresAt) - Date.parse(i.enteredAt)) / 86400000);

  it('예시 재료 전부: "보통 N일"이 있으면 N = 소비기한 − 입고일 (예시는 문구 자체가 없음)', () => {
    const inv = makeSampleInventory('2026-10-30');
    for (const i of inv) for (const n of usualN(i)) expect(n).toBe(gap(i));
    expect(inv.flatMap(usualN)).toEqual([]);
    // 예시 재료를 ±1일로 고쳐도 마찬가지
    for (const i of inv) for (const n of usualN(shiftExpiry(i, 1))) expect(n).toBe(gap(shiftExpiry(i, 1)));
  });

  it('사전 재료를 직접 추가해도 N = 소비기한 − 입고일', () => {
    for (const name of ['대파', '우유', '닭가슴살', '감자']) {
      const i = newItemFromCatalog(cat(name), '2026-10-30', 'x');
      expect(usualN(i)).toEqual([gap(i)]); // 근거 줄 한 번만 (같은 말 반복 없음)
    }
  });
});

describe('이모지 타일', () => {
  it('사전 이모지 → 핵심재료 대체 → 🍽️', () => {
    expect(emojiOf('', cat('대파'))).toBe('🌿');
    expect(emojiOf('소고기', cat('우삼겹'))).toBe('🥩'); // 사전에 이모지 없음 → 핵심재료
    expect(emojiOf('닭고기', undefined)).toBe('🍗');
    expect(emojiOf('', undefined)).toBe('🍽️');
  });
});

describe('입고일 바꾸기 (V4-2)', () => {
  it('기간표로 정한 소비기한은 입고일을 따라 같이 움직인다 (기간 그대로)', () => {
    const moved = setEntered(base, '2026-10-20'); // base: 10/27 입고, 11/03 소비기한 (7일)
    expect(moved).toMatchObject({ enteredAt: '2026-10-20', expiresAt: '2026-10-27', expiryBasis: 'table' });
    expect(setEntered({ ...base, expiryBasis: 'kind' }, '2026-10-20').expiresAt).toBe('2026-10-27');
    expect(setEntered({ ...base, expiryBasis: 'mine' }, '2026-10-20').expiresAt).toBe('2026-10-27');
  });

  it('주문 화면에 적힌 소비기한·직접 고친 값·예시 재료는 그대로 둔다', () => {
    for (const b of ['label', 'user', 'sample'] as const) {
      expect(setEntered({ ...base, expiryBasis: b }, '2026-10-20')).toMatchObject({ enteredAt: '2026-10-20', expiresAt: '2026-11-03' });
    }
  });
});

describe('냉장고에 있는 재료의 보관 위치 바꾸기 (2026-11-04)', () => {
  const chicken: Item = { ...base, id: 'c1', name: '닭가슴살', qty: '300g', core: '닭고기', expiresAt: '2026-10-30' };

  it('냉동으로 옮기면 입고일 + 냉동 기간, 꺼내면 원래 값으로', () => {
    const frozen = relocate(chicken, '냉동', cat('닭가슴살'));
    expect(frozen).toMatchObject({ location: '냉동', expiresAt: '2027-04-25', expiryBasis: 'table' }); // 180일
    expect(expiryBasisText(frozen)).toBe('냉동 보관 기준 · 보통 180일');
    const back = relocate(frozen, '냉장', cat('닭가슴살'));
    expect(back).toMatchObject({ location: '냉장', expiresAt: '2026-10-30', expiryBasis: 'table' });
    expect(back.beforeFreeze).toBeUndefined();
  });

  it('예시·표기 재료도 늘리고, 꺼내면 원래 근거로 돌아간다', () => {
    const sample = { ...chicken, expiryBasis: 'sample' as const };
    const frozen = relocate(sample, '냉동', cat('닭가슴살'));
    expect(frozen.expiresAt).toBe('2027-04-25');
    expect(relocate(frozen, '냉장', cat('닭가슴살'))).toMatchObject({ expiresAt: '2026-10-30', expiryBasis: 'sample' });
  });

  it('직접 고친 소비기한은 그대로, 위치만 바꾼다', () => {
    const edited = { ...chicken, expiryBasis: 'user' as const };
    expect(relocate(edited, '냉동', cat('닭가슴살'))).toMatchObject({ location: '냉동', expiresAt: '2026-10-30' });
  });

  it('사전에 없는 재료는 품목군의 소분 기간표, 품목군도 없으면 위치만', () => {
    const lamb: Item = { ...base, id: 'l1', name: '양갈비', group: 'meat', expiryBasis: 'kind', expiresAt: '2026-10-30' };
    expect(relocate(lamb, '냉동', undefined)).toMatchObject({ expiresAt: '2027-01-25', expiryBasis: 'kind' }); // 90일
    const unknown: Item = { ...base, id: 'u1', name: '무언가', expiryBasis: 'kind' };
    expect(relocate(unknown, '냉동', undefined)).toMatchObject({ location: '냉동', expiresAt: base.expiresAt });
  });

  it('지금 소비기한이 냉동 기간보다 길면 그대로 (실온으로 옮기는 것도 기간은 그대로)', () => {
    const long = { ...chicken, expiresAt: '2027-12-01' };
    expect(relocate(long, '냉동', cat('닭가슴살')).expiresAt).toBe('2027-12-01');
    expect(relocate(base, '실온', cat('대파'))).toMatchObject({ location: '실온', expiresAt: base.expiresAt });
  });
});
