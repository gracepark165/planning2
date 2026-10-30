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

  it('소분이면 소분 기간표: 고기 90 · 새우 60 · 만두 60 · 채소 30', () => {
    expect(shelfDaysFor(cat('닭가슴살'), true)).toBe(90);
    expect(shelfDaysFor(cat('삼겹살'), true)).toBe(90);
    expect(shelfDaysFor(cat('새우살'), true)).toBe(60);
    expect(shelfDaysFor(cat('만두'), true)).toBe(60);
    expect(shelfDaysFor(cat('대파'), true)).toBe(30);
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
    expect(expiryBasisText({ ...base, expiryBasis: 'label' })).toBe('주문 화면에 적힌 소비기한');
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
