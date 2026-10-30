import { describe, expect, it } from 'vitest';
import { makeSampleInventory } from '../data/sampleInventory';
import { addDays } from './date';
import {
  countByState,
  dDayLabel,
  dueBannerText,
  groupForHome,
  mostUrgentSoon,
  okSectionOpen,
  sameAsAbove,
  daysLeft,
  daysSinceEntered,
  homeHeadline,
  sortForHome,
  stateLabel,
  stateOf,
  urgencyOf,
} from './status';

const today = '2026-10-27';
/** 남은 일수·들어온 일수로 테스트용 날짜를 만든다 */
const at = (left: number, ago: number) => ({
  enteredAt: addDays(today, -ago),
  expiresAt: addDays(today, left),
});

describe('남은 일수·들어온 일수', () => {
  it('날짜로 계산한다', () => {
    expect(daysLeft(at(5, 2), today)).toBe(5);
    expect(daysLeft(at(-2, 9), today)).toBe(-2);
    expect(daysSinceEntered(at(5, 2), today)).toBe(2);
  });

  it('날이 바뀌면 다시 계산된다', () => {
    const item = at(4, 13);
    expect(stateOf(item, today)).toBe('ok');
    expect(stateOf(item, addDays(today, 1))).toBe('soon'); // 남은 3일
  });
});

describe('상태 판정 경계값', () => {
  it('곧 상할: 남은 3일까지 포함, 4일은 아니다', () => {
    expect(stateOf(at(3, 0), today)).toBe('soon');
    expect(stateOf(at(4, 0), today)).toBe('ok');
  });

  it('곧 상할: 오늘까지·이미 지난 것도 포함', () => {
    expect(stateOf(at(0, 5), today)).toBe('soon');
    expect(stateOf(at(-1, 5), today)).toBe('soon');
    expect(stateOf(at(-30, 40), today)).toBe('soon');
  });

  it('묻힘 후보: 들어온 지 14일부터, 13일은 아니다', () => {
    expect(stateOf(at(30, 14), today)).toBe('buried');
    expect(stateOf(at(30, 13), today)).toBe('ok');
  });

  it('상비 재료(양념·소스, 면·곡물)는 오래 있어도 잊혀지는 중이 아니다', () => {
    expect(stateOf({ name: '카레가루', ...at(200, 30) }, today)).toBe('ok');
    expect(stateOf({ name: '스파게티면', ...at(300, 60) }, today)).toBe('ok');
    expect(stateOf({ name: '고추장', ...at(100, 20) }, today)).toBe('ok');
    expect(stateOf({ name: '만두', ...at(60, 30) }, today)).toBe('buried'); // 냉동식품은 해당 없음
    expect(stateOf({ name: '사전에 없는 재료', ...at(30, 20) }, today)).toBe('buried');
  });

  it('상비 재료도 기한이 가까우면 오늘 내일 해요', () => {
    expect(stateOf({ name: '식빵', ...at(2, 3) }, today)).toBe('soon');
    expect(stateOf({ name: '카레가루', ...at(1, 300) }, today)).toBe('soon');
  });

  it('곧 상할을 먼저 검사한다 (오래됐어도 기한이 가까우면 곧 상할)', () => {
    expect(stateOf(at(3, 20), today)).toBe('soon');
    expect(stateOf(at(4, 14), today)).toBe('buried');
  });

  it('상태 이름은 정해진 화면 이름을 쓴다', () => {
    expect(stateLabel('soon')).toBe('오늘 내일 해요');
    expect(stateLabel('buried')).toBe('잊혀지는 중');
    expect(stateLabel('ok')).toBe('싱싱해요');
  });
});

describe('급함 점수', () => {
  it('곧 상할 = 10 − 남은일수, 지난 것은 10', () => {
    expect(urgencyOf(at(1, 0), today)).toBe(9);
    expect(urgencyOf(at(3, 0), today)).toBe(7);
    expect(urgencyOf(at(0, 0), today)).toBe(10);
    expect(urgencyOf(at(-3, 0), today)).toBe(10);
  });

  it('묻힘 = 5, 정상 = 0', () => {
    expect(urgencyOf(at(30, 14), today)).toBe(5);
    expect(urgencyOf(at(30, 1), today)).toBe(0);
  });
});

describe('홈 정렬과 헤드라인', () => {
  it('곧 상할 먼저, 그다음 묻힘 후보(오래 묵은 순), 정상(소비기한 순)', () => {
    const items = [
      { name: '정상5', ...at(5, 1) },
      { name: '곧상할1', ...at(1, 1) },
      { name: '묻힘40', ...at(40, 20) },
      { name: '지남', ...at(-1, 10) },
      { name: '묻힘10', ...at(10, 15) },
    ];
    expect(sortForHome(items, today).map((i) => i.name)).toEqual(['지남', '곧상할1', '묻힘40', '묻힘10', '정상5']); // 묻힘40은 20일째, 묻힘10은 15일째
    expect(items[0].name).toBe('정상5'); // 원래 배열은 그대로
  });

  it('샘플 재고 순서·개수', () => {
    const inv = makeSampleInventory(today);
    expect(sortForHome(inv, today).map((i) => i.name)).toEqual([
      '닭안심', '소고기 불고기용', '오이', '우유',
      '만두', '새우살',
      '삼겹살', '대파', '삼겹 베이컨', '양파', '계란', '버터', '카레가루', '스파게티면',
    ]);
    const counts = countByState(inv, today);
    expect(counts).toEqual({ soon: 4, buried: 2, ok: 8 });
    expect(homeHeadline(counts)).toEqual({
      title: '얼른 먹어야 할 재료가 4개 있어요',
      lead: '잊혀지는 중인 재료도 2개예요.',
    });
  });

  it('상태별 구역: 오늘 내일 해요 → 잊혀지는 중 → 싱싱해요', () => {
    const groups = groupForHome(makeSampleInventory(today), today);
    expect(groups.map((g) => [g.state, g.items.map((i) => i.name)])).toEqual([
      ['soon', ['닭안심', '소고기 불고기용', '오이', '우유']],
      ['buried', ['만두', '새우살']],
      ['ok', ['삼겹살', '대파', '삼겹 베이컨', '양파', '계란', '버터', '카레가루', '스파게티면']],
    ]);
  });

  it('이름이 같은 재료는 가장 급한 것 바로 아래에 붙인다 (구역이 달라도)', () => {
    const it2 = (name: string, left: number, ago: number) => ({ name, ...at(left, ago) });
    const items = [it2('우유', 10, 1), it2('달걀', 2, 1), it2('우유', 3, 1), it2('대파', 5, 1)];
    const groups = groupForHome(items, today);
    expect(groups.map((g) => [g.state, g.items.map((i) => `${i.name}${daysLeft(i, today)}`), g.count])).toEqual([
      ['soon', ['달걀2', '우유3', '우유10'], 2],
      ['ok', ['대파5'], 1],
    ]);
    expect(groups[0].items.map((_, n, l) => sameAsAbove(l, n))).toEqual([false, false, true]);
  });

  it('빈 구역은 빠진다', () => {
    expect(groupForHome([at(30, 1), at(40, 2)], today).map((g) => g.state)).toEqual(['ok']);
    expect(groupForHome([], today)).toEqual([]);
  });

  it('급한 재료가 없을 때 문구', () => {
    expect(homeHeadline({ soon: 0, buried: 0, ok: 3 })).toEqual({
      title: '급한 재료가 없어요',
      lead: '잊혀지는 중인 재료는 없어요.',
    });
  });

  it('D-day 표시', () => {
    expect(dDayLabel(3)).toBe('D-3');
    expect(dDayLabel(0)).toBe('오늘까지');
    expect(dDayLabel(-2)).toBe('2일 지났어요');
  });
});

describe('홈 배너: 가장 급한 재료 하나 (V3-4)', () => {
  const inv = makeSampleInventory(today);

  it('예시 재료에서는 닭안심(D-1): "닭안심이 내일까지예요"', () => {
    const it = mostUrgentSoon(inv, today)!;
    expect(it.name).toBe('닭안심');
    expect(dueBannerText(it, today)).toBe('닭안심이 내일까지예요');
  });

  it('오늘까지 / N일 뒤까지 / 기한이 지났어요, 조사 이/가', () => {
    const item = (name: string, left: number) => ({ name, ...at(left, 1) });
    expect(dueBannerText(item('우유', 0), today)).toBe('우유가 오늘까지예요');
    expect(dueBannerText(item('오이', 2), today)).toBe('오이가 2일 뒤까지예요');
    expect(dueBannerText(item('두부', -1), today)).toBe('두부가 기한이 지났어요');
    expect(dueBannerText(item('닭안심', 3), today)).toBe('닭안심이 3일 뒤까지예요');
  });

  it('소비기한이 같으면 목록 순서(먼저 있는 것), 오늘 내일 해요 재료가 없으면 없음', () => {
    const a = { id: 'a', name: 'A', ...at(2, 1) };
    const b = { id: 'b', name: 'B', ...at(2, 1) };
    const c = { id: 'c', name: 'C', ...at(10, 1) };
    expect(mostUrgentSoon([c, a, b], today)?.id).toBe('a');
    expect(mostUrgentSoon([c], today)).toBeUndefined();
  });
});

describe('싱싱해요 묶음 펼치기 (V4-4)', () => {
  it('급한 재료(오늘 내일 해요·잊혀지는 중)가 하나도 없으면 펼친다', () => {
    expect(okSectionOpen(null, { soon: 0, buried: 0, ok: 7 })).toBe(true);
    expect(okSectionOpen(null, { soon: 1, buried: 0, ok: 7 })).toBe(false);
    expect(okSectionOpen(null, { soon: 0, buried: 2, ok: 7 })).toBe(false);
  });
  it('사용자가 직접 접거나 펼쳤으면 그 선택을 따른다', () => {
    expect(okSectionOpen(false, { soon: 0, buried: 0, ok: 7 })).toBe(false);
    expect(okSectionOpen(true, { soon: 3, buried: 1, ok: 7 })).toBe(true);
  });
});
