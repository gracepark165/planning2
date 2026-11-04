import { describe, expect, it } from 'vitest';
import { joinQty, qtyStep, splitQty, toBasicUnit } from './qty';

describe('수량 나누기', () => {
  it('숫자와 단위로 나눈다', () => {
    expect(splitQty('300g')).toEqual({ n: 300, unit: 'g' });
    expect(splitQty('1팩')).toEqual({ n: 1, unit: '팩' });
    expect(splitQty('10구')).toEqual({ n: 10, unit: '구' });
    expect(splitQty('900ml')).toEqual({ n: 900, unit: 'ml' });
  });

  it('숫자가 없거나 비면 1개', () => {
    expect(splitQty(undefined)).toEqual({ n: 1, unit: '개' });
    expect(splitQty('조금')).toEqual({ n: 1, unit: '개' });
    expect(splitQty('5')).toEqual({ n: 5, unit: '개' });
  });

  it('다시 합치기', () => {
    expect(joinQty({ n: 5, unit: '개' })).toBe('5개');
  });

  it('g은 100씩, 개는 1씩', () => {
    expect(qtyStep('g')).toBe(100);
    expect(qtyStep('개')).toBe(1);
  });

  it('기본 수량을 개·g으로', () => {
    expect(toBasicUnit(splitQty('300g'))).toEqual({ n: 300, unit: 'g' });
    expect(toBasicUnit(splitQty('1kg'))).toEqual({ n: 1000, unit: 'g' });
    expect(toBasicUnit(splitQty('900ml'))).toEqual({ n: 1, unit: '개' });
    expect(toBasicUnit(splitQty('1송이'))).toEqual({ n: 1, unit: '개' });
    expect(toBasicUnit(splitQty('10구'))).toEqual({ n: 10, unit: '개' });
  });
});
