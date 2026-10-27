// 이번 주(FR-20~28): 집밥 횟수 → 끼니 카드 → 이걸로 할게요 / 바꾸기 / 건너뛰기

import { PLAN_RECIPES } from '../data';
import { STATE_META } from '../rules/constants';
import { findItem, makePlan, reasonOf, summarizePlan, type PlanSlot } from '../rules/plan';
import { dDayLabel, daysLeft, stateOf } from '../rules/status';
import type { DateKey, Item, Plan, Recipe } from '../rules/types';

const MEAL_CHOICES = [2, 3, 4, 5, 6, 7];
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

interface Props {
  items: Item[];
  plan: Plan;
  today: DateKey;
  onMeals: (n: number) => void;
  onConfirm: (recipe: Recipe) => void;
  onSwap: (slotIndex: number) => void;
  onSkip: (recipe: Recipe) => void;
  onUndo: (at: string) => void;
  onClearRejected: () => void;
}

export function PlanView({ items, plan, today, onMeals, onConfirm, onSwap, onSkip, onUndo, onClearRejected }: Props) {
  const result = makePlan(items, PLAN_RECIPES, plan, today);
  const { soonTotal, soonSaved, buyAll, lost } = summarizePlan(result, items, plan, today);
  const owned = new Set(items.map((i) => i.name));

  const tagFor = (name: string) => {
    const it = findItem(items, name, today);
    const st = it ? stateOf(it, today) : 'ok';
    const cls = st === 'soon' ? 'hot' : st === 'buried' ? 'bur' : '';
    const extra = st === 'soon' && it ? ` · ${dDayLabel(daysLeft(it, today))}` : st === 'buried' ? ` · ${STATE_META.buried.label}` : '';
    return (
      <span key={name} className={`tag ${cls}`}>
        {name + extra}
      </span>
    );
  };

  const dayHead = (slot: PlanSlot) => {
    const [y, m, d] = slot.date.split('-').map(Number);
    const dow = DOW[new Date(y, m - 1, d).getDay()];
    return (
      <div className="d">
        <b>{d}</b>
        <span>
          {dow}
          {slot.dayOffset === 0 && ' · 오늘'}
        </span>
      </div>
    );
  };

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

      <div style={{ marginTop: 8 }}>
        {plan.doneMeals.map((d) => (
          <div key={`${d.recipe}-${d.at}`} className="day done">
            <div className="d">
              <b>✓</b>
              <span>먹었어요</span>
            </div>
            <div className="body">
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
              {dayHead(slot)}
              <div className="body">
                <div className="nm" style={{ fontWeight: 700, fontSize: 16 }}>
                  {slot.recipe.name}
                </div>
                <div style={{ color: 'var(--sub)', fontSize: 13, marginTop: 2 }}>
                  {reasonOf(slot.recipe, items, today)}
                </div>
                <div className="tags">
                  {slot.recipe.uses.map(tagFor)}
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
                <div className="acts">
                  <button className="small-btn" onClick={() => onConfirm(slot.recipe!)}>
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
              {dayHead(slot)}
              <div className="body">
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
