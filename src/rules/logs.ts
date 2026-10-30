// 다 먹었어요 / 버렸어요 기록을 화면에 보여줄 때 쓰는 문구

import type { MealLog } from './types';

/** 기록 카드의 버린 기록: '버렸어요 · 깜빡했어요' (이유가 없으면 '버렸어요') */
export const discardLabel = (log: Pick<MealLog, 'discardReason'>) =>
  log.discardReason ? `버렸어요 · ${log.discardReason}` : '버렸어요';
