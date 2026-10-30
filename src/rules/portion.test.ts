import { describe, expect, it } from 'vitest';
import { findCatalog } from '../data';
import { mealsLeft, portionOf, stepDown, stepUp } from './portion';
import type { Item } from './types';

const item = (name: string, extra: Partial<Item> = {}): Item => ({
  id: name, name, qty: findCatalog(name)?.defaultQty ?? '1개', core: '', location: '냉장',
  enteredAt: '2026-10-30', expiresAt: '2026-11-06', expiryBasis: 'table', remaining: '넉넉해요',
  source: 'manual', portioned: false, ...extra,
});

describe('재료 사용 방식 (V4-3)', () => {
  it('소분이면 pieces', () => {
    expect(portionOf(item('닭가슴살', { portioned: true, count: 3 }))).toBe('pieces');
  });

  it('재료 사전 기본값: 계란·우유·김치·양파·버터·카레가루·고추장·쌀·치즈는 나눠 씀, 두부·애호박·오이·감자는 한 번에', () => {
    for (const n of ['계란', '우유', '김치', '양파', '버터', '카레가루', '고추장', '쌀', '치즈']) expect(portionOf(item(n)), n).toBe('level');
    for (const n of ['두부', '애호박', '오이', '감자']) expect(portionOf(item(n)), n).toBe('whole');
  });

  it('사전에 없으면 단위로: 구·ml·l·g·kg·통·망·봉은 나눠 씀, 그 밖은 한 번에', () => {
    for (const qty of ['10구', '500ml', '1.5l', '300g', '1kg', '1통', '1망', '1봉']) expect(portionOf(item('그래놀라', { qty })), qty).toBe('level');
    for (const qty of ['1개', '2팩', '1모']) expect(portionOf(item('그래놀라', { qty })), qty).toBe('whole');
  });

  it('사용자가 정한 값이 먼저', () => {
    expect(portionOf(item('두부', { portion: 'level' }))).toBe('level');
    expect(portionOf(item('계란', { portion: 'whole' }))).toBe('whole');
  });

  it('남은 끼니 수: 나눠 쓰는 재료는 넉넉해요 3 · 반쯤 2 · 조금 1, 소분은 개수, 한 번에 쓰는 재료는 1', () => {
    expect(mealsLeft(item('계란'))).toBe(3);
    expect(mealsLeft(item('우유', { remaining: '반쯤' }))).toBe(2);
    expect(mealsLeft(item('우유', { remaining: '조금' }))).toBe(1);
    expect(mealsLeft(item('닭가슴살', { portioned: true, count: 3 }))).toBe(3);
    expect(mealsLeft(item('두부'))).toBe(1);
  });

  it('단계 내리기·올리기: 넉넉해요 → 반쯤 → 조금 → 다 씀(null)', () => {
    expect(stepDown('넉넉해요')).toBe('반쯤');
    expect(stepDown('반쯤')).toBe('조금');
    expect(stepDown('조금')).toBeNull();
    expect(stepUp('조금')).toBe('반쯤');
    expect(stepUp('넉넉해요')).toBe('넉넉해요');
  });
});
