// 알림 시간 고르기 (B-3, 수정명세 v3 V3-6-2): 오후 5시 ~ 9시 5개를 먼저, 나머지는 "다른 시간"으로 펼친다.

export interface TimeChoice {
  value: string; // 'HH:MM'
  label: string;
}

const hourLabel = (h: number) => (h < 12 ? `오전 ${h}시` : h === 12 ? '낮 12시' : `오후 ${h - 12}시`);
const choice = (h: number): TimeChoice => ({ value: `${String(h).padStart(2, '0')}:00`, label: hourLabel(h) });

/** 고를 수 있는 시간: 오전 7시 ~ 오후 10시 */
const ALL_HOURS = Array.from({ length: 16 }, (_, i) => 7 + i);
const MAIN_HOURS = [17, 18, 19, 20, 21];

export function notifyTimeChoices(saved: string): { main: TimeChoice[]; more: TimeChoice[]; startOpen: boolean } {
  const main = MAIN_HOURS.map(choice);
  const more = ALL_HOURS.filter((h) => !MAIN_HOURS.includes(h)).map(choice);
  return { main, more, startOpen: !main.some((c) => c.value === saved) };
}
