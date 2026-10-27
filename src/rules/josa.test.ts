import { describe, expect, it } from 'vitest';
import { eul, eun, iga, ro, withJosa } from './josa';

describe('한글 조사', () => {
  it('이/가', () => {
    expect(iga('닭안심')).toBe('이');
    expect(iga('대파')).toBe('가');
    expect(iga('소고기 불고기용')).toBe('이');
  });

  it('을/를', () => {
    expect(withJosa('우유', eul)).toBe('우유를');
    expect(withJosa('삼겹살', eul)).toBe('삼겹살을');
  });

  it('은/는', () => {
    expect(withJosa('두부 김치찌개', eun)).toBe('두부 김치찌개는');
    expect(withJosa('삼겹살 구이', eun)).toBe('삼겹살 구이는');
  });

  it('으로/로: ㄹ 받침은 로', () => {
    expect(withJosa('닭안심', ro)).toBe('닭안심으로');
    expect(withJosa('대파', ro)).toBe('대파로');
    expect(withJosa('삼겹살', ro)).toBe('삼겹살로');
  });

  it('한글이 아닌 글자로 끝나면 받침 없음으로 본다', () => {
    expect(iga('ABC')).toBe('가');
    expect(eul('')).toBe('를');
  });
});
