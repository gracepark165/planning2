// 홈의 오늘의 한 끼 (B-2): 이번 주 플랜의 오늘 끼니를 그대로 보여준다.
// 버튼은 이번 주 화면과 같은 동작이다 (이걸로 할게요 = 확정, 다른 메뉴 = 바꾸기, 되돌리기 = 확정 취소).

import { reasonOf, type TodayMeal } from '../rules/plan';
import type { DateKey, Item, Recipe } from '../rules/types';
import { UseTag } from './parts';

interface Props {
  meal: TodayMeal;
  items: Item[];
  today: DateKey;
  onConfirm: (recipe: Recipe) => void;
  onSwap: (slotIndex: number) => void;
  onUndo: (at: string) => void;
  onPlan: () => void;
}

export function TodayCard({ meal, items, today, onConfirm, onSwap, onUndo, onPlan }: Props) {
  // 급한 재료가 없으면 한 줄만 (버튼 없음)
  if (meal.kind === 'calm') return <p className="today-calm">오늘은 급한 재료가 없어요. 천천히 골라도 돼요.</p>;

  const planLink = (
    <button className="today-link" onClick={onPlan}>
      전체 플랜 보기 ›
    </button>
  );

  if (meal.kind === 'done') {
    return (
      <div className="card today done">
        <div className="today-done">
          <b>오늘 한 끼 완료 · {meal.meal.recipe}</b>
          <button className="small-btn alt" onClick={() => onUndo(meal.meal.at)}>
            되돌리기
          </button>
        </div>
        {planLink}
      </div>
    );
  }

  if (meal.kind === 'none') {
    // 냉장고가 비어 있으면 아래 "냉장고가 비어 있어요" 카드가 안내하므로 숨긴다
    if (!items.length) return null;
    return (
      <div className="card today">
        <p>오늘 추천할 메뉴가 없어요.</p>
        {planLink}
      </div>
    );
  }

  const { slot } = meal;
  return (
    <div className="card today">
      <div className="eyebrow" style={{ marginTop: 0 }}>
        오늘 저녁은 이거 어때요?
      </div>
      <h3>
        {slot.recipe.name}
        {slot.pinned && <span className="tag video">영상</span>}
        {slot.ai && <span className="tag ai">AI 제안</span>}
      </h3>
      {slot.ai?.howto && <div className="ai-howto">{slot.ai.howto}</div>}
      <p>{reasonOf(slot.recipe, items, today)}</p>
      {slot.recipe.uses.length > 0 && (
        <div className="tags">
          {slot.recipe.uses.map((n) => (
            <UseTag key={n} name={n} items={items} today={today} />
          ))}
        </div>
      )}
      <div className="meal-acts">
        <button className="small-btn main" onClick={() => onConfirm(slot.recipe)}>
          이걸로 할게요
        </button>
        {slot.candidateCount > 1 && (
          <button className="small-btn alt" onClick={() => onSwap(slot.index)}>
            다른 메뉴
          </button>
        )}
      </div>
      {planLink}
    </div>
  );
}
