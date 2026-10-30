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
  | 'user' // 사용자가 ±1일로 고친 값 (항상 우선)
  | 'kind' // 재료 사전에 없어서, AI가 고른 종류의 기본 기간(종류별 기본 기간표, 임시)
  | 'mine' // 지난번에 같은 재료를 넣을 때 정한 기간 (기기에 기억)
  | 'sample'; // 예시 재료 (시연용 날짜라 기간 문구를 보여주지 않는다)

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
  /** 품목군. 재료 사전에 없는 재료만 저장한다 (있는 재료는 사전에서 본다). 상비 재료 제외에 쓴다. */
  group?: FoodGroup;
  /** 소분 품목인지. 소분 품목은 count 단위로 재고에서 차감한다. */
  portioned: boolean;
  /** 소분 개수 (예: 3) */
  count?: number;
  /** 소분 단위 (예: '봉', '덩이', '개') */
  unit?: string;
  /** 참고 정보 (예: '400g') — 계산에는 쓰지 않는다 */
  note?: string;
  /** 처음 열 때 넣어 둔 예시 재료 */
  sample?: boolean;
}

export interface MealLog {
  itemId: string;
  /** 재료 이름 (기록 카드에 보여줄 때 씀). 예전 기록에는 없음 */
  name?: string;
  action: 'eat' | 'discard';
  at: string; // ISO 시각
  /** 기록할 때 재료 상태. 저장 형식 v2 전에 쌓인 기록은 'unknown' */
  stateAtAction: ItemState | 'unknown';
  /** 버린 이유 (버렸어요에서 고른 칩). 묻지 않았거나 건너뛰면 null */
  discardReason: string | null;
}

export interface Plan {
  mealsPerWeek: number;
  doneMeals: DoneMeal[];
  rejectedRecipes: string[];
  /** 끼니 순번 → "바꾸기"를 누른 횟수 */
  swapIndex: Record<number, number>;
  /** 영상 확인에서 넣은 고정 끼니 (다시 짜도 유지, 바꾸기 없음) */
  pinned: PinnedMeal[];
}

export interface PinnedMeal extends Recipe {
  id: string;
  source: 'video';
  url: string;
  title: string;
  /** "오늘 한 끼로 할게요"로 넣었으면 그날 (지나면 무시하고 다시 배치) */
  date?: DateKey;
  /** 급한 재료를 못 먹게 되는데도 "그래도 넣을게요"를 골랐음 (조건 없이 가장 빠른 날) */
  force?: boolean;
}

/** 장보기 목록 한 줄 */
export interface ShoppingItem {
  name: string;
  from: 'plan' | 'video';
  checked: boolean;
  /** 플랜에서 온 재료를 ✕로 지웠으면 true (플랜이 계속 사야 할 재료로 내놓아도 숨긴다) */
  removed?: boolean;
}

/** 첫 사용 안내 */
export interface Onboarding {
  /** 오프닝 화면에서 시작하기를 눌렀는지 (처음 한 번만 보여준다) */
  introSeen: boolean;
  /** 안내 카드에서 버튼을 한 번 골랐는지 */
  seen: boolean;
  mode: 'sample' | 'mine';
  /** 내 재료를 넣은 뒤 "예시 재료는 지울까요?"를 물었는지 (한 번만 묻는다) */
  sampleAsked: boolean;
  /** 처음으로 "이걸로 할게요"를 누른 시각 (홈 화면 추가 카드를 보여줄 때, V3-5) */
  firstConfirmAt: string | null;
}

/** 앱을 연 날 수 (같은 날 여러 번 연 건 한 번으로 센다, V3-5) */
export interface Opens {
  count: number;
  lastDate: DateKey | null;
}

/** 알림 설정 (A단계는 저장만, 보내기는 B단계) */
export interface NotifSettings {
  /** "알려드릴까요?" 카드를 보여준 시각 */
  askedAt: string | null;
  /** "나중에"를 골랐는지 (다시 묻지 않음) */
  optedLater: boolean;
  /** 'HH:MM' */
  time: string;
  /** 인앱 배너를 닫은 날 (그날은 다시 안 보여줌) */
  bannerClosedOn: DateKey | null;
}

export interface DoneMeal {
  recipe: string;
  /** 확정 시 재고에서 뺀 재료 (실행 취소용) */
  usedItems: Item[];
  /** 확정 당시 "오늘 내일 해요"였던 재료 이름 */
  soonUsed: string[];
  at: string;
  /** 확정한 날 (오늘 먹은 끼니가 있으면 플랜은 내일부터). 예전 기록에는 없음 */
  date?: DateKey;
  /** 영상에서 넣은 고정 끼니를 확정했으면 그 끼니 (되돌리면 다시 고정 끼니로) */
  pinned?: PinnedMeal;
}

/** 재료 사전 한 줄 */
export interface CatalogEntry {
  name: string;
  /** 같은 재료의 다른 이름 (달걀 → 계란). 읽을 때 name으로 바꾼다. */
  aliases?: string[];
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
  /** 재료 사전이 아니라 "지난번 값"(기기에 기억한 내 재료)에서 온 항목 */
  mine?: boolean;
  /** 재료 추가 화면의 큰 분류 id (지난번 값 항목에는 없음) */
  category?: string;
  /** 종류별 기본 기간표에서 기간을 가져온 항목이면 그 종류 id */
  kind?: string;
}

/** 재료 추가 화면의 큰 분류 (육류, 채소 …) */
export interface FoodCategory {
  id: string;
  label: string;
  emoji: string;
  /** 목록에 없는 재료를 이 분류에서 직접 적으면 쓰는 종류 (종류별 기본 기간표 id) */
  customKind: string;
}

/** 종류별 기본 기간표의 한 줄 (사전에 없는 재료를 AI가 이 종류로 분류한다) */
export interface FoodKind {
  id: string;
  label: string;
  examples: string;
  /** 입고일 + 이 값 = 소비기한 (기본 보관 위치 기준) */
  days: number;
  location: Location;
  group: FoodGroup;
  /** 냉동 보관일 때의 기간. 없으면 days */
  freezerDays?: number;
}

/** 사전에 없는 재료를 넣을 때 정한 값 (다음에 같은 재료가 나오면 자동으로 채운다) */
export interface MyFood {
  name: string;
  shelfDays: number;
  location: Location;
  group: FoodGroup;
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
  /** 이 시각(0~23시) 이후 주문은 입고일이 하루 늦어진다. 없으면 시각과 무관. */
  cutoffHour?: number;
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
  /** 대체를 제안할 때 같이 보여줄 안내 (예: 짠맛·매운 정도 차이) */
  tip?: string;
}

export interface SubstituteTable {
  version: number;
  note: string;
  groups: SubstituteGroup[];
  neverSuggest: [string, string][];
  basicSeasonings: string[];
}
