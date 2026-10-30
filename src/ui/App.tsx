import { type ReactNode, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { PLAN_RECIPES, findCatalog } from '../data';
import { todayKey } from '../rules/date';
import { makePlan, todayMeal } from '../rules/plan';
import { eul, eun, withJosa } from '../rules/josa';
import type { Recipe } from '../rules/types';
import { loadState, saveState } from '../state/persist';
import { withMyFoods } from '../state/myFoods';
import {
  initialState,
  newItemFromPick,
  reducer,
  showIntro,
  showOnboarding,
  showSamplePrompt,
  type AddPick,
} from '../state/store';
import { AddView } from './AddView';
import { HomeView } from './HomeView';
import { ItemSheet } from './ItemSheet';
import { OpeningView } from './OpeningView';
import { OrderView } from './OrderView';
import { PlanView } from './PlanView';
import { TodayCard } from './TodayCard';
import { VideoView } from './VideoView';
import { TabBar, type TabKey } from './TabBar';
import { newId } from './id';

type Screen = TabKey | 'add';

interface Toast {
  msg: string;
  action?: { label: string; run: () => void };
}


export function App() {
  const today = todayKey();
  const [state, dispatch] = useReducer(reducer, today, (t) => loadState() ?? initialState(t));
  const [screen, setScreen] = useState<Screen>('home');
  const [prevScreen, setPrevScreen] = useState<Screen>('home');
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [orderRound, setOrderRound] = useState(0);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => saveState(state), [state]);

  const showToast = useCallback((msg: string, action?: Toast['action']) => {
    setToast({ msg, action });
    window.clearTimeout(toastTimer.current);
    // 되돌리기 같은 버튼이 있으면 누를 시간을 더 준다
    toastTimer.current = window.setTimeout(() => setToast(null), action ? 5000 : 2200);
  }, []);

  const go = (s: Screen) => {
    if (s === 'add') setPrevScreen(screen);
    setScreen(s);
    setSheetId(null);
    window.scrollTo(0, 0);
  };

  const addFromPicks = (picks: AddPick[]) => {
    const lookup = withMyFoods(findCatalog, state.myFoods);
    const items = picks.map((p) => newItemFromPick(p, today, newId(), lookup)).filter((i) => i !== undefined);
    dispatch({ type: 'addItems', items });
    go('home');
    showToast(`${items.length}개를 냉장고에 넣었어요`);
  };

  const undoMeal = (recipeName: string, at: string) => {
    dispatch({ type: 'undoMeal', at });
    showToast(`${recipeName}에 쓴 재료를 냉장고로 되돌렸어요`);
  };

  // 이번 주 플랜은 여기서 한 번만 짠다. 홈의 오늘의 한 끼와 이번 주 화면이 같은 결과를 본다.
  const planResult = makePlan(state.items, PLAN_RECIPES, state.plan, today);

  /** "이걸로 할게요" (홈·이번 주 화면 공통): 쓴 재료를 빼고, 되돌리기를 보여준다 */
  const confirmMeal = (recipe: Recipe) => {
    const at = new Date().toISOString();
    dispatch({ type: 'confirmMeal', recipe, today, at });
    showToast(`${recipe.name}에 쓴 재료를 냉장고에서 뺐어요`, {
      label: '되돌리기',
      run: () => undoMeal(recipe.name, at),
    });
  };
  const undoAt = (at: string) => {
    const name = state.plan.doneMeals.find((d) => d.at === at)?.recipe;
    if (name) undoMeal(name, at);
  };
  const swap = (slotIndex: number) => dispatch({ type: 'swap', slotIndex });

  const sheetItem = state.items.find((i) => i.id === sheetId);
  const closeSheet = useCallback(() => setSheetId(null), []);

  // 처음 열었을 때 한 번만 오프닝 화면 (하단 탭 없이)
  if (showIntro(state)) return <OpeningView onStart={() => dispatch({ type: 'finishIntro' })} />;

  let view: ReactNode = null;
  if (screen === 'home') {
    view = (
      <HomeView
        items={state.items}
        logs={state.logs}
        today={today}
        onOpen={setSheetId}
        onAdd={() => go('add')}
        todayCard={
          <TodayCard
            meal={todayMeal(planResult, state.plan, state.items, today)}
            items={state.items}
            today={today}
            onConfirm={confirmMeal}
            onSwap={swap}
            onUndo={undoAt}
            onPlan={() => go('plan')}
          />
        }
        onReset={() => {
          if (!window.confirm('지금 냉장고를 지우고 예시 재료로 되돌릴까요?')) return;
          dispatch({ type: 'reset', today });
          showToast('예시 재료로 되돌렸어요');
        }}
        onClear={() => {
          const n = state.items.length;
          if (!window.confirm(`냉장고에 있는 재료 ${n}개를 모두 지울까요?\n이번 주 기록도 같이 지워져요. 지난번에 정한 값은 남아요.`)) return;
          dispatch({ type: 'clearAll' });
          showToast('냉장고를 비웠어요. 내 재료로 채워 주세요');
        }}
        onOrder={() => go('order')}
        onboarding={showOnboarding(state)}
        onOnboard={(mode) => {
          dispatch({ type: 'onboard', mode });
          if (mode === 'mine') {
            go('order');
            showToast('예시 재료를 비웠어요. 장 본 재료를 올려 주세요');
          }
        }}
        samplePrompt={showSamplePrompt(state)}
        onSamplePrompt={(remove) => {
          dispatch({ type: 'answerSamplePrompt', remove });
          if (remove) showToast('예시 재료를 지웠어요');
        }}
      />
    );
  } else if (screen === 'plan') {
    view = (
      <PlanView
        items={state.items}
        plan={state.plan}
        result={planResult}
        today={today}
        onMeals={(mealsPerWeek) => dispatch({ type: 'setMeals', mealsPerWeek })}
        onSwap={swap}
        onSkip={(recipe) => {
          dispatch({ type: 'skip', recipe: recipe.name });
          showToast(`${withJosa(recipe.name, eun)} 건너뛰었어요`);
        }}
        onClearRejected={() => dispatch({ type: 'clearRejected' })}
        onConfirm={confirmMeal}
        onUndo={undoAt}
      />
    );
  } else if (screen === 'add') {
    view = <AddView items={state.items} onBack={() => go(prevScreen)} onAdd={addFromPicks} />;
  }

  return (
    <>
      <div id="app">
        {view}
        {/* 영상 확인·장보기 올리기는 진행 중인 단계를 기억하도록 다른 탭에 가도 화면을 숨기기만 한다 */}
        <div hidden={screen !== 'video'}>
          <VideoView items={state.items} today={today} />
        </div>
        <div hidden={screen !== 'order'}>
          <OrderView
            key={orderRound}
            today={today}
            myFoods={state.myFoods}
            onPickCatalog={() => go('add')}
            onAdd={(items) => {
              dispatch({ type: 'addItems', items });
              setOrderRound((n) => n + 1); // 넣고 나면 다음에는 처음 화면부터
              go('plan');
              showToast('냉장고에 넣었어요. 이번 주 먹을 순서예요');
            }}
          />
        </div>
      </div>
      <TabBar active={screen === 'add' ? 'home' : screen} onChange={go} />
      {sheetItem && (
        <ItemSheet
          item={sheetItem}
          today={today}
          onClose={closeSheet}
          onShift={(delta) => dispatch({ type: 'shiftExpiry', id: sheetItem.id, delta })}
          onRemaining={(remaining) => dispatch({ type: 'setRemaining', id: sheetItem.id, remaining })}
          onFinish={(action) => {
            dispatch({ type: 'finishItem', id: sheetItem.id, action, today, at: new Date().toISOString() });
            setSheetId(null);
            const what = withJosa(sheetItem.name, eul);
            showToast(action === 'eat' ? `${what} 다 먹은 걸로 기록했어요` : `${what} 버린 걸로 기록했어요`);
          }}
          onLocation={(location) => dispatch({ type: 'setLocation', id: sheetItem.id, location })}
          onCount={(delta) => dispatch({ type: 'shiftCount', id: sheetItem.id, delta })}
          onRemove={() => {
            const removed = sheetItem;
            dispatch({ type: 'removeItem', id: removed.id });
            setSheetId(null);
            showToast(`${withJosa(removed.name, eul)} 지웠어요`, {
              label: '되돌리기',
              run: () => dispatch({ type: 'addItems', items: [removed] }),
            });
          }}
        />
      )}
      {toast && (
        <div className={`toast ${toast.action ? 'with-action' : ''}`} role="status">
          <span>{toast.msg}</span>
          {toast.action && (
            <button
              onClick={() => {
                const run = toast.action!.run;
                setToast(null);
                run();
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </>
  );
}
