import { describe, expect, it } from 'vitest';
import { addDays } from './date';
import { weekRange, weekSummary } from './weekSummary';
import type { Item, MealLog } from './types';

// 2026-10-30은 금요일. 이번 주 = 10/26(월) ~ 11/1(일)
const today = '2026-10-30';
/** 기기 현지 시각으로 만든 기록 시각 (경계 테스트용) */
const at = (date: string, h = 12, m = 0) => {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m).toISOString();
};
const log = (date: string, action: MealLog['action'], extra: Partial<MealLog> = {}, h = 12, m = 0): MealLog => ({
  itemId: `${date}-${action}-${h}${m}`,
  action,
  at: at(date, h, m),
  stateAtAction: 'ok',
  discardReason: null,
  ...extra,
});
const item = (name: string, left: number): Item => ({
  id: name, name, qty: '1개', core: '', location: '냉장',
  enteredAt: addDays(today, -1), expiresAt: addDays(today, left),
  expiryBasis: 'table', remaining: '넉넉해요', source: 'manual', portioned: false,
});
const fridge = [item('닭안심', 1), item('우유', 3), item('양파', 14)]; // 지금 얼른 먹어야 할 재료 2개

describe('이번 주 범위 (월~일)', () => {
  it('금요일이면 그 주 월요일 ~ 일요일', () => {
    expect(weekRange(today)).toEqual({ start: '2026-10-26', end: '2026-11-01' });
  });
  it('월요일·일요일은 그 주의 시작·끝', () => {
    expect(weekRange('2026-10-26')).toEqual({ start: '2026-10-26', end: '2026-11-01' });
    expect(weekRange('2026-11-01')).toEqual({ start: '2026-10-26', end: '2026-11-01' });
    expect(weekRange('2026-11-02')).toEqual({ start: '2026-11-02', end: '2026-11-08' });
  });
});

describe('이번 주 요약 (B-5)', () => {
  it('먹은 재료·그중 얼른 먹어야 할 것·버린 재료·가장 많은 이유·지금 남은 것', () => {
    const logs = [
      log('2026-10-27', 'eat', { stateAtAction: 'soon' }),
      log('2026-10-28', 'eat', { stateAtAction: 'soon' }),
      log('2026-10-29', 'eat', { stateAtAction: 'ok' }),
      log('2026-10-29', 'discard', { stateAtAction: 'soon', discardReason: '깜빡했어요' }),
      log('2026-10-30', 'discard', { stateAtAction: 'buried', discardReason: '깜빡했어요' }),
      log('2026-10-30', 'discard', { stateAtAction: 'ok', discardReason: '상했어요' }, 9),
    ];
    expect(weekSummary(logs, fridge, today)).toEqual({
      kind: 'summary',
      eaten: 3,
      eatenSoon: 2,
      discarded: 3,
      topReason: '깜빡했어요',
      soonNow: 2,
      sentence: '이번 주 얼른 먹어야 할 재료 2개를 먹었어요. 2개는 아직 남아 있어요.',
    });
  });

  it('월요일 경계: 월요일 0시는 이번 주, 일요일 밤 11시 59분은 지난주', () => {
    const logs = [log('2026-10-26', 'eat', { stateAtAction: 'soon' }, 0, 0), log('2026-10-25', 'eat', { stateAtAction: 'soon' }, 23, 59)];
    expect(weekSummary(logs, fridge, today)).toMatchObject({ eaten: 1, eatenSoon: 1 });
  });

  it('일요일 경계: 오늘이 일요일이면 그날 밤까지 이번 주, 다음 날(월)이 되면 새 주', () => {
    const logs = [log('2026-11-01', 'eat', { stateAtAction: 'soon' }, 23, 59), log('2026-10-26', 'eat', {}, 0, 0)];
    expect(weekSummary(logs, fridge, '2026-11-01')).toMatchObject({ eaten: 2, eatenSoon: 1 });
    expect(weekSummary(logs, fridge, '2026-11-02')).toMatchObject({ kind: 'empty' });
  });

  it('기록이 없는 주는 안내 한 줄', () => {
    expect(weekSummary([], fridge, today)).toEqual({ kind: 'empty', sentence: '이번 주 기록이 쌓이면 여기에서 요약해 드려요' });
    expect(weekSummary([log('2026-10-20', 'eat')], fridge, today).kind).toBe('empty');
  });

  it('상태를 모르는 예전 기록(unknown)은 먹은 재료로만 세고, 얼른 먹어야 할 것으로는 세지 않는다', () => {
    const logs = [log('2026-10-27', 'eat', { stateAtAction: 'unknown' }), log('2026-10-27', 'discard', { stateAtAction: 'unknown' })];
    expect(weekSummary(logs, fridge, today)).toMatchObject({
      eaten: 1,
      eatenSoon: 0,
      discarded: 1,
      topReason: null,
      sentence: '이번 주 먹은 재료 1개 중 얼른 먹어야 할 재료는 아직 없어요.',
    });
  });

  it('버리기만 하고 먹은 재료가 없으면 "아직 먹은 재료가 없어요"', () => {
    const logs = [log('2026-10-27', 'discard', { discardReason: '상했어요' })];
    expect(weekSummary(logs, fridge, today)).toMatchObject({
      eaten: 0,
      discarded: 1,
      topReason: '상했어요',
      sentence: '이번 주는 아직 먹은 재료가 없어요.',
    });
  });

  it('가장 많은 이유가 같으면 칩 순서가 앞선 것', () => {
    const logs = [
      log('2026-10-27', 'discard', { discardReason: '너무 많이 샀어요' }),
      log('2026-10-28', 'discard', { discardReason: '상했어요' }),
    ];
    expect(weekSummary(logs, fridge, today)).toMatchObject({ topReason: '상했어요' });
  });
});
