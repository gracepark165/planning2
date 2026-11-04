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

/** g은 100씩, 개는 1씩 */
export const qtyStep = (unit: string) => (unit === 'g' ? 100 : 1);

/** 재료 직접 추가에서 고를 수 있는 단위 (2026-11-04, 사용자 요청: 개와 g만) */
export const QTY_UNITS = ['개', 'g'] as const;

/** 기본 수량을 개·g으로: 300g은 그대로, 1kg은 1000g, 900ml는 1개(한 통), 1송이·10구·1팩은 1개·10개·1개 */
export function toBasicUnit(q: QtyParts): QtyParts {
  const unit = q.unit.toLowerCase();
  if (unit === 'g') return { n: q.n, unit: 'g' };
  if (unit === 'kg') return { n: q.n * 1000, unit: 'g' };
  if (unit === 'ml' || unit === 'l') return { n: 1, unit: '개' };
  return { n: q.n, unit: '개' };
}
