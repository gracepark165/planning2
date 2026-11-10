import { describe, expect, it } from 'vitest';
import { missingToBuy, shoppingGroups, shoppingView } from './shopping';

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

describe('장보기 목록 종류별로 묶기 (2026-11-10)', () => {
  it('재료 추가 화면의 분류 순서대로, 사전에 없으면 기타가 맨 끝', () => {
    const list = ['딸기', '고추장', '삼겹살', '감자', '모르는재료', '상추', '우유'].map((name) => ({ name }));
    const g = shoppingGroups(list);
    expect(g.map((x) => x.label)).toEqual(['고기·계란', '채소', '우유·유제품', '과일', '양념·소스·가루', '기타']);
    expect(g[1].items.map((x) => x.name)).toEqual(['감자', '상추']);
  });

  it('다른 이름도 대표 이름의 분류로 (달걀 → 고기·계란)', () => {
    expect(shoppingGroups([{ name: '달걀' }])[0].label).toBe('고기·계란');
  });
});
