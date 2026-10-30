import { describe, expect, it } from 'vitest';
import { SUBSTITUTES, VIDEO_EXAMPLES } from '../data';
import { makeSampleInventory } from '../data/sampleInventory';
import { addDays } from './date';
import type { Item, SubstituteTable } from './types';
import {
  checkIngredients,
  splitManualIngredients,
  subQuestion,
  subReason,
  substitutesFor,
  videoHeadline,
  type VideoRow,
} from './videoCheck';

const today = '2026-10-27';
const inv = makeSampleInventory(today);
const item = (name: string, left: number, ago: number): Item => ({
  id: name,
  name,
  qty: '1개',
  core: '',
  location: '냉장',
  enteredAt: addDays(today, -ago),
  expiresAt: addDays(today, left),
  expiryBasis: 'table',
  remaining: '넉넉해요',
  source: 'manual',
  portioned: false,
});
const summary = (rows: VideoRow[]) =>
  rows.map((r) => (r.kind === 'have' ? `${r.name}:있어요` : r.kind === 'sub' ? `${r.name}→${r.sub.name}` : `${r.name}:없어요`));
const video = (id: string) => VIDEO_EXAMPLES.find((v) => v.id === id)!;

describe('예시 영상 × 샘플 재고', () => {
  it('버터크림치킨카레: 닭다리살 대신 닭안심', () => {
    const rows = checkIngredients(video('curry').ingredients.map((i) => i.name), inv, today, SUBSTITUTES);
    expect(summary(rows)).toEqual(['닭다리살→닭안심', '카레가루:있어요', '우유:있어요', '양파:있어요', '버터:있어요']);
    expect(videoHeadline(rows)).toBe('5개 중 4개가 냉장고에 있어요');
    expect(subQuestion('닭다리살', '닭안심')).toBe('닭다리살 말고 닭안심으로 대체하는 건 어때요?');
    expect(subReason(rows[0] as Extract<VideoRow, { kind: 'sub' }>, today)).toEqual({
      text: '냉장고에 닭안심(D-1)이 있어요.',
      state: 'soon',
    });
  });

  it('제육볶음: 앞다리살 대신 삼겹살 (같은 돼지고기라도 삼겹 베이컨은 가공육 묶음이라 제외)', () => {
    const rows = checkIngredients(video('jeyuk').ingredients.map((i) => i.name), inv, today, SUBSTITUTES);
    expect(summary(rows)).toEqual(['돼지고기 앞다리살→삼겹살', '양파:있어요', '대파:있어요', '고추장:없어요']);
    expect(videoHeadline(rows)).toBe('4개 중 2개가 냉장고에 있어요');
  });
});

describe('대체 규칙 (CLAUDE.md 10장)', () => {
  it('같은 묶음 안에서만: 다른 묶음이면 제안하지 않는다', () => {
    const items = [item('소고기 불고기용', 5, 1)]; // 얇게 썬 것
    expect(substitutesFor('소고기 국거리', items, today, SUBSTITUTES)).toEqual([]); // 덩어리 묶음
    expect(substitutesFor('양파', [item('대파', 5, 1)], today, SUBSTITUTES)).toEqual([]);
    expect(substitutesFor('닭다리살', [item('삼겹살', 2, 1)], today, SUBSTITUTES)).toEqual([]);
  });

  it('묶음에 없는 재료는 제안하지 않는다', () => {
    expect(substitutesFor('고추장', inv, today, SUBSTITUTES)).toEqual([]);
    expect(substitutesFor('닭봉', [item('닭안심', 5, 1)], today, SUBSTITUTES)).toEqual([]); // 닭봉은 묶음에서 제외
  });

  it('후보가 여럿이면 곧 상할 → 묻힘 후보 → 남은 일수 순', () => {
    const items = [item('닭가슴살', 10, 1), item('닭정육', 30, 20), item('닭안심', 2, 1), item('닭볶음탕용', 6, 1)];
    expect(substitutesFor('닭다리살', items, today, SUBSTITUTES).map((i) => i.name)).toEqual([
      '닭안심', // 곧 상할
      '닭정육', // 묻힘 후보
      '닭볶음탕용', // 남은 6일
      '닭가슴살', // 남은 10일
    ]);
    const [row] = checkIngredients(['닭다리살'], items, today, SUBSTITUTES);
    expect(row).toMatchObject({ kind: 'sub', candidateCount: 4 });
    expect(subReason(row as Extract<VideoRow, { kind: 'sub' }>, today).text).toBe(
      '냉장고에 닭안심(D-2)이 있어요 · 같은 종류 중 소비기한이 더 가까운 걸 골랐어요.',
    );
  });

  it('제안하지 않는 쌍은 같은 묶음이어도 빼고 본다', () => {
    const table: SubstituteTable = {
      ...SUBSTITUTES,
      groups: [{ id: 't', label: '테스트', core: '', members: ['우유', '생크림', '두유'] }],
    };
    expect(substitutesFor('우유', [item('생크림', 5, 1), item('두유', 5, 1)], today, table)).toEqual([]);
  });

  it('있으면 대체를 찾지 않고 "있어요" (같은 이름이 여럿이면 급한 것)', () => {
    const rows = checkIngredients(['닭안심'], [item('닭안심', 10, 1), item('닭안심', 2, 1)], today, SUBSTITUTES);
    expect(rows[0]).toMatchObject({ kind: 'have' });
    expect(rows[0].kind === 'have' && daysOf(rows[0].item)).toBe(2);
  });

  it('다른 이름도 같은 재료로 본다 (달걀 = 계란, 쇠고기 국거리 → 같은 묶음 대체)', () => {
    const rows = checkIngredients(['달걀', '쇠고기 국거리'], [item('계란', 10, 1), item('양지', 5, 1)], today, SUBSTITUTES);
    expect(summary(rows)).toEqual(['달걀:있어요', '쇠고기 국거리→양지']);
  });

  it('기본 양념은 확인에서 뺀다', () => {
    const rows = checkIngredients(['소금', '닭안심', '간장', '물'], inv, today, SUBSTITUTES);
    expect(rows.map((r) => r.name)).toEqual(['닭안심']);
  });

  it('안내 문구가 있는 묶음 (가공육·고추)', () => {
    const [row] = checkIngredients(['베이컨'], [item('소시지', 5, 1)], today, SUBSTITUTES);
    expect(row.kind === 'sub' && row.group.tip).toContain('짠맛');
    const [chili] = checkIngredients(['풋고추'], [item('청양고추', 5, 1)], today, SUBSTITUTES);
    expect(chili.kind === 'sub' && chili.group.tip).toContain('매운');
  });

  it('제안 근거 문구: 묻힘 / 정상', () => {
    const [buried] = checkIngredients(['닭다리살'], [item('닭정육', 30, 20)], today, SUBSTITUTES);
    expect(subReason(buried as Extract<VideoRow, { kind: 'sub' }>, today)).toEqual({
      text: '냉장고에 닭정육(D-30)이 있어요.',
      state: 'buried',
    });
    const [ok] = checkIngredients(['닭다리살'], [item('닭가슴살', 30, 1)], today, SUBSTITUTES);
    expect(subReason(ok as Extract<VideoRow, { kind: 'sub' }>, today)).toEqual({ text: '냉장고에 닭가슴살(D-30)이 있어요.' });
  });
});

const daysOf = (i: Item) => Math.round((Date.parse(i.expiresAt) - Date.parse(today)) / 86400000);

describe('직접 입력 (FR-30)', () => {
  it('쉼표·줄바꿈으로 나누고 기본 양념은 따로', () => {
    expect(splitManualIngredients('돼지고기 앞다리살, 양파,대파\n간장, 설탕 ,, 양파', SUBSTITUTES)).toEqual({
      names: ['돼지고기 앞다리살', '양파', '대파'],
      skipped: ['간장', '설탕'],
    });
  });

  it('빈 입력', () => {
    expect(splitManualIngredients(' , ', SUBSTITUTES)).toEqual({ names: [], skipped: [] });
  });
});
