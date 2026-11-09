// 커뮤니티 화면 문구 (규칙: 해요체, 꾸짖지 않기)

import type { ShareStatus, Topic } from './client';

export const TOPIC_META: Record<Topic, { label: string; emoji: string; hint: string }> = {
  meal: { label: '끼니 인증', emoji: '🍚', hint: '냉장고 재료로 만든 한 끼를 자랑해 주세요' },
  share: { label: '나눔·교환', emoji: '🤝', hint: '다 못 먹는 재료를 이웃과 나눠요' },
  tip: { label: '레시피·꿀팁', emoji: '💡', hint: '남은 재료 활용법, 보관법을 묻고 답해요' },
};

export const STATUS_CLASS: Record<ShareStatus, string> = { '나눔 중': 'open', '예약 중': 'hold', '나눔 완료': 'done' };

/** "방금" · "N분 전" · "N시간 전" · "N일 전" · 일주일이 넘으면 M/D */
export function timeAgo(at: number, now: number): string {
  const min = Math.floor((now - at) / 60_000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  const date = new Date(at);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
