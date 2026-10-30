// 이번 주(FR-20~28): 집밥 횟수 → 끼니 카드 → 이걸로 할게요 / 바꾸기 / 건너뛰기

import { PLAN_RECIPES } from '../data';
import { MAX_MEALS_PER_WEEK, MIN_MEALS_PER_WEEK, STATE_META } from '../rules/constants';
import {
  coverageText,
  minMealsToCover,
  reasonOf,
  summarizePlan,
  uncoveredSoon,
  type PlanResult,
  type PlanSlot,
} from '../rules/plan';
import { formatDayLabel } from '../rules/date';
import { dDayLabel, daysLeft } from '../rules/status';
import type { DateKey, Item, Plan, Recipe } from '../rules/types';
import { UseTag } from './parts';

const MEAL_CHOICES = Array.from({ length: MAX_MEALS_PER_WEEK - MIN_MEALS_PER_WEEK + 1 }, (_, i) => MIN_MEALS_PER_WEEK + i);

interface Props {
  items: Item[];
  plan: Plan;
  /** 이번 주 플랜 (App에서 한 번만 짜서 홈의 오늘의 한 끼와 같이 쓴다) */
  result: PlanResult;
  today: DateKey;
  onMeals: (n: number) => void;
  onConfirm: (recipe: Recipe) => void;
  onSwap: (slotIndex: number) => void;
  onSkip: (recipe: Recipe) => void;
  onUndo: (at: string) => void;
  onClearRejected: () => void;
}

export function PlanView({ items, plan, result, today, onMeals, onConfirm, onSwap, onSkip, onUndo, onClearRejected }: Props) {
  const { soonTotal, soonSaved, buyAll, lost } = summarizePlan(result, items, plan, today);
  const owned = new Set(items.map((i) => i.name));
  // 고른 집밥 횟수로 얼른 먹어야 할 재료를 다 못 쓰면 안내 (A-4)
  const uncovered = uncoveredSoon(result, items, today);
  const coverMeals = uncovered.length ? minMealsToCover(items, PLAN_RECIPES, plan, today) : null;

  const dayHead = (slot: PlanSlot) => (
    <div className={`when ${slot.dayOffset === 0 ? 'today' : ''}`}>{formatDayLabel(slot.date, today)}</div>
  );

  return (
    <>
      <h1>이번 주 먹을 순서예요</h1>
      <p className="lead">
        {soonTotal
          ? `얼른 먹어야 할 재료 ${soonTotal}개 중 ${soonSaved}개를 이번 주 저녁에 먼저 써요.`
          : '급하게 써야 할 재료는 없어요.'}
      </p>

      <div className="eyebrow" style={{ marginTop: 0 }}>
        이번 주 집밥은 몇 번 하세요?
      </div>
      <div className="seg">
        {MEAL_CHOICES.map((n) => (
          <button key={n} className={plan.mealsPerWeek === n ? 'on' : ''} onClick={() => onMeals(n)}>
            {n}번
          </button>
        ))}
      </div>

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
        {plan.doneMeals.map((d) => (
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
                </div>
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
                <div className="meal-acts">
                  <button className="small-btn main" onClick={() => onConfirm(slot.recipe!)}>
                    이걸로 할게요
                  </button>
                  {slot.candidateCount > 1 && (
                    <button className="small-btn alt" onClick={() => onSwap(slot.index)}>
                      바꾸기
                    </button>
                  )}
                  <button className="small-btn alt" onClick={() => onSkip(slot.recipe!)}>
                    건너뛰기
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

      {buyAll.length > 0 && (
        <div className="card blue">
          <h3>이번 주 사야 할 재료</h3>
          <p>{buyAll.join(', ')} · 냉장고에 없는 재료라 따로 모았어요.</p>
        </div>
      )}
      {lost.length > 0 && (
        <div className="card">
          <h3>이번 주에 못 쓰는 재료</h3>
          <p>
            {lost
              .map((i) => {
                const l = daysLeft(i, today);
                return `${i.name}(${l <= 7 ? dDayLabel(l) : STATE_META.buried.label})`;
              })
              .join(', ')}{' '}
            · 집밥 횟수를 늘리거나 따로 챙겨 드세요.
          </p>
        </div>
      )}

      <p className="note">
        ‘이걸로 할게요’를 누르면 쓴 재료가 냉장고에서 빠지고, 되돌리기로 다시 살릴 수 있어요. 재료는 통째로 쓴 걸로
        계산해요(소분한 재료는 한 끼에 1개씩). 메뉴와 배치 이유는 정해진 규칙으로 만든 예시예요.
      </p>
    </>
  );
}
