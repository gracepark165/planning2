import { type ReactNode, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { findCatalog } from '../data';
import { todayKey } from '../rules/date';
import { eul, eun, withJosa } from '../rules/josa';
import { loadState, saveState } from '../state/persist';
import { initialState, newItemFromCatalog, reducer } from '../state/store';
import { AddView } from './AddView';
import { HomeView } from './HomeView';
import { ItemSheet } from './ItemSheet';
import { OrderView } from './OrderView';
import { PlanView } from './PlanView';
import { TabBar, type TabKey } from './TabBar';
import { newId } from './id';

type Screen = TabKey | 'add';

interface Toast {
  msg: string;
  action?: { label: string; run: () => void };
}

/** 아직 만들지 않은 탭 (6단계에서 채운다) */
const COMING: Record<Exclude<TabKey, 'home' | 'plan' | 'order'>, { title: string; step: number; emoji: string }> = {
  video: { title: '영상 확인', step: 6, emoji: '🎬' },
};

export function App() {
  const today = todayKey();
  const [state, dispatch] = useReducer(reducer, today, (t) => loadState() ?? initialState(t));
  const [screen, setScreen] = useState<Screen>('home');
  const [prevScreen, setPrevScreen] = useState<Screen>('home');
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
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

  const addFromCatalog = (names: string[]) => {
    const owned = new Set(state.items.map((i) => i.name));
    const items = names
      .filter((n) => !owned.has(n))
      .map((n) => findCatalog(n))
      .filter((c) => c !== undefined)
      .map((c) => newItemFromCatalog(c, today, newId()));
    dispatch({ type: 'addItems', items });
    go('plan');
    showToast(`${items.length}개를 담았어요. 이번 주 먹을 순서예요`);
  };

  const undoMeal = (recipeName: string, at: string) => {
    dispatch({ type: 'undoMeal', at });
    showToast(`${recipeName}에 쓴 재료를 냉장고로 되돌렸어요`);
  };

  const sheetItem = state.items.find((i) => i.id === sheetId);
  const closeSheet = useCallback(() => setSheetId(null), []);

  let view: ReactNode;
  if (screen === 'home') {
    view = (
      <HomeView
        items={state.items}
        logs={state.logs}
        today={today}
        onOpen={setSheetId}
        onAdd={() => go('add')}
        onPlan={() => go('plan')}
        onReset={() => {
          dispatch({ type: 'reset', today });
          showToast('처음 상태로 되돌렸어요');
        }}
      />
    );
  } else if (screen === 'plan') {
    view = (
      <PlanView
        items={state.items}
        plan={state.plan}
        today={today}
        onMeals={(mealsPerWeek) => dispatch({ type: 'setMeals', mealsPerWeek })}
        onSwap={(slotIndex) => dispatch({ type: 'swap', slotIndex })}
        onSkip={(recipe) => {
          dispatch({ type: 'skip', recipe: recipe.name });
          showToast(`${withJosa(recipe.name, eun)} 건너뛰었어요`);
        }}
        onClearRejected={() => dispatch({ type: 'clearRejected' })}
        onConfirm={(recipe) => {
          const at = new Date().toISOString();
          dispatch({ type: 'confirmMeal', recipe, today, at });
          showToast(`${recipe.name}에 쓴 재료를 냉장고에서 뺐어요`, {
            label: '되돌리기',
            run: () => undoMeal(recipe.name, at),
          });
        }}
        onUndo={(at) => {
          const name = state.plan.doneMeals.find((d) => d.at === at)?.recipe;
          if (name) undoMeal(name, at);
        }}
      />
    );
  } else if (screen === 'order') {
    view = (
      <OrderView
        today={today}
        onPickCatalog={() => go('add')}
        onAdd={(items) => {
          dispatch({ type: 'addItems', items });
          go('plan');
          showToast('냉장고에 넣었어요. 이번 주 먹을 순서예요');
        }}
      />
    );
  } else if (screen === 'add') {
    view = <AddView items={state.items} onBack={() => go(prevScreen)} onAdd={addFromCatalog} />;
  } else {
    const c = COMING[screen];
    view = (
      <div className="soon-box">
        <div className="e">{c.emoji}</div>
        <h1>{c.title}</h1>
        <p className="lead">{c.step}단계에서 만들어요.</p>
      </div>
    );
  }

  return (
    <>
      <div id="app">{view}</div>
      <TabBar active={screen === 'add' ? 'home' : screen} onChange={go} />
      {sheetItem && (
        <ItemSheet
          item={sheetItem}
          today={today}
          onClose={closeSheet}
          onShift={(delta) => dispatch({ type: 'shiftExpiry', id: sheetItem.id, delta })}
          onRemaining={(remaining) => dispatch({ type: 'setRemaining', id: sheetItem.id, remaining })}
          onFinish={(action) => {
            dispatch({ type: 'finishItem', id: sheetItem.id, action, at: new Date().toISOString() });
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
