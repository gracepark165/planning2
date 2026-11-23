import { describe, expect, it } from 'vitest';
import { DEMO_FRIDGE_HASH, DEMO_FRIDGE_RESULT, DEMO_FRIDGE_RATIO, dHashOf, hamming, isDemoFridge } from './fridgeDemo';
import { productToPicks } from './convert';
import { findCatalog } from '../data';

describe('냉장고 사진 시연', () => {
  it('hamming: 다른 비트 수', () => {
    expect(hamming('0000', '0000')).toBe(0);
    expect(hamming('000f', '0000')).toBe(4);
    expect(hamming('ff', 'ffff')).toBe(64);
  });

  it('dHashOf: 왼쪽이 더 밝으면 1', () => {
    const desc = Array.from({ length: 72 }, (_, i) => 100 - (i % 9));
    expect(dHashOf(desc)).toBe('ffffffffffffffff');
    expect(dHashOf(desc.map((v) => -v))).toBe('0000000000000000');
  });

  it('예시 사진: 지문이 가깝고 비율이 비슷할 때만 (잘라낸 사진은 맞고, 반전·다른 사진은 아님)', () => {
    expect(isDemoFridge(DEMO_FRIDGE_HASH, DEMO_FRIDGE_RATIO)).toBe(true);
    expect(isDemoFridge('74adaea575ade96d', 1.785)).toBe(true); // 가장자리를 잘라 낸 사진
    expect(isDemoFridge('d5ca8a5a514a69c9', DEMO_FRIDGE_RATIO)).toBe(false); // 좌우 반전
    expect(isDemoFridge(DEMO_FRIDGE_HASH, 0.88)).toBe(false); // 비율이 다름
  });

  it('예시 결과는 모두 담긴다 (음료 없음, 사전 재료는 사전 이름으로)', () => {
    const { picks, skipped } = productToPicks(DEMO_FRIDGE_RESULT, '2026-11-23', findCatalog, 30);
    expect(skipped).toEqual([]);
    expect(picks).toHaveLength(DEMO_FRIDGE_RESULT.items.length);
    expect(picks.find((p) => p.name === '계란')?.qty).toBe('10개');
    expect(picks.find((p) => p.name === '우유')?.qty).toBe('1800ml');
    expect(picks.find((p) => p.name === '양상추')?.customKind).toBeUndefined(); // 2026-11-23 사전에 넣음
    expect(picks.every((p) => p.category)).toBe(true);
  });
});
