import { type ReactNode, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { findCatalog } from '../data';
import { todayKey } from '../rules/date';
import { eul, withJosa } from '../rules/josa';
import { loadState, saveState } from '../state/persist';
import { initialState, newItemFromCatalog, reducer } from '../state/store';
import { AddView } from './AddView';
import { HomeView } from './HomeView';
import { ItemSheet } from './ItemSheet';
import { TabBar, type TabKey } from './TabBar';
import { newId } from './id';

type Screen = TabKey | 'add';

/** 아직 만들지 않은 탭 (4~6단계에서 채운다) */
const COMING: Record<Exclude<TabKey, 'home'>, { title: string; step: number; emoji: string }> = {
  plan: { title: '이번 주', step: 4, emoji: '🗓️' },
  order: { title: '장보기 올리기', step: 5, emoji: '🧾' },
  video: { title: '영상 확인', step: 6, emoji: '🎬' },
};

export function App() {
  const today = todayKey();
  const [state, dispatch] = useReducer(reducer, today, (t) => loadState() ?? initialState(t));
  const [screen, setScreen] = useState<Screen>('home');
  const [prevScreen, setPrevScreen] = useState<Screen>('home');
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => saveState(state), [state]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2200);
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
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
