import { CORE_EMOJI, DEFAULT_EMOJI } from './constants';
import type { CatalogEntry, Core } from './types';

/** 이모지 타일: 사전의 이모지 → 핵심재료별 대체 → 🍽️ */
export function emojiOf(core: Core, entry: CatalogEntry | undefined): string {
  return entry?.emoji ?? CORE_EMOJI[core] ?? DEFAULT_EMOJI;
}
