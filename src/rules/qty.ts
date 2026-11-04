// 수량 글자("300g", "1팩", "10구") ↔ 숫자 + 단위. 재료 직접 추가에서 양을 고칠 때 쓴다.

export interface QtyParts {
  n: number;
  unit: string;
}

/** "300g" → { n: 300, unit: 'g' }. 숫자가 없으면 1개로 본다. */
export function splitQty(qty: string | undefined): QtyParts {
  const m = (qty ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!m) return { n: 1, unit: '개' };
  return { n: Number(m[1]), unit: m[2].trim() || '개' };
}

export const joinQty = ({ n, unit }: QtyParts) => `${n}${unit}`;

/** ml·g은 100씩, 개는 1씩 */
export const qtyStep = (unit: string) => (unit === 'g' || unit === 'ml' ? 100 : 1);

/** 재료 직접 추가에서 고를 수 있는 단위 (2026-11-04, 사용자 요청: ml·g·개만) */
export const QTY_UNITS = ['ml', 'g', '개'] as const;

/** 기본 수량을 ml·g·개로: 300g·900ml는 그대로, 1kg·1l는 1000g·1000ml, 1송이·10구·1팩은 1개·10개·1개 */
export function toBasicUnit(q: QtyParts): QtyParts {
  const unit = q.unit.toLowerCase();
  if (unit === 'g' || unit === 'ml') return { n: q.n, unit };
  if (unit === 'kg') return { n: q.n * 1000, unit: 'g' };
  if (unit === 'l') return { n: q.n * 1000, unit: 'ml' };
  return { n: q.n, unit: '개' };
}

/** 단위를 바꿀 때 시작 숫자: 개는 1, ml·g끼리는 숫자 그대로, 개에서 ml·g으로 가면 100 */
export const switchUnit = (cur: QtyParts, unit: string): QtyParts =>
  unit === '개' ? { n: 1, unit } : { n: cur.unit === '개' ? 100 : cur.n, unit };
