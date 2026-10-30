import { describe, expect, it } from 'vitest';
import { missingToBuy, shoppingView } from './shopping';

describe('장보기 목록 (B-1)', () => {
  it('플랜의 사야 할 재료 + 영상에서 담은 재료를 합친다 (영상 재료에는 표시)', () => {
    const list = shoppingView(['감자', '고추장'], [{ name: '고추장', from: 'video', checked: false }], []);
    expect(list).toEqual([
      { name: '고추장', from: 'video', checked: false },
      { name: '감자', from: 'plan', checked: false },
    ]);
  });

  it('체크한 플랜 재료는 저장된 값으로, 지운 재료는 숨긴다', () => {
    const saved = [
      { name: '감자', from: 'plan' as const, checked: true },
      { name: '당근', from: 'plan' as const, checked: false, removed: true },
    ];
    expect(shoppingView(['감자', '당근'], saved, [])).toEqual([{ name: '감자', from: 'plan', checked: true }]);
  });

  it('이미 냉장고에 있는 재료는 보여주지 않는다', () => {
    expect(shoppingView(['감자'], [{ name: '고추장', from: 'video', checked: true }], ['고추장', '감자'])).toEqual([]);
  });
});

describe('확정할 때 사야 할 재료가 준비됐는지 (V4-6-5)', () => {
  const owned = [{ name: '삼겹살' }, { name: '계란' }];
  it('레시피의 사야 할 재료 중 냉장고에 없는 것만', () => {
    expect(missingToBuy({ buy: ['상추', '계란'] }, owned)).toEqual(['상추']);
    expect(missingToBuy({ buy: [] }, owned)).toEqual([]);
  });
  it('다른 이름(달걀 = 계란)으로 있어도 있는 것으로 본다', () => {
    expect(missingToBuy({ buy: ['달걀'] }, owned)).toEqual([]);
  });
});
