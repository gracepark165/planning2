// 이번 주(FR-20~28): 집밥 횟수 → 끼니 카드 → 이걸로 할게요 / 바꾸기 / 건너뛰기

import { useState } from 'react';
import { PLAN_RECIPES, findCatalog } from '../data';
import { MAX_MEALS_PER_WEEK, MIN_MEALS_PER_WEEK, STATE_META } from '../rules/constants';
import {
  coverageText,
  mealRecipe,
  lostMealsText,
  minMealsToUseLost,
  noMenuFor,
  doneToday,
  minMealsToCover,
  reasonOf,
  summarizePlan,
  uncoveredSoon,
  type PlanResult,
  type PlanSlot,
} from '../rules/plan';
import { formatDate, formatDayLabel } from '../rules/date';
import { frozenExpiry } from '../rules/expiry';
import { eul, eun, withJosa } from '../rules/josa';
import { recentSummary } from '../rules/recentSummary';
import { shoppingView } from '../rules/shopping';
import { dDayLabel, daysLeft } from '../rules/status';
import type { DateKey, Item, Location, MealLog, Plan, Recipe, ShoppingItem } from '../rules/types';
import type { AiSlot } from '../rules/menuCheck';
import { AI_DAILY_LIMIT, type AiSlotState } from '../state/aiMenu';
import { RecipeSource, SideDishes, Tile, UseTag } from './parts';
import { ProfileCommunityCards } from './CommunityView';

const MEAL_CHOICES = Array.from({ length: MAX_MEALS_PER_WEEK - MIN_MEALS_PER_WEEK + 1 }, (_, i) => MIN_MEALS_PER_WEEK + i);

interface Props {
  items: Item[];
  /** 다 먹었어요·버렸어요 기록 (최근 7일 요약) */
  logs: MealLog[];
  plan: Plan;
  /** 이번 주 플랜 (App에서 한 번만 짜서 홈의 오늘의 한 끼와 같이 쓴다). AI가 채운 칸 포함 */
  result: PlanResult & { slots: AiSlot[] };
  /** AI에게 맡겼는데 아직 메뉴가 없는 칸의 상태 (불러오는 중·폴백) */
  aiStates: Map<number, AiSlotState>;
  /** AI 칸을 바꾸는 중이면 그 칸 번호 (실제 AI는 10초쯤 걸림) */
  aiSwapping: number | null;
  /** AI 한도에 걸렸으면 화면 위에 알림 (limit = 기기 하루 한도, busy = 서버의 짧은 시간 한도) */
  aiNotice: 'limit' | 'busy' | null;
  /** 폴백 칸에 보여줄 먼저 쓸 재료 */
  mustUseFirst: string[];
  /** 폴백: 영상 확인 탭으로 */
  onFindByVideo: () => void;
  today: DateKey;
  onMeals: (n: number) => void;
  onConfirm: (recipe: Recipe) => void;
  onSwap: (slotIndex: number) => void;
  onSkip: (recipe: Recipe) => void;
  onUndo: (at: string) => void;
  onClearRejected: () => void;
  /** 영상에서 넣은 고정 끼니의 건너뛰기 = 지우기 */
  onRemovePinned: (id: string) => void;
  /** 장보기 목록 (저장된 줄) */
  shoppingList: ShoppingItem[];
  onToggleShop: (name: string) => void;
  onRemoveShop: (name: string) => void;
  /** "샀어요 → 냉장고에 넣기": 체크한 재료 이름 */
  onBought: (names: string[]) => void;
  /** 이번에 못 쓰는 재료의 '냉동실로 옮기기'와 되돌리기 */
  onRelocate: (id: string, location: Location) => void;
  /** 맨 위 내 프로필 칸·커뮤니티 칸 (2026-11-09: 예전 "최근 7일 요약" 자리) */
  onProfile: () => void;
  onCommunity: () => void;
  /** 냉장고가 비었을 때: 장보기 올리기·재료 추가로 */
  onOrder: () => void;
  onAdd: () => void;
}

export function PlanView({
  items,
  logs,
  plan,
  result,
  aiStates,
  aiSwapping,
  aiNotice,
  mustUseFirst,
  onFindByVideo,
  today,
  onMeals,
  onConfirm,
  onSwap,
  onSkip,
  onUndo,
  onClearRejected,
  onRemovePinned,
  shoppingList,
  onToggleShop,
  onRemoveShop,
  onBought,
  onRelocate,
  onProfile,
  onCommunity,
  onOrder,
  onAdd,
}: Props) {
  const { soonTotal, soonSaved, buyAll, lost } = summarizePlan(result, items, plan, today);
  const owned = new Set(items.map((i) => i.name));
  // 사야 할 재료 = 플랜의 사야 할 재료 + 영상에서 담은 재료 (B-1)
  const shopping = shoppingView(buyAll, shoppingList, [...owned]);
  const bought = shopping.filter((s) => s.checked).map((s) => s.name);
  // 고른 집밥 횟수로 얼른 먹어야 할 재료를 다 못 쓰면 안내 (A-4)
  const uncovered = uncoveredSoon(result, items, today);
  const coverMeals = uncovered.length ? minMealsToCover(items, PLAN_RECIPES, plan, today) : null;
  // 이번에 못 쓰는 재료: 집밥을 늘리면 먹을 수 있는지, 냉동하면 얼마나 늘어나는지 (2026-11-09)
  const lostMeals = lost.length ? minMealsToUseLost(items, PLAN_RECIPES, plan, today) : null;
  // 집밥을 늘려도 못 먹을 때: 쓰는 메뉴가 아예 없는 재료면 그렇게 알려준다
  const lostTip = (names: string[]) => {
    const none = noMenuFor([...new Set(names)], items, PLAN_RECIPES, today);
    if (!none.length) return plan.mealsPerWeek >= 7 ? '집밥 7번이 다 찼어요. 따로 챙겨 드세요.' : '앞으로 7일 메뉴로는 쓰기 어려워요. 따로 챙겨 드세요.';
    return `${withJosa(none.join(', '), eun)} 아직 쓰는 메뉴가 없어요. 따로 챙겨 드세요.`;
  };
  const [frozen, setFrozen] = useState<{ id: string; name: string; from: Location; until: DateKey } | null>(null);

  const dayHead = (slot: PlanSlot) => (
    <div className={`when ${slot.dayOffset === 0 ? 'today' : ''}`}>{formatDayLabel(slot.date, today)}</div>
  );

  const week = recentSummary(logs, items, today);

  return (
    <>
      {/* 내 프로필 + 커뮤니티 (2026-11-09, 사용자 요청). 최근 7일 먹은·버린 재료 수는 프로필 칸에 남긴다 */}
      <ProfileCommunityCards
        eaten={week.kind === 'summary' ? week.eaten : 0}
        discarded={week.kind === 'summary' ? week.discarded : 0}
        onProfile={onProfile}
        onCommunity={onCommunity}
      />

      {/* 냉장고가 비었으면 빈 끼니 칸을 늘어놓지 않고 재료부터 넣게 한다 (2026-11-09: 빈 냉장고로 시작) */}
      {items.length === 0 && plan.pinned.length === 0 ? (
        <>
          <h1>앞으로 7일 먹을 순서예요</h1>
          <div className="card" style={{ textAlign: 'center', padding: '28px 16px' }}>
            <h3>냉장고가 비어 있어요</h3>
            <p>재료를 넣으면 얼른 먹어야 할 재료부터 앞으로 7일 저녁 메뉴를 짜 드려요.</p>
            <div className="ctas">
              <button className="cta ghost" onClick={onAdd}>
                재료 추가
              </button>
              <button className="cta" onClick={onOrder}>
                장보기 올리기
              </button>
            </div>
          </div>
        </>
      ) : (
      <>
      <h1>앞으로 7일 먹을 순서예요</h1>
      <p className="lead">
        {soonTotal
          ? `얼른 먹어야 할 재료 ${soonTotal}개 중 ${soonSaved}개를 앞으로 7일 저녁에 먼저 써요.`
          : '급하게 써야 할 재료는 없어요.'}
      </p>

      <div className="eyebrow" style={{ marginTop: 0 }}>
        앞으로 7일 동안 집밥은 몇 번 하세요?
      </div>
      <div className="seg">
        {MEAL_CHOICES.map((n) => (
          <button key={n} className={plan.mealsPerWeek === n ? 'on' : ''} onClick={() => onMeals(n)}>
            {n}번
          </button>
        ))}
      </div>

      {shopping.length > 0 && (
        <div className="card blue">
          <h3>이번 주 추천 장보기</h3>
          <ul className="shop">
            {shopping.map((it) => (
              <li key={it.name}>
                <label>
                  <input type="checkbox" checked={it.checked} onChange={() => onToggleShop(it.name)} />
                  <span className={it.checked ? 'done' : ''}>{it.name}</span>
                  {it.from === 'video' && <span className="tag video">영상</span>}
                </label>
                <button className="shop-x" aria-label={`${it.name} 지우기`} onClick={() => onRemoveShop(it.name)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
          {bought.length > 0 && (
            <button className="small-btn" onClick={() => onBought(bought)}>
              샀어요 → 냉장고에 넣기
            </button>
          )}
        </div>
      )}
      {aiNotice && (
        <div className="card ai-notice" role="status">
          <b>{aiNotice === 'limit' ? `오늘 AI 메뉴 제안을 다 썼어요 (하루 ${AI_DAILY_LIMIT}번)` : 'AI 요청이 잠깐 몰렸어요'}</b>
          <p>
            {aiNotice === 'limit'
              ? '내일 다시 골라 드릴게요. 빈 칸은 아래 재료로 직접 골라 주세요.'
              : '몇 분 뒤 이 화면을 다시 열면 메뉴를 다시 골라요. 그동안 빈 칸은 아래 재료로 직접 골라 주세요.'}
          </p>
        </div>
      )}

      {uncovered.length > 0 && (
        <div className="card warn">
          <p>{coverageText(uncovered, coverMeals)}</p>
          {coverMeals !== null && (
            <button className="small-btn" onClick={() => onMeals(coverMeals)}>
              {coverMeals}번으로 바꾸기
            </button>
          )}
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        {doneToday(plan, today).map((d) => (
          <div key={`${d.recipe}-${d.at}`} className="day done">
            <div className="body">
              <div className="when">✓ 먹었어요</div>
              <div className="nm" style={{ fontWeight: 700, fontSize: 16 }}>
                {d.recipe}
              </div>
              <div className="acts" style={{ marginTop: 8 }}>
                <button className="small-btn" onClick={() => onUndo(d.at)}>
                  되돌리기
                </button>
              </div>
            </div>
          </div>
        ))}

        {result.slots.map((slot) =>
          slot.recipe ? (
            <div key={slot.index} className="day">
              <div className="body">
                {dayHead(slot)}
                <div className="nm" style={{ fontWeight: 700, fontSize: 16 }}>
                  {slot.recipe.name}
                  {slot.pinned && <span className="tag video">영상</span>}
                  {slot.ai && <span className="tag ai">AI 제안</span>}
                </div>
                {slot.ai?.howto && <div className="ai-howto">{slot.ai.howto}</div>}
                <RecipeSource recipe={slot.recipe} />
                {/* 배치 이유는 AI가 아니라 실제 재고로 규칙이 만든다 */}
                <div style={{ color: 'var(--sub)', fontSize: 13, marginTop: 2 }}>
                  {reasonOf(slot.recipe, items, today)}
                </div>
                <div className="tags">
                  {slot.recipe.uses.map((n) => (
                    <UseTag key={n} name={n} items={items} today={today} />
                  ))}
                  {slot.recipe.keeps.map((n) => (
                    <span key={n} className="tag">
                      {n}
                    </span>
                  ))}
                  {slot.recipe.buy
                    .filter((n) => !owned.has(n))
                    .map((n) => (
                      <span key={n} className="tag buy">
                        사야 해요 · {n}
                      </span>
                    ))}
                </div>
                <SideDishes sides={slot.sides} items={items} today={today} />
                {aiSwapping === slot.index ? (
                  <div className="ai-skeleton">
                    다른 메뉴를 찾고 있어요
                    <span className="ai-wait">보통 10~20초 걸려요</span>
                  </div>
                ) : (
                <div className="meal-acts">
                  <button className="small-btn main" onClick={() => onConfirm(mealRecipe(slot)!)}>
                    이걸로 할게요
                  </button>
                  {slot.candidateCount > 1 && (
                    <button className="small-btn alt" onClick={() => onSwap(slot.index)}>
                      바꾸기
                    </button>
                  )}
                  <button
                    className="small-btn alt"
                    // AI 칸의 건너뛰기는 그 칸만 다른 메뉴로 다시 요청 (바꾸기와 같음)
                    onClick={() =>
                      slot.pinned ? onRemovePinned(slot.pinned.id) : slot.ai ? onSwap(slot.index) : onSkip(slot.recipe!)
                    }
                  >
                    건너뛰기
                  </button>
                </div>
                )}
              </div>
            </div>
          ) : aiStates.get(slot.index) === 'loading' ? (
            <div key={slot.index} className="day" aria-busy="true">
              <div className="body">
                {dayHead(slot)}
                <div className="ai-skeleton">
                  메뉴를 고르고 있어요
                  <span className="ai-wait">보통 10~20초 걸려요</span>
                </div>
              </div>
            </div>
          ) : aiStates.has(slot.index) ? (
            <div key={slot.index} className="day">
              <div className="body">
                {dayHead(slot)}
                {aiStates.get(slot.index) === 'limit' && <div className="note" style={{ margin: 0 }}>오늘은 AI 제안을 다 썼어요</div>}
                <div className="nm" style={{ fontWeight: 700 }}>
                  이 재료로 직접 골라 볼까요?
                </div>
                {mustUseFirst.length > 0 && (
                  <div className="tags">
                    {mustUseFirst.map((n) => (
                      <UseTag key={n} name={n} items={items} today={today} />
                    ))}
                  </div>
                )}
                <div className="meal-acts">
                  <button className="small-btn" onClick={onFindByVideo}>
                    영상으로 메뉴 찾기
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div key={slot.index} className="day">
              <div className="body">
                {dayHead(slot)}
                <div className="nm" style={{ fontWeight: 700, color: 'var(--sub)' }}>
                  제안할 메뉴가 없어요
                </div>
                <div style={{ color: 'var(--sub)', fontSize: 13 }}>
                  재고로 만들 수 있는 메뉴가 없어요. 건너뛴 메뉴를 다시 보거나 장을 봐 주세요
                </div>
              </div>
            </div>
          ),
        )}
      </div>

      {plan.rejectedRecipes.length > 0 && (
        <button className="note" style={{ textDecoration: 'underline', display: 'block' }} onClick={onClearRejected}>
          건너뛴 메뉴 {plan.rejectedRecipes.length}개 다시 보기
        </button>
      )}

      {(lost.length > 0 || frozen) && (
        <div className="card lost">
          <h3>이번에 못 쓰는 재료</h3>
          {lost.length > 0 && (
            <>
              <p>
                {lost
                  .map((i) => {
                    const l = daysLeft(i, today);
                    return `${i.name}(${l <= 7 ? dDayLabel(l) : STATE_META.buried.label})`;
                  })
                  .join(', ')}
              </p>
              <p className="lost-tip">
                {lostMeals ? lostMealsText(lostMeals) : lostTip(lost.map((i) => i.name))}
              </p>
              {lostMeals && (
                <button className="small-btn main" onClick={() => onMeals(lostMeals.meals)}>
                  {lostMeals.meals}번으로 바꾸기
                </button>
              )}
              {lost.some((i) => frozenExpiry(i, findCatalog(i.name))) && (
                <>
                  <p className="lost-tip">이번에 못 먹을 것 같으면 냉동실에 넣어 두세요.</p>
                  <ul className="freeze-list">
                    {lost.map((i) => {
                      const until = frozenExpiry(i, findCatalog(i.name));
                      if (!until) return null;
                      return (
                        <li key={i.id}>
                          <Tile name={i.name} core={i.core} />
                          <div className="freeze-txt">
                            <b>{i.name}</b>
                            <span>냉동 {formatDate(until)}까지</span>
                          </div>
                          <button
                            className="small-btn"
                            onClick={() => {
                              onRelocate(i.id, '냉동');
                              setFrozen({ id: i.id, name: i.name, from: i.location, until });
                            }}
                          >
                            냉동실로 옮기기
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </>
          )}
          {frozen && (
            <div className="freeze-done" role="status">
              <span>
                {withJosa(frozen.name, eul)} 냉동실로 옮겼어요 · {formatDate(frozen.until)}까지
              </span>
              <button
                className="small-btn alt"
                onClick={() => {
                  onRelocate(frozen.id, frozen.from);
                  setFrozen(null);
                }}
              >
                되돌리기
              </button>
            </div>
          )}
        </div>
      )}

      <p className="note">
        ‘이걸로 할게요’를 누르면 쓴 재료가 냉장고에서 빠지고, 되돌리기로 다시 살릴 수 있어요. 소분한 재료는 한 끼에 1개,
        여러 번 나눠 쓰는 재료는 한 끼에 한 단계씩 줄어요. 메뉴와 배치 이유는 정해진 규칙으로 만든 예시예요.
        {result.slots.some((s) => s.ai) && ' AI 제안 메뉴는 재고에 있는 재료만 쓰도록 확인했어요. 맛과 조리법은 직접 판단해 주세요.'}
      </p>
      </>
      )}
    </>
  );
}
