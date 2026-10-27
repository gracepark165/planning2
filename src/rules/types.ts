// 앱 전체에서 쓰는 데이터 타입. 화면 코드와 무관하다.

/** 'YYYY-MM-DD' (기기 현지 날짜) */
export type DateKey = string;

export type Core = '닭고기' | '소고기' | '돼지고기' | '';
export type Location = '냉장' | '냉동' | '실온';
export type Remaining = '넉넉해요' | '반쯤' | '조금';
export type ItemSource = 'order' | 'manual' | 'video' | 'text';
export type ItemState = 'soon' | 'buried' | 'ok';

/** 소비기한을 어디서 정했는지 (재료 시트의 "근거" 문구) */
export type ExpiryBasis =
  | 'table' // 기본 기간표(임시)로 자동 계산
  | 'label' // 주문 화면 등에 적힌 소비기한
  | 'user'; // 사용자가 ±1일로 고친 값 (항상 우선)

/** 품목군. 소분 기간표·소분 보관 위치를 정할 때 쓴다. */
export type FoodGroup = 'meat' | 'seafood' | 'frozenFood' | 'veg' | 'dairy' | 'grain' | 'sauce' | 'etc';

export interface Item {
  id: string;
  name: string;
  /** 화면에 보이는 수량 글자 ("300g", "소분 3봉") */
  qty: string;
  core: Core;
  location: Location;
  /** 입고일 (소분 품목은 소분한 날) */
  enteredAt: DateKey;
  /** 소비기한 */
  expiresAt: DateKey;
  expiryBasis: ExpiryBasis;
  remaining: Remaining;
  source: ItemSource;
  /** 소분 품목인지. 소분 품목은 count 단위로 재고에서 차감한다. */
  portioned: boolean;
  /** 소분 개수 (예: 3) */
  count?: number;
  /** 소분 단위 (예: '봉', '덩이', '개') */
  unit?: string;
  /** 참고 정보 (예: '400g') — 계산에는 쓰지 않는다 */
  note?: string;
}

export interface MealLog {
  itemId: string;
  action: 'eat' | 'discard';
  at: string; // ISO 시각
}

export interface Plan {
  mealsPerWeek: number;
  doneMeals: DoneMeal[];
  rejectedRecipes: string[];
  /** 끼니 순번 → "바꾸기"를 누른 횟수 */
  swapIndex: Record<number, number>;
}

export interface DoneMeal {
  recipe: string;
  /** 확정 시 재고에서 뺀 재료 (실행 취소용) */
  usedItems: Item[];
  /** 확정 당시 "오늘 내일 해요"였던 재료 이름 */
  soonUsed: string[];
  at: string;
}

/** 재료 사전 한 줄 */
export interface CatalogEntry {
  name: string;
  emoji?: string;
  core: Core;
  /** 기본 기간(일) — 입고일 + 이 값 = 소비기한 */
  shelfDays: number;
  location: Location;
  group: FoodGroup;
  /** 직접 추가 화면에서 고를 때 넣는 기본 수량 */
  defaultQty?: string;
  /** 직접 추가 화면의 타일에 보이는지 */
  picker?: boolean;
}

/** 이번 주 플랜 후보 레시피 */
export interface Recipe {
  name: string;
  /** 쓰는 재료 (확정 시 재고에서 차감) */
  uses: string[];
  /** 상비 재료 (있어야 하지만 차감하지 않음) */
  keeps: string[];
  /** 사야 할 재료 */
  buy: string[];
}

export interface Retailer {
  name: string;
  /** 주문일 + 이 값 = 입고일 */
  checkinDays: number;
  description: string;
}

/** 영상 확인 예시 결과 (AI 연결 전까지 사용) */
export interface VideoExample {
  id: string;
  url: string;
  title: string;
  ingredients: { name: string; core?: Core }[];
  skipped: string[];
}

/** 주문 화면 읽기 예시 결과 (AI 연결 전까지 사용) */
export interface OrderExampleItem {
  name: string;
  qty: string;
  core: Core;
  /** 주문 화면에서 읽은 남은 소비기한(일) */
  shelfDays: number;
  /** 읽은 결과를 확신하는지. false면 확인 표시를 한다. */
  confident: boolean;
  basisText: string;
}

export interface SubstituteGroup {
  id: string;
  label: string;
  core: Core;
  members: string[];
  note?: string;
}

export interface SubstituteTable {
  version: number;
  note: string;
  groups: SubstituteGroup[];
  neverSuggest: [string, string][];
  basicSeasonings: string[];
}
