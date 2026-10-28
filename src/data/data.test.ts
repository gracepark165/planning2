import { describe, expect, it } from 'vitest';
import { BASIC_SEASONINGS, CORES, LOCATIONS } from '../rules/constants';
import { daysBetween } from '../rules/date';
import {
  CATALOG,
  ORDER_EXAMPLE_ITEMS,
  PICKER_CATALOG,
  PLAN_RECIPES,
  RETAILERS,
  SUBSTITUTES,
  VIDEO_EXAMPLES,
  canonicalName,
  findCatalog,
} from './index';
import { SAMPLE_SEEDS, makeSampleInventory } from './sampleInventory';

const FOOD_GROUPS = ['meat', 'seafood', 'frozenFood', 'veg', 'dairy', 'grain', 'sauce', 'etc'];

describe('재료 사전', () => {
  it('이름이 겹치지 않는다', () => {
    const names = CATALOG.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('모든 항목의 값이 정해진 범위 안에 있다', () => {
    for (const c of CATALOG) {
      expect(LOCATIONS, c.name).toContain(c.location);
      expect(CORES, c.name).toContain(c.core);
      expect(FOOD_GROUPS, c.name).toContain(c.group);
      expect(c.shelfDays, c.name).toBeGreaterThan(0);
    }
  });

  it('직접 추가 타일은 프로토타입과 같은 16종, 같은 순서다', () => {
    expect(PICKER_CATALOG.map((c) => c.name)).toEqual([
      '계란', '양파', '대파', '감자', '당근', '양배추', '고추', '마늘',
      '우유', '버터', '두부', '닭가슴살', '소고기', '돼지고기', '새우', '식빵',
    ]);
    for (const c of PICKER_CATALOG) {
      expect(c.emoji, c.name).toBeTruthy();
      expect(c.defaultQty, c.name).toBeTruthy();
    }
  });

  it('CLAUDE.md 임시 기본 기간표와 같다', () => {
    const table: Record<string, number> = {
      계란: 21, 양파: 25, 대파: 7, 감자: 30, 당근: 14, 양배추: 10, 고추: 7, 마늘: 30,
      우유: 7, 버터: 45, 두부: 7, 닭가슴살: 3, 소고기: 3, 돼지고기: 3, 새우: 60, 식빵: 5,
    };
    for (const [name, days] of Object.entries(table)) {
      expect(findCatalog(name)?.shelfDays, name).toBe(days);
    }
  });

  it('샘플 재고·레시피·예시·대체 묶음에 나오는 재료가 모두 사전에 있다', () => {
    const used = new Set<string>([
      ...SAMPLE_SEEDS.map((s) => s.name),
      ...PLAN_RECIPES.flatMap((r) => [...r.uses, ...r.keeps, ...r.buy]),
      ...VIDEO_EXAMPLES.flatMap((v) => v.ingredients.map((i) => i.name)),
      ...ORDER_EXAMPLE_ITEMS.map((o) => o.name),
      ...SUBSTITUTES.groups.flatMap((g) => g.members),
    ]);
    const missing = [...used].filter((n) => !findCatalog(n));
    expect(missing).toEqual([]);
  });
});

describe('다른 이름 (aliases)', () => {
  it('다른 이름은 대표 이름이나 다른 다른 이름과 겹치지 않는다', () => {
    const all = CATALOG.flatMap((c) => [c.name, ...(c.aliases ?? [])].map((n) => n.replace(/\s+/g, '')));
    expect(new Set(all).size).toBe(all.length);
  });

  it('다른 이름으로 찾아도 대표 이름', () => {
    expect(canonicalName('달걀')).toBe('계란');
    expect(canonicalName('쇠고기')).toBe('소고기');
    expect(canonicalName('불고기용 소고기')).toBe('소고기 불고기용');
    expect(findCatalog('앞다리살')?.name).toBe('돼지고기 앞다리살');
    expect(canonicalName('연어')).toBe('연어');
  });
});

describe('다른 데이터 파일', () => {
  it('기본 양념 목록이 상수와 대체 재료 파일에서 같다', () => {
    expect([...SUBSTITUTES.basicSeasonings].sort()).toEqual([...BASIC_SEASONINGS].sort());
  });

  it('대체 묶음의 핵심재료가 사전과 맞다', () => {
    for (const g of SUBSTITUTES.groups) {
      if (!g.core) continue;
      for (const m of g.members) expect(findCatalog(m)?.core, `${g.id}/${m}`).toBe(g.core);
    }
  });

  it('입고일 규칙: 컬리 다음 날, B마트 당일', () => {
    const days = Object.fromEntries(RETAILERS.map((r) => [r.name, r.checkinDays]));
    expect(days).toMatchObject({ 컬리: 1, B마트: 0 });
  });
});

describe('샘플 재고', () => {
  const today = '2026-10-27';
  const inv = makeSampleInventory(today);

  it('날짜로 바꾼 뒤 다시 계산해도 프로토타입의 남은 일수·들어온 일수와 같다', () => {
    inv.forEach((item, i) => {
      expect(daysBetween(today, item.expiresAt), item.name).toBe(SAMPLE_SEEDS[i].left);
      expect(daysBetween(item.enteredAt, today), item.name).toBe(SAMPLE_SEEDS[i].ago);
    });
  });

  it('핵심재료가 프로토타입과 같다', () => {
    const cores = Object.fromEntries(inv.map((i) => [i.name, i.core]));
    expect(cores).toMatchObject({
      닭안심: '닭고기',
      '소고기 불고기용': '소고기',
      삼겹살: '돼지고기',
      '삼겹 베이컨': '돼지고기',
      우유: '',
      새우살: '',
    });
  });

  it('id가 겹치지 않고, 대파는 소분 1봉이다', () => {
    expect(new Set(inv.map((i) => i.id)).size).toBe(inv.length);
    const pa = inv.find((i) => i.name === '대파');
    expect(pa).toMatchObject({ portioned: true, count: 1, unit: '봉' });
    expect(inv.filter((i) => i.portioned)).toHaveLength(1);
  });
});
