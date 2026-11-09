import { describe, expect, it } from 'vitest';
import { SUBSTITUTES } from '../data';
import { addDays } from './date';
import { adaptRecipe } from './recipeAdapt';
import type { Item, Recipe } from './types';

const today = '2026-11-09';
const item = (name: string, left: number): Item => ({
  id: name, name, qty: '1개', core: '', location: '냉장', enteredAt: today, expiresAt: addDays(today, left),
  expiryBasis: 'table', remaining: '넉넉해요', source: 'manual', portioned: false,
});
const rec = (name: string, uses: string[], keeps: string[] = []): Recipe => ({ name, uses, keeps, buy: [] });

describe('레시피 재료를 냉장고 재료로 맞추기 (2026-11-09)', () => {
  it('있는 재료면 그대로 (같은 객체)', () => {
    const r = rec('대파 제육볶음', ['삼겹살', '대파']);
    expect(adaptRecipe(r, [item('삼겹살', 3), item('대파', 5)], SUBSTITUTES, today)).toBe(r);
  });

  it('없으면 같은 묶음에서 소비기한이 가까운 것으로, 이름에 있으면 이름도', () => {
    const r = adaptRecipe(rec('닭다리살 데리야끼 덮밥', ['닭다리살']), [item('닭가슴살', 5), item('닭안심', 2)], SUBSTITUTES, today);
    expect(r).toMatchObject({ name: '닭안심 데리야끼 덮밥', uses: ['닭안심'] });
  });

  it('일반 이름(돼지고기)도 같은 핵심 재료 묶음으로 쓴다', () => {
    expect(adaptRecipe(rec('제육볶음', ['제육용']), [item('돼지고기', 4)], SUBSTITUTES, today).uses).toEqual(['돼지고기']);
  });

  it('한 레시피에서 같은 재고를 두 번 쓰지 않는다', () => {
    const r = adaptRecipe(rec('부대찌개', ['햄', '소시지']), [item('베이컨', 4)], SUBSTITUTES, today);
    expect(r.uses).toEqual(['베이컨', '소시지']);
  });

  it('묶음에 없는 재료는 그대로 (대파 ↔ 양파는 바꾸지 않는다)', () => {
    expect(adaptRecipe(rec('파무침', ['대파']), [item('양파', 4)], SUBSTITUTES, today).uses).toEqual(['대파']);
  });
});
