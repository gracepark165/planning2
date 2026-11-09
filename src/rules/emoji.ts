import { CORE_EMOJI, DEFAULT_EMOJI } from './constants';
import type { CatalogEntry, Core } from './types';

/** 이모지 타일: 사전의 이모지 → 핵심재료별 대체 → 🍽️ */
export function emojiOf(core: Core, entry: CatalogEntry | undefined): string {
  return entry?.emoji ?? CORE_EMOJI[core] ?? DEFAULT_EMOJI;
}

/** 종류별 대표 그림이 있는 종류 (kinds.json의 모든 종류, 2026-11-09) */
const KIND_IMAGES = new Set(['leafVeg', 'veg', 'rootVeg', 'mushroom', 'fruit', 'rawMeat', 'groundMeat', 'processedMeat', 'rawSeafood', 'frozenSeafood', 'fishCake', 'egg', 'dairy', 'cheese', 'tofu', 'kimchi', 'deli', 'mealKit', 'retort', 'frozenFood', 'bread', 'riceCake', 'freshNoodle', 'grain', 'sauce', 'dryGoods', 'drink']);

/**
 * 그림 타일 주소: 사전의 그 재료 그림 → (사전에 없는 재료만) 종류별 대표 그림 → undefined(이모지로 대신).
 * 사전 재료는 그림이 없어도 제 이모지(🍎·🍌)가 대표 그림보다 정확하므로 종류 그림을 쓰지 않는다.
 */
export function imageOf(entry: CatalogEntry | undefined, kind?: string): string | undefined {
  if (entry?.image) return `/ingredients/${entry.image}.png`;
  if (entry && !entry.mine) return undefined;
  const k = kind ?? entry?.kind;
  return k && KIND_IMAGES.has(k) ? `/ingredients/kind-${k}.png` : undefined;
}
