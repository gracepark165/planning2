import { describe, expect, it } from 'vitest';
import { nextFabHidden } from './fabScroll';

describe('+ 재료 추가 버튼 숨기기 (V3-6-3)', () => {
  const page = 2000;
  const vh = 800;
  it('아래로 스크롤하면 숨기고, 위로 스크롤하면 보여준다', () => {
    expect(nextFabHidden(false, 100, 300, vh, page)).toBe(true);
    expect(nextFabHidden(true, 300, 200, vh, page)).toBe(false);
  });
  it('맨 아래·맨 위에 닿으면 보여준다', () => {
    expect(nextFabHidden(true, 1100, 1200, vh, page)).toBe(false);
    expect(nextFabHidden(true, 50, 0, vh, page)).toBe(false);
  });
  it('작은 흔들림은 무시한다', () => {
    expect(nextFabHidden(true, 500, 503, vh, page)).toBe(true);
    expect(nextFabHidden(false, 500, 497, vh, page)).toBe(false);
  });
});
