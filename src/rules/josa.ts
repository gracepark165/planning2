// 한글 조사 고르기. 마지막 글자의 받침으로 정한다.
// 한글이 아닌 글자로 끝나면 받침 없음으로 본다.

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;

/** 마지막 글자의 받침 번호 (0 = 받침 없음, 8 = ㄹ). 한글이 아니면 0. */
function finalConsonant(word: string): number {
  const code = word.trim().charCodeAt(word.trim().length - 1);
  if (Number.isNaN(code) || code < HANGUL_START || code > HANGUL_END) return 0;
  return (code - HANGUL_START) % 28;
}

const RIEUL = 8;

/** 이/가 */
export const iga = (word: string) => (finalConsonant(word) ? '이' : '가');
/** 을/를 */
export const eul = (word: string) => (finalConsonant(word) ? '을' : '를');
/** 은/는 */
export const eun = (word: string) => (finalConsonant(word) ? '은' : '는');
/** 으로/로 (ㄹ 받침이면 '로') */
export const ro = (word: string) => {
  const f = finalConsonant(word);
  return f && f !== RIEUL ? '으로' : '로';
};

/** 단어 + 조사: withJosa('대파', eul) → '대파를' */
export const withJosa = (word: string, pick: (w: string) => string) => word + pick(word);
