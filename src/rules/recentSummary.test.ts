import { describe, expect, it } from 'vitest';
import { addDays } from './date';
import { recentRange, recentSummary } from './recentSummary';
import type { Item, MealLog } from './types';

// 2026-10-30(금) 기준 최근 7일 = 10/24(토) ~ 10/30(금), 오늘 포함 (수정명세 v3 V3-2)
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

describe('최근 7일 범위', () => {
  it('오늘 포함 7일: 6일 전 ~ 오늘', () => {
    expect(recentRange(today)).toEqual({ start: '2026-10-24', end: '2026-10-30' });
    expect(recentRange('2026-11-02')).toEqual({ start: '2026-10-27', end: '2026-11-02' });
  });
});

describe('최근 7일 요약 (B-5 → V3-2)', () => {
  it('먹은 재료·그중 얼른 먹어야 할 것·버린 재료·가장 많은 이유·지금 남은 것', () => {
    const logs = [
      log('2026-10-27', 'eat', { stateAtAction: 'soon' }),
      log('2026-10-28', 'eat', { stateAtAction: 'soon' }),
      log('2026-10-29', 'eat', { stateAtAction: 'ok' }),
      log('2026-10-29', 'discard', { stateAtAction: 'soon', discardReason: '깜빡했어요' }),
      log('2026-10-30', 'discard', { stateAtAction: 'buried', discardReason: '깜빡했어요' }),
      log('2026-10-30', 'discard', { stateAtAction: 'ok', discardReason: '상했어요' }, 9),
    ];
    expect(recentSummary(logs, fridge, today)).toEqual({
      kind: 'summary',
      eaten: 3,
      eatenSoon: 2,
      discarded: 3,
      topReason: '깜빡했어요',
      soonNow: 2,
      sentence: '최근 7일 동안 얼른 먹어야 할 재료 2개를 먹었어요. 2개는 아직 남아 있어요.',
      showSoonNowLine: false, // 문장에 이미 "2개는 아직 남아 있어요"가 있어서 아래 줄은 뺀다 (V3-6-1)
      showEatenLine: true,
      showDiscardLine: true,
    });
  });

  it('경계: 6일 전 0시는 들어가고, 7일 전(8일째) 밤 11시 59분은 빠진다', () => {
    const logs = [log('2026-10-24', 'eat', { stateAtAction: 'soon' }, 0, 0), log('2026-10-23', 'eat', { stateAtAction: 'soon' }, 23, 59)];
    expect(recentSummary(logs, fridge, today)).toMatchObject({ eaten: 1, eatenSoon: 1 });
  });

  it('오늘 밤 기록은 들어가고, 하루가 지나면 가장 오래된 날이 빠진다 (요일 경계 없음)', () => {
    const logs = [log('2026-10-30', 'eat', { stateAtAction: 'soon' }, 23, 59), log('2026-10-24', 'eat', {}, 12)];
    expect(recentSummary(logs, fridge, today)).toMatchObject({ eaten: 2, eatenSoon: 1 });
    expect(recentSummary(logs, fridge, '2026-10-31')).toMatchObject({ eaten: 1, eatenSoon: 1 });
    // 월요일이 되어도 지난 며칠 기록이 사라지지 않는다
    expect(recentSummary(logs, fridge, '2026-11-02')).toMatchObject({ eaten: 1 });
  });

  it('기록이 없으면 안내 한 줄', () => {
    expect(recentSummary([], fridge, today)).toEqual({ kind: 'empty', sentence: '최근 7일 기록이 쌓이면 여기에서 요약해 드려요' });
    expect(recentSummary([log('2026-10-20', 'eat')], fridge, today).kind).toBe('empty');
  });

  it('상태를 모르는 예전 기록(unknown)은 먹은 재료로만 세고, 얼른 먹어야 할 것으로는 세지 않는다', () => {
    const logs = [log('2026-10-27', 'eat', { stateAtAction: 'unknown' }), log('2026-10-27', 'discard', { stateAtAction: 'unknown' })];
    expect(recentSummary(logs, fridge, today)).toMatchObject({
      eaten: 1,
      eatenSoon: 0,
      discarded: 1,
      topReason: null,
      sentence: '최근 7일 동안 재료 1개를 먹었어요.', // V4-6-2
      showSoonNowLine: true,
    });
  });

  it('버리기만 하고 먹은 재료가 없으면 "아직 먹은 재료가 없어요"', () => {
    const logs = [log('2026-10-27', 'discard', { discardReason: '상했어요' })];
    expect(recentSummary(logs, fridge, today)).toMatchObject({
      eaten: 0,
      discarded: 1,
      topReason: '상했어요',
      sentence: '최근 7일 동안은 아직 먹은 재료가 없어요.',
    });
  });

  it('가장 많은 이유가 같으면 칩 순서가 앞선 것', () => {
    const logs = [
      log('2026-10-27', 'discard', { discardReason: '너무 많이 샀어요' }),
      log('2026-10-28', 'discard', { discardReason: '상했어요' }),
    ];
    expect(recentSummary(logs, fridge, today)).toMatchObject({ topReason: '상했어요' });
  });
});

describe('요약 문장·0개 줄 (V4-6-1·2)', () => {
  it('급한 재료를 먹었는데 남은 게 없으면 "아직 남아 있어요"를 붙이지 않고, 0개인 줄은 숨긴다', () => {
    const s = recentSummary([log('2026-10-28', 'eat', { stateAtAction: 'soon' })], [item('양파', 14)], today);
    expect(s).toMatchObject({
      sentence: '최근 7일 동안 얼른 먹어야 할 재료 1개를 먹었어요.',
      showEatenLine: true,
      showDiscardLine: false, // 버린 재료 0개
      showSoonNowLine: false, // 지금 얼른 먹어야 할 재료 0개
    });
  });

  it('먹은 재료가 0개면 먹은 줄도 숨긴다', () => {
    const s = recentSummary([log('2026-10-28', 'discard', { discardReason: '상했어요' })], fridge, today);
    expect(s).toMatchObject({ showEatenLine: false, showDiscardLine: true, showSoonNowLine: true });
  });
});
