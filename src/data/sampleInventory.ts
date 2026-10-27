// 시연용 첫 재고 (프로토타입 S.inv).
// 프로토타입은 left(남은 일수)·ago(들어온 지 며칠)를 숫자로 저장했지만,
// 앱은 날짜로 저장하므로 "오늘" 기준으로 입고일·소비기한을 만들어 넣는다.
// 그래서 언제 시연해도 프로토타입과 같은 상태로 보인다.

import { addDays } from '../rules/date';
import type { DateKey, Item, Location } from '../rules/types';
import { findCatalog } from './index';

export interface SampleSeed {
  name: string;
  qty: string;
  /** 남은 소비기한(일) */
  left: number;
  /** 들어온 지 며칠 */
  ago: number;
  location: Location;
  portion?: { count: number; unit: string };
}

export const SAMPLE_SEEDS: SampleSeed[] = [
  { name: '닭안심', qty: '300g', left: 1, ago: 4, location: '냉장' },
  { name: '소고기 불고기용', qty: '200g', left: 2, ago: 5, location: '냉장' },
  { name: '오이', qty: '2개', left: 2, ago: 4, location: '냉장' },
  { name: '우유', qty: '900ml', left: 3, ago: 6, location: '냉장' },
  { name: '삼겹살', qty: '300g', left: 5, ago: 5, location: '냉장' },
  { name: '삼겹 베이컨', qty: '1팩', left: 6, ago: 4, location: '냉장' },
  { name: '대파', qty: '소분 1봉', left: 5, ago: 4, location: '냉장', portion: { count: 1, unit: '봉' } },
  { name: '양파', qty: '500g', left: 14, ago: 3, location: '실온' },
  { name: '계란', qty: '20구', left: 14, ago: 3, location: '냉장' },
  { name: '버터', qty: '200g', left: 45, ago: 10, location: '냉장' },
  { name: '새우살', qty: '400g', left: 40, ago: 21, location: '냉동' },
  { name: '만두', qty: '1.01kg', left: 60, ago: 30, location: '냉동' },
  { name: '카레가루', qty: '1봉', left: 200, ago: 30, location: '실온' },
  { name: '스파게티면', qty: '500g', left: 300, ago: 20, location: '실온' },
];

export function makeSampleInventory(today: DateKey): Item[] {
  return SAMPLE_SEEDS.map((s, i) => ({
    id: `sample-${i + 1}`,
    name: s.name,
    qty: s.qty,
    core: findCatalog(s.name)?.core ?? '',
    location: s.location,
    enteredAt: addDays(today, -s.ago),
    expiresAt: addDays(today, s.left),
    expiryBasis: 'table',
    remaining: '넉넉해요',
    source: 'order',
    portioned: !!s.portion,
    ...(s.portion ? { count: s.portion.count, unit: s.portion.unit } : {}),
  }));
}
