import { CORE_EMOJI, DEFAULT_EMOJI } from './constants';
import type { CatalogEntry, Core } from './types';

/** 이모지 타일: 사전의 이모지 → 핵심재료별 대체 → 🍽️ */
export function emojiOf(core: Core, entry: CatalogEntry | undefined): string {
  return entry?.emoji ?? CORE_EMOJI[core] ?? DEFAULT_EMOJI;
}

/** 그림 타일 주소: 사전에 그림이 있으면 그 주소, 없으면 undefined (이모지로 대신) */
export function imageOf(entry: CatalogEntry | undefined): string | undefined {
  return entry?.image ? `/ingredients/${entry.image}.png` : undefined;
}
