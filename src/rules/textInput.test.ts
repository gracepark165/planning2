// docs/text-input-rules.md 의 예시 표를 직접 읽어서 검사한다.
// 예시를 추가·수정할 때는 문서만 고치면 된다.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CATALOG } from '../data';
import { parseItem, parseTextInput, splitItems, type ParseNeed } from './textInput';

const DOC = readFileSync(new URL('../../docs/text-input-rules.md', import.meta.url), 'utf8');

/** 문서에서 "테스트가 이 표를 읽어요" 주석 바로 아래 표들을 순서대로 꺼낸다 */
function docTables(): string[][][] {
  const parts = DOC.split('<!-- 테스트가 이 표를 읽어요').slice(1);
  return parts.map((part) =>
    part
      .split('\n')
      .slice(1) // 주석 줄
      .filter((l) => l.startsWith('|'))
      .slice(2) // 머리줄, 구분줄
      .map((l) => l.slice(1, -1).split('|').map((c) => c.trim())),
  );
}

const [ITEM_ROWS, SPLIT_ROWS] = docTables();
const NONE = '—';
const NEED: Record<string, ParseNeed> = { 개수: 'count', 소비기한: 'expiry', 이름: 'name' };

describe('문서 표 읽기', () => {
  it('예시 표 두 개를 찾았다', () => {
    expect(ITEM_ROWS.length).toBeGreaterThanOrEqual(40);
    expect(SPLIT_ROWS.length).toBeGreaterThanOrEqual(5);
    for (const r of ITEM_ROWS) expect(r).toHaveLength(7);
    for (const r of SPLIT_ROWS) expect(r).toHaveLength(3);
  });
});

describe('한 항목 읽기 (문서 4장 예시)', () => {
  it.each(ITEM_ROWS)('%s', (input, name, portioned, count, unit, note, needs) => {
    const got = parseItem(input, CATALOG);
    expect({
      name: got.name,
      portioned: got.portioned,
      count: got.count,
      unit: got.unit,
      note: got.note,
      needs: got.needs,
    }).toEqual({
      name,
      portioned: portioned === 'O',
      count: count === '?' ? undefined : Number(count),
      unit,
      note: note === NONE ? undefined : note,
      needs: needs === NONE ? [] : needs.split(',').map((n) => NEED[n.trim()]),
    });
  });

  it('사전에서 찾으면 catalogName이 있고, 못 찾으면 없다', () => {
    expect(parseItem('국산 닭가슴살 2팩', CATALOG).catalogName).toBe('닭가슴살');
    expect(parseItem('한우 2팩', CATALOG).catalogName).toBeUndefined();
  });

  it('이름 후보 칩: 고른 이름 먼저, 그다음 같이 걸린 이름 (고른 이름 안에 든 것은 뺌)', () => {
    expect(parseItem('냉동새우살 1kg 소분 4봉', CATALOG).nameCandidates).toEqual(['새우살', '냉동새우']);
    expect(parseItem('대파 양파 1개', CATALOG).nameCandidates).toEqual(['대파', '양파']);
    expect(parseItem('두부과자 1개', CATALOG).nameCandidates).toEqual(['두부']);
    expect(parseItem('적양파 2개', CATALOG).nameCandidates).toEqual(['적양파']);
    expect(parseItem('가리비 2팩', CATALOG).nameCandidates).toEqual([]);
  });

  it('원래 입력을 raw로 보관한다', () => {
    expect(parseItem('대파 소분 한봉지', CATALOG).raw).toBe('대파 소분 한봉지');
  });
});

describe('여러 항목 나누기 (문서 5장 예시)', () => {
  it.each(SPLIT_ROWS)('%s', (input, lines, names) => {
    const text = input.replaceAll('⏎', '\n');
    expect(splitItems(text)).toHaveLength(Number(lines));
    expect(parseTextInput(text, CATALOG).map((l) => l.name)).toEqual(names.split('/').map((n) => n.trim()));
  });

  it('빈 입력이면 빈 목록', () => {
    expect(parseTextInput('', CATALOG)).toEqual([]);
    expect(parseTextInput('  ⏎ , '.replaceAll('⏎', '\n'), CATALOG)).toEqual([]);
  });
});
