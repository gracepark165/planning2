import { describe, expect, it } from 'vitest';
import { SUBSTITUTES } from '../data';
import { addDays } from './date';
import { adaptRecipe, adaptRecipeVariants } from './recipeAdapt';
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

  it('다른 낱말의 일부(마파두부의 두부)는 이름을 바꾸지 않는다', () => {
    expect(adaptRecipe(rec('마파두부', ['두부']), [item('부침두부', 3)], SUBSTITUTES, today)).toMatchObject({ name: '마파두부', uses: ['부침두부'] });
  });

  it('후보가 여럿이면 급한 순으로 갈래를 만든다 (앞 끼니가 하나를 쓰면 다음 끼니는 다른 것으로)', () => {
    const v = adaptRecipeVariants(rec('두부조림', ['두부']), [item('연두부', 5), item('부침두부', 2)], SUBSTITUTES, today);
    expect(v.map((r) => r.uses[0])).toEqual(['부침두부', '연두부']);
  });

  it('사야 할 재료도 냉장고에 같은 묶음 재료가 있으면 그걸로', () => {
    const r = adaptRecipe({ name: '두부 김치찌개', uses: ['피코크 김치찌개'], keeps: [], buy: ['두부'] }, [item('피코크 김치찌개', 3), item('부침두부', 3)], SUBSTITUTES, today);
    expect(r.buy).toEqual(['부침두부']);
  });
});
