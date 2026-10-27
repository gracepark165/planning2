import { describe, expect, it } from 'vitest';
import { makeSampleInventory } from '../data/sampleInventory';
import { addDays } from './date';
import {
  countByState,
  dDayLabel,
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
  it('묻힘 후보 먼저, 그다음 소비기한이 가까운 순', () => {
    const items = [
      { name: '정상5', ...at(5, 1) },
      { name: '곧상할1', ...at(1, 1) },
      { name: '묻힘40', ...at(40, 20) },
      { name: '지남', ...at(-1, 10) },
      { name: '묻힘10', ...at(10, 15) },
    ];
    expect(sortForHome(items, today).map((i) => i.name)).toEqual(['묻힘10', '묻힘40', '지남', '곧상할1', '정상5']);
    expect(items[0].name).toBe('정상5'); // 원래 배열은 그대로
  });

  it('샘플 재고가 프로토타입과 같은 순서·개수로 나온다', () => {
    const inv = makeSampleInventory(today);
    expect(sortForHome(inv, today).map((i) => i.name)).toEqual([
      '새우살', '만두', '카레가루', '스파게티면',
      '닭안심', '소고기 불고기용', '오이', '우유',
      '삼겹살', '대파', '삼겹 베이컨', '양파', '계란', '버터',
    ]);
    const counts = countByState(inv, today);
    expect(counts).toEqual({ soon: 4, buried: 4, ok: 6 });
    expect(homeHeadline(counts)).toEqual({
      title: '얼른 먹어야 할 재료가 4개 있어요',
      lead: '잊혀지는 중인 재료도 4개예요.',
    });
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
