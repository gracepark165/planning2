// 글로 입력해서 올리기 — 규칙 읽기 (CLAUDE.md 4-1, docs/text-input-rules.md)
// 나중에 AI를 붙일 때는 이 "읽기" 단계만 바꾸고, 결과 형태(ParsedLine)와 확인 화면은 그대로 쓴다.

import { COUNT_MAX, COUNT_MIN, ITEM_SEPARATORS, KOREAN_NUMBERS, PORTION_WORD, UNIT_ALIASES } from './constants';
import type { CatalogEntry, Remaining } from './types';

/** 사용자에게 다시 물어야 하는 것 */
export type ParseNeed =
  | 'count' // "몇 개로 나눴나요?"
  | 'expiry' // "소비기한을 골라 주세요" (재료 사전에 없음)
  | 'name'; // "이름을 확인해 주세요" (다른 이름 후보가 같이 걸림)

export interface ParsedLine {
  /** 이 줄의 원래 입력 */
  raw: string;
  /** 보여줄 이름: 사전에서 찾았으면 사전 이름, 아니면 입력에서 남은 글자 */
  name: string;
  /** 사전에서 찾은 항목의 이름 (없으면 undefined) */
  catalogName?: string;
  /** 이름 후보 칩: 고른 이름 먼저, 그다음 같이 걸린 사전 이름 */
  nameCandidates: string[];
  portioned: boolean;
  /** 개수 (1~30). 못 읽었으면 undefined */
  count?: number;
  /** 단위 (봉, 덩이, 개, 팩, 통, 구, 단, 모). 없으면 '개' */
  unit: string;
  /** 무게·부피 같은 참고 정보 ('400g') */
  note?: string;
  needs: ParseNeed[];
  /** 언제 샀는지 읽었으면 며칠 전 (입고일 = 오늘 − 이 값, V4-2) */
  enteredAgo?: number;
  /** 얼마나 남았는지 읽었으면 (V4-3) */
  remaining?: Remaining;
}

const escapeRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** 긴 말부터 맞추도록 정렬한 정규식 조각 ("덩어리"가 "덩이"보다, "하나"가 "한"보다 먼저) */
const alt = (words: readonly string[]) => [...words].sort((a, b) => b.length - a.length).map(escapeRe).join('|');

const NUM_WORDS = alt(Object.keys(KOREAN_NUMBERS));
const UNITS = alt(Object.keys(UNIT_ALIASES));
const HANGUL = '[가-힣]';

/** "소분", "소분함", "소분해서" … (뒤에 붙는 말은 정해진 것만 지워서 "소분닭가슴살" 같은 입력의 이름을 먹지 않게 한다) */
const PORTION_RE = new RegExp(`${PORTION_WORD}(?:해서|했어요|했어|해요|함|해|한)?`, 'g');
/** 무게·부피: 400g, 1kg, 900ml, 1.5L */
const WEIGHT_RE = /(\d+(?:\.\d+)?)\s*(kg|g|ml|l)(?![a-z])/i;
/** 숫자(아라비아·한글) + 단위: "3봉지", "세 봉지" */
const NUM_UNIT_RE = new RegExp(`(?<!${HANGUL})(\\d+|${NUM_WORDS})\\s*(${UNITS})(?!${HANGUL})`);
/** 홀로 떨어진 숫자: "우유 2", "닭안심 소분 다섯" */
const LONE_NUM_RE = new RegExp(`(?:^|\\s)(\\d+|${NUM_WORDS})(?=\\s|$)`);
/** 홀로 떨어진 단위: "대파 소분 봉지" */
const LONE_UNIT_RE = new RegExp(`(?:^|\\s)(${UNITS})(?=\\s|$)`);
/** 이름 바로 뒤에 이것이 오면 낱말이 끝난 것으로 본다 */
const AFTER_NAME_OK_RE = new RegExp(`^(?:\\s|\\d|$|(?:${NUM_WORDS})\\s*(?:${UNITS})(?!${HANGUL}))`);

/** 남은 글자에 읽지 못한 숫자 말이 있는지: "한판", "두세봉", "2" */
const LEFTOVER_NUM_RE = new RegExp(`\\d|(?:^|\\s)(?:${NUM_WORDS})`);

// ── 언제 샀는지 (V4-2): 앞에 있는 것부터 맞춘다 ("일주일 전"이 "N일 전"보다 먼저) ──
const NUM = `(\\d+|${NUM_WORDS})`;
const BOUGHT_TAIL = '(?:\\s*에)?(?:\\s*(?:산\\s*거|산\\s*것|샀음|샀어요|샀어|구매(?:함|했어요)?))?';
const WHEN_RULES: [RegExp, (m: RegExpExecArray) => number][] = [
  [new RegExp(`일주일\\s*전${BOUGHT_TAIL}`), () => 7],
  [new RegExp(`지난\\s*주${BOUGHT_TAIL}`), () => 7],
  [new RegExp(`(?:한\\s*)?달\\s*전${BOUGHT_TAIL}|지난\\s*달${BOUGHT_TAIL}`), () => 30],
  [new RegExp(`${NUM}\\s*주\\s*전${BOUGHT_TAIL}`), (m) => toNumber(m[1]) * 7],
  [new RegExp(`${NUM}\\s*일\\s*전${BOUGHT_TAIL}`), (m) => toNumber(m[1])],
  [new RegExp(`이틀\\s*전${BOUGHT_TAIL}`), () => 2],
  [new RegExp(`사흘\\s*전${BOUGHT_TAIL}`), () => 3],
  [new RegExp(`(?:그저께|그제)${BOUGHT_TAIL}`), () => 2],
  [new RegExp(`어제${BOUGHT_TAIL}`), () => 1],
  [new RegExp(`오늘${BOUGHT_TAIL}`), () => 0],
];

// ── 얼마나 남았는지 (V4-3) ──
const LEFT_TAIL = '(?:\\s*남(?:음|았어요|았어|은))?';
const REMAINING_RULES: [RegExp, Remaining][] = [
  [new RegExp(`반\\s*(?:쯤|정도)${LEFT_TAIL}`), '반쯤'],
  [/반\s*남(?:음|았어요|았어|은)/, '반쯤'],
  [/조금\s*남(?:음|았어요|았어|은)/, '조금'],
  [/거의\s*다\s*(?:씀|썼어요|썼어)/, '조금'],
  [/안\s*뜯은(?:\s*(?:거|것))?/, '넉넉해요'],
  [new RegExp(`새\\s*(?:거|것)(?!${HANGUL})`), '넉넉해요'],
];

const toNumber = (w: string) => (/^\d+$/.test(w) ? Number(w) : KOREAN_NUMBERS[w]);
const squash = (t: string) => t.replace(/\s+/g, ' ').trim();
const cut = (t: string, start: number, end: number) => `${t.slice(0, start)} ${t.slice(end)}`;

interface NameHit {
  entry: CatalogEntry;
  /** 원래 글자 위치 [start, end) */
  start: number;
  end: number;
  /** 낱말이 끝나는 자리에서 끝났는지 */
  wordEnd: boolean;
}

/** 띄어쓰기를 무시하고 사전 이름이 걸리는 곳을 모두 찾는다 */
function findNames(text: string, catalog: readonly CatalogEntry[]): NameHit[] {
  const idx: number[] = []; // 띄어쓰기 뺀 글자 → 원래 위치
  let compact = '';
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i])) continue;
    idx.push(i);
    compact += text[i];
  }
  const hits: NameHit[] = [];
  for (const entry of catalog) for (const name of [entry.name, ...(entry.aliases ?? [])]) {
    const key = name.replace(/\s+/g, '');
    for (let at = compact.indexOf(key); at >= 0; at = compact.indexOf(key, at + 1)) {
      const start = idx[at];
      const end = idx[at + key.length - 1] + 1;
      hits.push({ entry, start, end, wordEnd: AFTER_NAME_OK_RE.test(text.slice(end)) });
    }
  }
  return hits;
}

/** 입력을 항목으로 나눈다 (줄바꿈, 쉼표, "그리고"). 빈 항목은 뺀다. */
export function splitItems(text: string): string[] {
  const sep = new RegExp(ITEM_SEPARATORS.map(escapeRe).join('|'));
  return text
    .split(sep)
    .map(squash)
    .filter(Boolean);
}

/** 한 항목을 읽는다 */
export function parseItem(raw: string, catalog: readonly CatalogEntry[]): ParsedLine {
  let text = squash(raw);

  // 1) 소분
  const portioned = text.includes(PORTION_WORD);
  text = text.replace(PORTION_RE, ' ');

  // 1-1) 언제 샀는지·얼마나 남았는지: 이름·개수를 읽기 전에 지운다 ("지난주에 산거"의 숫자 말·글자가 섞이지 않게)
  let enteredAgo: number | undefined;
  for (const [re, days] of WHEN_RULES) {
    const m = re.exec(text);
    if (!m) continue;
    enteredAgo = days(m);
    text = cut(text, m.index, m.index + m[0].length);
    break;
  }
  let remaining: Remaining | undefined;
  for (const [re, level] of REMAINING_RULES) {
    const m = re.exec(text);
    if (!m) continue;
    remaining = level;
    text = cut(text, m.index, m.index + m[0].length);
    break;
  }

  // 2) 무게·부피 → 메모
  let note: string | undefined;
  const w = WEIGHT_RE.exec(text);
  if (w) {
    note = w[1] + w[2];
    text = cut(text, w.index, w.index + w[0].length);
  }

  // 3) 이름: 낱말이 끝나는 자리에서 끝난 것 중 가장 긴 것 (같으면 앞에 나온 것)
  const hits = findNames(text, catalog);
  const chosen = hits
    .filter((h) => h.wordEnd)
    .sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start)[0];
  const outside = hits.filter((h) => !chosen || h.start < chosen.start || h.end > chosen.end);
  const nameCandidates = [...new Set([...(chosen ? [chosen.entry.name] : []), ...outside.map((h) => h.entry.name)])];
  if (chosen) text = cut(text, chosen.start, chosen.end);

  // 4) 개수·단위
  let count: number | undefined;
  let unit: string | undefined;
  let countGiven = false;
  const nu = NUM_UNIT_RE.exec(text);
  if (nu) {
    countGiven = true;
    count = toNumber(nu[1]);
    unit = UNIT_ALIASES[nu[2]];
    text = cut(text, nu.index, nu.index + nu[0].length);
  } else {
    const n = LONE_NUM_RE.exec(text);
    if (n) {
      countGiven = true;
      count = toNumber(n[1]);
      text = cut(text, n.index, n.index + n[0].length);
    }
    const u = LONE_UNIT_RE.exec(text);
    if (u) {
      unit = UNIT_ALIASES[u[1]];
      text = cut(text, u.index, u.index + u[0].length);
    }
  }
  // 재료 이름을 찾았는데 남은 글자에 숫자 말이 있으면 개수를 잘못 읽은 것 (사전에 없으면 남은 글자가 곧 이름이라 보지 않음)
  if (!countGiven && chosen && LEFTOVER_NUM_RE.test(squash(text))) countGiven = true;
  if (count !== undefined && (count < COUNT_MIN || count > COUNT_MAX)) count = undefined;
  if (count === undefined && !countGiven && !portioned) count = 1; // 포장 그대로 1개

  const needs: ParseNeed[] = [];
  if (count === undefined) needs.push('count');
  if (!chosen) needs.push('expiry');
  if (outside.length) needs.push('name');

  return {
    raw,
    name: chosen ? chosen.entry.name : squash(text),
    catalogName: chosen?.entry.name,
    nameCandidates,
    portioned,
    count,
    unit: unit ?? '개',
    note,
    needs,
    ...(enteredAgo !== undefined ? { enteredAgo } : {}),
    ...(remaining ? { remaining } : {}),
  };
}

/** 입력 전체를 읽는다 */
export function parseTextInput(text: string, catalog: readonly CatalogEntry[]): ParsedLine[] {
  return splitItems(text).map((raw) => parseItem(raw, catalog));
}
