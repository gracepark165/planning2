// 날짜 계산. 시각·시간대 영향을 받지 않도록 'YYYY-MM-DD' 날짜끼리만 계산한다.
// "오늘"은 항상 바깥에서 받는다 (테스트에서 고정할 수 있게).

import type { DateKey } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Date → 기기 현지 날짜 'YYYY-MM-DD' */
export function toDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(now: Date = new Date()): DateKey {
  return toDateKey(now);
}

function toUtcMs(key: DateKey): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`날짜 형식이 아니에요: ${key}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 날짜에 n일 더하기 (음수면 빼기) */
export function addDays(key: DateKey, n: number): DateKey {
  const d = new Date(toUtcMs(key) + n * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** to − from (일). to가 더 늦으면 양수. */
export function daysBetween(from: DateKey, to: DateKey): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** 요일 한 글자 ('금') */
export function dayOfWeek(key: DateKey): string {
  return DOW[new Date(toUtcMs(key)).getUTCDay()];
}

/** 앱의 모든 날짜 표기: '10/30 (금)' (월이 바뀌어도 헷갈리지 않게 항상 월/일) */
export function formatDate(key: DateKey): string {
  const [, m, d] = key.split('-').map(Number);
  return `${m}/${d} (${dayOfWeek(key)})`;
}

/** 오늘·내일은 앞에 붙인다: '오늘 · 10/30 (금)', '내일 · 10/31 (토)', 그 밖은 '11/2 (월)' */
export function formatDayLabel(key: DateKey, today: DateKey): string {
  const diff = daysBetween(today, key);
  if (diff === 0) return `오늘 · ${formatDate(key)}`;
  if (diff === 1) return `내일 · ${formatDate(key)}`;
  return formatDate(key);
}
