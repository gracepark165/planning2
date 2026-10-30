// 떠 있는 "+ 재료 추가" 버튼 (수정명세 v3 V3-6-3): 아래로 스크롤하면 숨기고,
// 위로 스크롤하거나 맨 위·맨 아래에 닿으면 다시 보여준다. 손떨림 정도의 작은 움직임은 무시한다.

const JITTER = 6;

export function nextFabHidden(
  hidden: boolean,
  prevY: number,
  y: number,
  viewportHeight: number,
  pageHeight: number,
): boolean {
  if (y <= 0 || viewportHeight + y >= pageHeight - JITTER) return false; // 맨 위·맨 아래
  if (y > prevY + JITTER) return true; // 아래로
  if (y < prevY - JITTER) return false; // 위로
  return hidden;
}
