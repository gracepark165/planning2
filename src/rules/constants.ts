// 규칙에 쓰는 기준값은 모두 여기에 모은다.
// 아래 숫자 대부분은 임시 기준(검증 전)이다. 식약처 기준 확인 후 바꾼다.

import type { Core, FoodGroup, ItemState, Location, Remaining } from './types';

/** 남은 소비기한이 이 값 이하면 "오늘 내일 해요" (이미 지난 것 포함) */
export const SOON_DAYS = 3;

/** 냉장고에 들어온 지 이 값 이상이면 "잊혀지는 중" (곧 상할이 아닐 때만) */
export const BURIED_AGO = 14;

/** 기본 기간표·소분 기간표가 아직 임시값인지. 화면에 "임시" 표시를 할 때 쓴다. */
export const SHELF_TABLE_IS_PROVISIONAL = true;

/** 상태별 화면 이름·아이콘. 배지·필터칩·헤드라인 모두 여기 이름을 쓴다. */
export const STATE_META: Record<ItemState, { label: string; icon: string }> = {
  soon: { label: '오늘 내일 해요', icon: '😭' },
  buried: { label: '잊혀지는 중', icon: '🥹' },
  ok: { label: '싱싱해요', icon: '🌱' },
};

/** 급함 점수(플랜 정렬용): 곧 상할 = SOON_URGENCY_BASE − 남은일수, 묻힘 = BURIED_URGENCY, 정상 = 0 */
export const SOON_URGENCY_BASE = 10;
export const BURIED_URGENCY = 5;

export const LOCATIONS: readonly Location[] = ['냉장', '냉동', '실온'];
export const REMAINING_LEVELS: readonly Remaining[] = ['넉넉해요', '반쯤', '조금'];
export const CORES: readonly Core[] = ['닭고기', '소고기', '돼지고기', ''];

/** 영상 확인에서 제외하는 기본 양념 */
export const BASIC_SEASONINGS: readonly string[] = ['소금', '후추', '식용유', '설탕', '간장', '참기름', '깨', '물'];

/** 이모지: 재료 사전에 없으면 핵심재료별 대체, 그것도 없으면 기본값 */
export const CORE_EMOJI: Partial<Record<Core, string>> = {
  닭고기: '🍗',
  소고기: '🥩',
  돼지고기: '🥩',
};
export const DEFAULT_EMOJI = '🍽️';

/**
 * 소분(냉동) 기간표 — 임시, 검증 전.
 * 여기 없는 품목군을 소분하면 품목의 기본 기간을 그대로 쓴다.
 */
export const PORTION_SHELF_DAYS: Partial<Record<FoodGroup, number>> = {
  meat: 90,
  seafood: 60,
  frozenFood: 60,
  veg: 30,
};

/**
 * "잊혀지는 중"에서 빼는 품목군 (상비 재료): 양념·소스, 면·곡물.
 * 원래 오래 두고 쓰는 재료라 14일이 지나도 잊힌 게 아니다. 기한이 가까워지면 "오늘 내일 해요"로는 올라온다.
 */
export const BURIED_EXCLUDE_GROUPS: readonly FoodGroup[] = ['sauce', 'grain'];

/** 소분 품목의 기본 보관 위치를 냉동으로 두는 품목군 (임시 가정). 나머지는 품목 기본 위치. */
export const PORTION_FREEZE_GROUPS: readonly FoodGroup[] = ['meat', 'seafood', 'frozenFood'];

/** 글 입력 읽기: 한글 수사 → 숫자 */
export const KOREAN_NUMBERS: Record<string, number> = {
  한: 1, 하나: 1,
  두: 2, 둘: 2,
  세: 3, 셋: 3, 석: 3,
  네: 4, 넷: 4, 넉: 4,
  다섯: 5,
  여섯: 6,
  일곱: 7,
  여덟: 8,
  아홉: 9,
  열: 10,
};

/** 글 입력 읽기: 단위 표기 → 저장할 단위 이름 */
export const UNIT_ALIASES: Record<string, string> = {
  봉지: '봉',
  봉: '봉',
  덩어리: '덩이',
  덩이: '덩이',
  개: '개',
  팩: '팩',
  통: '통',
  구: '구',
  단: '단',
  모: '모',
};

/** 개수 범위 (글 입력 읽기, 확인 화면·재료 시트의 ± 버튼) */
export const COUNT_MIN = 1;
export const COUNT_MAX = 30;

/** 글 입력 읽기: 항목을 나누는 말 */
export const ITEM_SEPARATORS: readonly string[] = ['\n', ',', '그리고'];

/** 글 입력 읽기: 소분 표시 말 */
export const PORTION_WORD = '소분';
