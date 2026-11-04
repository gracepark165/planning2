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

/** 무게·부피 단위는 100씩, 나머지는 1씩 */
export const qtyStep = (unit: string) => (['g', 'ml'].includes(unit) ? 100 : 1);

/** 고를 수 있는 단위: 재료 기본 단위를 맨 앞에, 그 뒤로 자주 쓰는 단위 */
export function unitChoices(defaultUnit: string): string[] {
  return [...new Set([defaultUnit, '개', '팩', '봉', 'g'])];
}
