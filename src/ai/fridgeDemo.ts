// 냉장고 사진 시연 (2026-11-23, 사용자 요청: AI 비용 없이 시연 영상을 찍을 수 있게)
// 정해 둔 예시 냉장고 사진(public/demo/fridge.webp)을 올리면 AI를 부르지 않고 미리 적어 둔 결과를 돌려준다.
// 같은 사진인지는 파일 바이트가 아니라 작은 밝기 지문(dHash 64비트)으로 본다: 폰에 저장·캡처·크기 변경을 해도 맞게.

import type { OrderAiResult } from '../../api/read';

/** 예시 냉장고 사진의 밝기 지문 (imageHash로 계산, 16진수 64비트) */
export const DEMO_FRIDGE_HASH = '54acaea575ad696c';
/** 예시 사진의 가로/세로 비율 (1503×851) */
export const DEMO_FRIDGE_RATIO = 1503 / 851;
/** 지문이 이만큼(64비트 중) 이하로 다르면 같은 사진으로 본다 */
export const DEMO_MAX_DISTANCE = 12;
/** 시연에서 "읽는 중"을 보여줄 시간 (ms) */
export const DEMO_DELAY_MS = 1800;

/** 16진수 지문 두 개가 다른 비트 수 */
export function hamming(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/** 9×8 밝기 격자 → dHash (각 줄에서 왼쪽이 오른쪽보다 밝으면 1) */
export function dHashOf(gray: readonly number[]): string {
  let bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += gray[y * 9 + x] > gray[y * 9 + x + 1] ? '1' : '0';
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

/** 예시 냉장고 사진인지 (비율이 비슷하고 지문이 가까우면) */
export const isDemoFridge = (hash: string, ratio: number) =>
  Math.abs(ratio - DEMO_FRIDGE_RATIO) < 0.2 && hamming(hash, DEMO_FRIDGE_HASH) <= DEMO_MAX_DISTANCE;

const it = (name: string, product: string, extra: Partial<OrderAiResult['items'][number]> = {}) => ({ name, product, ...extra });

/** 예시 냉장고 사진에서 AI가 읽은 것처럼 적어 둔 결과 (사진에 보이는 식재료, 음료·술은 뺌) */
export const DEMO_FRIDGE_RESULT: OrderAiResult = {
  items: [
    it('계란', '계란', { count: 10 }),
    it('버터', '버터', { count: 2 }),
    it('캄파뉴', '통밀 캄파뉴', { kind: 'bread', storage: '냉장' }),
    it('햄', '슬라이스 햄'),
    it('치즈', '체다·블루치즈 모둠'),
    it('우유', '우유', { count: 2, weight: '900ml' }),
    it('요거트', '플레인 요거트', { count: 2 }),
    it('연어', '연어 필렛 (밀폐 용기)'),
    it('소고기', '소고기 (밀폐 용기)'),
    it('양상추', '양상추', { kind: 'leafVeg', storage: '냉장' }),
    it('토마토', '토마토', { count: 3 }),
    it('파프리카', '노란 파프리카'),
    it('브로콜리', '브로콜리'),
    it('당근', '당근', { count: 4 }),
    it('블루베리', '블루베리'),
    it('래디시', '래디시', { kind: 'rootVeg', storage: '냉장' }),
    it('샐러드', '채소 샐러드 (밀폐 용기)', { kind: 'deli', storage: '냉장' }),
    it('피클', '오이 피클', { kind: 'kimchi', storage: '냉장' }),
    it('올리브', '그린 올리브 절임', { kind: 'kimchi', storage: '냉장' }),
    it('딸기잼', '딸기잼', { kind: 'sauce', storage: '냉장' }),
    it('케첩', '케첩'),
    it('머스터드', '머스터드 소스', { kind: 'sauce', storage: '냉장' }),
    it('랜치 드레싱', '랜치 드레싱', { kind: 'sauce', storage: '냉장' }),
  ],
};
