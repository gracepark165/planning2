import { describe, expect, it } from 'vitest';
import { clusterSameName, groupByCategory } from './homeGroups';
import { categoryOfItem } from '../data';
import { addDays } from './date';

const today = '2026-11-09';
const at = (name: string, left: number, entered = 2) => ({ name, enteredAt: addDays(today, -entered), expiresAt: addDays(today, left) });

describe('같은 이름 재료 한 줄로 접기', () => {
  it('바로 이어진 같은 이름끼리 묶는다', () => {
    const list = [at('우유', 4), at('우유', 9), at('계란', 10), at('두부', 12), at('두부', 13), at('두부', 20)];
    expect(clusterSameName(list).map((c) => c.map((i) => i.name).join('+'))).toEqual(['우유+우유', '계란', '두부+두부+두부']);
  });
  it('하나뿐이면 한 줄짜리 묶음', () => {
    expect(clusterSameName([at('대파', 5)])).toHaveLength(1);
    expect(clusterSameName([])).toEqual([]);
  });
});

describe('싱싱해요 큰 분류로 묶기', () => {
  const order = ['meat', 'seafood', 'veg', 'dairyEgg', 'sauce'];
  const cat: Record<string, string> = { 삼겹살: 'meat', 대파: 'veg', 양파: 'veg', 계란: 'dairyEgg', 버터: 'dairyEgg', 냉동새우: 'seafood', 카레가루: 'sauce' };
  const list = [at('삼겹살', 5), at('대파', 5), at('양파', 14), at('계란', 14), at('버터', 45), at('냉동새우', 90), at('카레가루', 200)];
  const groups = groupByCategory(list, today, (i) => cat[i.name], order);

  it('분류 옆 날짜는 그 안에서 가장 임박한 재료', () => {
    expect(groups.map((g) => [g.id, g.nearestLeft])).toEqual([
      ['meat', 5],
      ['veg', 5],
      ['dairyEgg', 14],
      ['seafood', 90],
      ['sauce', 200],
    ]);
  });
  it('분류끼리는 임박한 순, 같으면 재료 추가 화면의 분류 순서', () => {
    expect(groups[0].id).toBe('meat');
    expect(groups[1].id).toBe('veg');
  });
  it('분류 안은 넘겨받은 순서(유통기한 가까운 순) 그대로', () => {
    expect(groups.find((g) => g.id === 'veg')!.items.map((i) => i.name)).toEqual(['대파', '양파']);
  });
});

describe('재료의 큰 분류', () => {
  it('재료 사전에 있으면 사전 분류', () => {
    expect(categoryOfItem({ name: '삼겹살' })).toBe('meat');
    expect(categoryOfItem({ name: '달걀' })).toBe('dairyEgg');
    expect(categoryOfItem({ name: '냉동새우' })).toBe('seafood');
  });
  it('사전에 없으면 품목군, 그것도 없으면 기타', () => {
    expect(categoryOfItem({ name: '콜라비', group: 'veg' })).toBe('veg');
    expect(categoryOfItem({ name: '수제 소시지', group: 'meat' })).toBe('meat');
    expect(categoryOfItem({ name: '모르는 음식', group: 'etc' })).toBe('etc');
    expect(categoryOfItem({ name: '모르는 음식' })).toBe('etc');
  });
});
