import { describe, expect, it } from 'vitest';
import { KINDS, CATALOG, RETAILERS, SUBSTITUTES, findCatalog } from '../data';
import { LIMITS, kindIdsOf } from '../../api/read';
import { issuesOf } from '../state/textDraft';
import { draftFromParsed } from '../state/textDraft';
import { parseItem } from '../rules/textInput';
import { slicePlan } from './client';
import { kindListOf, mergeTextAi, needsAiHelp, orderDateOf, orderToDrafts, retailerOf, videoMenusOf, vocabularyOf } from './convert';

const today = '2026-10-28';
let n = 0;
const key = () => `k${n++}`;

describe('주문 화면 결과 → 확인 화면 줄', () => {
  const ai = {
    retailer: '컬리' as const,
    orderDate: '2026-10-27',
    items: [
      { name: '닭다리살', product: '[국산] 무항생제 닭다리살 400g', count: 2, unit: '팩', weight: '400g' },
      { name: '달걀', count: 1, unit: '구' },
      { name: '두부', expiresOn: '2026-11-05' },
      { name: '연어', count: 99 },
      { name: '  ' },
    ],
  };
  const rows = orderToDrafts(ai, '2026-10-28', today, key, findCatalog);

  it('사전 이름으로 맞추고, 빈 이름은 뺀다', () => {
    expect(rows.map((r) => r.name)).toEqual(['닭다리살', '계란', '두부', '연어']);
    expect(rows[0]).toMatchObject({ raw: '[국산] 무항생제 닭다리살 400g', count: 2, unit: '팩', note: '400g', byAi: true, source: 'order' });
  });

  it('입고일 기준으로 소비기한 자동, 표기가 있으면 그 날짜', () => {
    expect(rows[0]).toMatchObject({ enteredAt: '2026-10-28', expiresAt: '2026-10-31', expiryBasis: 'table' });
    expect(rows[2]).toMatchObject({ expiresAt: '2026-11-05', expiryBasis: 'label' });
  });

  it('사전에 없는 재료는 소비기한을 고르게, 이상한 개수는 1', () => {
    expect(rows[3]).toMatchObject({ count: 1, catalogName: undefined });
    expect(issuesOf(rows[3])).toEqual(['expiry']);
    expect(rows.slice(0, 3).every((r) => issuesOf(r).length === 0)).toBe(true);
  });

  it('입고일보다 이른 표기 날짜는 믿지 않는다', () => {
    const [r] = orderToDrafts({ items: [{ name: '우유', expiresOn: '2026-10-01' }] }, today, today, key, findCatalog);
    expect(r.expiryBasis).toBe('table');
  });

  it('마트·주문일', () => {
    expect(retailerOf(ai, RETAILERS)?.name).toBe('컬리');
    expect(retailerOf({ items: [] }, RETAILERS)).toBeUndefined();
    expect(orderDateOf(ai, today)).toBe('2026-10-27');
    expect(orderDateOf({ items: [], orderDate: '2026-11-30' }, today)).toBeUndefined(); // 미래
    expect(orderDateOf({ items: [], orderDate: '2025-01-01' }, today)).toBeUndefined(); // 너무 오래됨
    expect(orderDateOf({ items: [], orderDate: '어제' }, today)).toBeUndefined();
  });
});

describe('사전에 없는 재료: AI가 고른 종류로 소비기한 자동 (종류별 기본 기간표)', () => {
  const rows = orderToDrafts(
    {
      items: [
        { name: '요거트', kind: 'dairy', storage: '냉장' },
        { name: '오리고기', kind: 'rawMeat', storage: '냉동' },
        { name: '모르는 것', kind: 'nope' },
        { name: '우유', kind: 'deli', storage: '실온' }, // 사전에 있으면 AI 분류는 안 씀
      ],
    },
    '2026-10-28',
    today,
    key,
    findCatalog,
  );

  it('종류 기본 기간, 냉동이면 냉동 기간', () => {
    expect(rows[0]).toMatchObject({ kind: 'dairy', location: '냉장', expiresAt: '2026-11-04', expiryBasis: 'kind' });
    expect(rows[1]).toMatchObject({ kind: 'rawMeat', location: '냉동', expiresAt: '2027-01-26', expiryBasis: 'kind' });
    expect(issuesOf(rows[0])).toEqual([]);
  });

  it('모르는 종류면 사용자가 고른다, 사전 재료는 사전 값', () => {
    expect(rows[2].kind).toBeUndefined();
    expect(issuesOf(rows[2])).toEqual(['expiry']);
    expect(rows[3]).toMatchObject({ name: '우유', location: '냉장', expiryBasis: 'table' });
    expect(rows[3].kind).toBeUndefined();
  });

  it('글 입력도 사전에 없는 줄은 종류를 받는다', () => {
    const d = draftFromParsed(parseItem('훈제연어 2팩', CATALOG), key(), today, findCatalog);
    const [m] = mergeTextAi([d], [d.key], { lines: [{ index: 0, name: '훈제연어', kind: 'rawSeafood' }] }, today, findCatalog);
    expect(m).toMatchObject({ kind: 'rawSeafood', expiryBasis: 'kind', expiresAt: '2026-10-30', byAi: true });
  });

  it('보낼 종류 목록', () => {
    const list = kindListOf();
    expect(list).toHaveLength(KINDS.length);
    expect(list.every((k) => k.length <= LIMITS.kindChars)).toBe(true);
    expect(list.length).toBeLessThanOrEqual(LIMITS.kinds);
    expect(kindIdsOf(list)).toEqual(KINDS.map((k) => k.id));
  });
});

describe('글 입력: 규칙이 못 읽은 줄만 AI로 채운다', () => {
  const draft = (t: string) => draftFromParsed(parseItem(t, CATALOG), key(), today, findCatalog);

  it('보낼 줄 고르기', () => {
    expect(needsAiHelp(draft('계란 한판'))).toBe(true); // 개수 못 읽음
    expect(needsAiHelp(draft('연어 2팩'))).toBe(true); // 사전에 없음
    expect(needsAiHelp(draft('우유 2개'))).toBe(false);
  });

  it('빈 곳만 채우고, 규칙이 읽은 값은 그대로', () => {
    const rows = [draft('계란 한판'), draft('우유 2개'), draft('훈제오리 두팩')];
    const targets = [rows[0].key, rows[2].key];
    const merged = mergeTextAi(
      rows,
      targets,
      {
        lines: [
          { index: 0, name: '계란', count: 30, unit: '구' },
          { index: 1, name: '오리고기', count: 5 }, // 사전에 없는 이름 → 이름은 그대로, 개수도 이미 읽었으니 그대로
          { index: 7, name: '버터' }, // 없는 줄 번호는 무시
        ],
      },
      today,
      findCatalog,
    );
    expect(merged[0]).toMatchObject({ name: '계란', count: 30, unit: '구', byAi: true });
    expect(issuesOf(merged[0])).toEqual([]);
    expect(merged[1]).toBe(rows[1]);
    expect(merged[2]).toBe(rows[2]);
  });

  it('사전에 없던 이름을 사전 이름으로 고치면 소비기한도 자동', () => {
    const rows = [draft('파스타면 2봉')];
    expect(rows[0].catalogName).toBe('스파게티면'); // 다른 이름이라 규칙으로도 읽힘
    const odd = [draft('생닭다리 2팩')]; // 규칙은 "닭다리살"을 못 찾음
    expect(odd[0].catalogName).toBeUndefined();
    const merged = mergeTextAi(odd, [odd[0].key], { lines: [{ index: 0, name: '닭다리살', count: 9 }] }, today, findCatalog);
    expect(merged[0]).toMatchObject({ name: '닭다리살', catalogName: '닭다리살', count: 2, byAi: true });
    expect(merged[0].expiresAt).toBeDefined();
  });
});

describe('영상 결과 → 메뉴', () => {
  it('기본 양념은 따로, 재료 없는 메뉴는 뺀다', () => {
    const menus = videoMenusOf(
      {
        videoTitle: '자취생 일주일 식단',
        basis: 'description',
        menus: [
          { title: '제육볶음', ingredients: ['돼지고기 앞다리살', '양파', '간장', '설탕', '양파'] },
          { title: '계란국', ingredients: ['소금', '물'] },
        ],
      },
      SUBSTITUTES,
    );
    expect(menus).toEqual([{ title: '제육볶음', names: ['돼지고기 앞다리살', '양파'], skipped: ['간장', '설탕'] }]);
  });

  it('못 찾았으면 빈 목록', () => {
    expect(videoMenusOf({ videoTitle: '브이로그', basis: 'none', menus: [] }, SUBSTITUTES)).toEqual([]);
  });
});

describe('AI에 보내는 것', () => {
  it('재료 사전 이름 목록', () => {
    expect(vocabularyOf(CATALOG)).toContain('닭다리살');
    expect(vocabularyOf(CATALOG)).toHaveLength(CATALOG.length);
  });

  it('긴 캡처 자르기: 조각은 4개까지, 끝까지 덮는다', () => {
    expect(slicePlan(1.5)).toEqual({ pieces: 1, pieceRatio: 1.5, stepRatio: 0 });
    for (const ratio of [3, 5, 8, 15]) {
      const p = slicePlan(ratio);
      expect(p.pieces).toBeLessThanOrEqual(4);
      expect(p.pieceRatio + p.stepRatio * (p.pieces - 1)).toBeCloseTo(ratio);
      expect(p.pieceRatio).toBeGreaterThan(p.stepRatio); // 조각끼리 겹친다
    }
  });
});
