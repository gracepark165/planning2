import { type ReactNode, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { PLAN_RECIPES, SUBSTITUTES, findCatalog } from '../data';
import { suggestMenus } from '../ai/client';
import { AI_DAILY_LIMIT, useAiMenus } from '../state/aiMenu';
import { todayKey } from '../rules/date';
import { fitPin, makePlan, mealsForNewPin, todayMeal } from '../rules/plan';
import { missingToBuy } from '../rules/shopping';
import { eul, eun, ro, withJosa } from '../rules/josa';
import type { PinnedMeal, Recipe } from '../rules/types';
import { loadState, saveState } from '../state/persist';
import { withMyFoods } from '../state/myFoods';
import {
  initialState,
  newItemFromPick,
  reducer,
  showIntro,
  showNotifAsk,
  showOnboarding,
  showSamplePrompt,
  soonBanner,
  type AddPick,
} from '../state/store';
import { AddView } from './AddView';
import { BuyCheckSheet } from './BuyCheckSheet';
import { DiscardSheet } from './DiscardSheet';
import { HomeView } from './HomeView';
import { InstallGuideView, NotifyTimeView } from './NotifyView';
import { ItemSheet } from './ItemSheet';
import { OpeningView } from './OpeningView';
import { OrderView } from './OrderView';
import { PlanView } from './PlanView';
import { TodayCard } from './TodayCard';
import { VideoView } from './VideoView';
import { TabBar, type TabKey } from './TabBar';
import { newId } from './id';

type Screen = TabKey | 'add' | 'notify' | 'install';

interface Toast {
  msg: string;
  action?: { label: string; run: () => void };
}


export function App() {
  const today = todayKey();
  const [state, dispatch] = useReducer(reducer, today, (t) => loadState() ?? initialState(t));
  const [screen, setScreen] = useState<Screen>('home');
  const [prevScreen, setPrevScreen] = useState<Screen>('home');
  /** 홈 화면에 추가하는 방법에서 뒤로 갈 곳 (홈 카드 또는 알림 시간 설정) */
  const [installBack, setInstallBack] = useState<Screen>('home');
  const [sheetId, setSheetId] = useState<string | null>(null);
  /** 버렸어요 다음에 이유를 물을 기록 (B-4) */
  const [discardAsk, setDiscardAsk] = useState<{ itemId: string; at: string; name: string } | null>(null);
  /** 사야 할 재료가 있는 메뉴를 확정할 때 "준비됐어요?" (V4-6-5) */
  const [buyAsk, setBuyAsk] = useState<{ recipe: Recipe; missing: string[] } | null>(null);
  const cancelBuyAsk = useCallback(() => setBuyAsk(null), []);
  const [toast, setToast] = useState<Toast | null>(null);
  const [orderRound, setOrderRound] = useState(0);
  /** 장보기 올리기 글 입력칸에 미리 채울 글 (장보기 목록에서 산 재료) */
  const [orderText, setOrderText] = useState('');
  /** "넣은 재료 보기" (V4-4): 누를 때마다 1씩 올려서 홈이 방금 넣은 재료를 보여주게 */
  const [revealNew, setRevealNew] = useState(0);
  const doneRevealing = useCallback(() => setRevealNew(0), []);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => saveState(state), [state]);
  // 앱을 연 날 세기 (하루에 한 번만, 홈 화면 추가 카드를 보여줄 때 씀)
  useEffect(() => dispatch({ type: 'appOpened', today }), [today]);

  const showToast = useCallback((msg: string, action?: Toast['action']) => {
    setToast({ msg, action });
    window.clearTimeout(toastTimer.current);
    // 되돌리기 같은 버튼이 있으면 누를 시간을 더 준다
    toastTimer.current = window.setTimeout(() => setToast(null), action ? 5000 : 2200);
  }, []);

  const go = (s: Screen) => {
    // 하위 화면(재료 추가·알림 시간·홈 화면 추가 방법)에서 뒤로 가면 들어오기 전 탭으로.
    // 하위 화면끼리 오갈 때는 처음 들어온 탭을 그대로 기억한다
    const isSub = (x: Screen) => x === 'add' || x === 'notify' || x === 'install';
    if (isSub(s) && !isSub(screen)) setPrevScreen(screen);
    setScreen(s);
    setSheetId(null);
    window.scrollTo(0, 0);
  };

  const openInstallGuide = () => {
    setInstallBack(screen);
    go('install');
  };

  const addFromPicks = (picks: AddPick[]) => {
    const lookup = withMyFoods(findCatalog, state.myFoods);
    const items = picks.map((p) => newItemFromPick(p, today, newId(), lookup)).filter((i) => i !== undefined);
    dispatch({ type: 'addItems', items, today });
    go('home');
    showToast(`${items.length}개를 냉장고에 넣었어요`);
  };

  const undoMeal = (recipeName: string, at: string) => {
    dispatch({ type: 'undoMeal', at });
    showToast(`${recipeName}에 쓴 재료를 냉장고로 되돌렸어요`);
  };

  // 이번 주 플랜은 여기서 한 번만 짠다. 홈의 오늘의 한 끼와 이번 주 화면이 같은 결과를 본다.
  const basePlan = useMemo(() => makePlan(state.items, PLAN_RECIPES, state.plan, today), [state.items, state.plan, today]);
  // 규칙 플랜이 못 채운 칸은 AI가 채운다 (V4-1b). 결과는 재고·칸·제외 메뉴로 만든 이름표로 저장해 두고 다시 부르지 않는다
  const ai = useAiMenus(basePlan, state.items, state.plan, today, SUBSTITUTES, suggestMenus);
  const planResult = ai.result;

  /** "이걸로 할게요" (홈·이번 주 화면 공통): 사야 할 재료가 아직 없으면 먼저 묻고, 아니면 바로 확정 */
  const confirmMeal = (recipe: Recipe) => {
    const missing = missingToBuy(recipe, state.items);
    if (missing.length) setBuyAsk({ recipe, missing });
    else doConfirm(recipe);
  };

  /** 확정: 쓴 재료를 빼고, 되돌리기를 보여준다 */
  const doConfirm = (recipe: Recipe) => {
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
  /** 바꾸기: 규칙 칸은 다음 후보, AI 칸은 그 칸만 다시 요청 */
  const swap = (slotIndex: number) => {
    if (!planResult.slots.find((s) => s.index === slotIndex)?.ai) {
      dispatch({ type: 'swap', slotIndex });
      return;
    }
    void ai.swap(slotIndex).then((why) => {
      if (why === 'limit') showToast(`오늘 AI 메뉴 제안을 다 썼어요 (하루 ${AI_DAILY_LIMIT}번). 지금 메뉴를 그대로 둘게요`);
      else if (why === 'busy') showToast('AI 요청이 잠깐 몰렸어요. 몇 분 뒤 다시 바꿔 주세요');
      else if (why) showToast('다른 메뉴를 찾지 못했어요. 지금 메뉴를 그대로 둘게요');
    });
  };

  /**
   * 영상 확인 결과 → 이번 주 플랜(고정 끼니) / 오늘 한 끼 (V3-1).
   * 급한 재료를 밀어내지 않게 집밥을 늘려야 하면 늘리고 되돌리기를 보여준다.
   * 7번으로도 안 되면 넣지 않고 못 먹게 되는 재료를 돌려준다 (영상 화면이 확인 시트를 띄움). force = "그래도 넣을게요".
   */
  const pinMeal = (meal: PinnedMeal, mode: 'week' | 'today', force = false): { ok: true } | { ok: false; lost: string[] } => {
    const fit = force ? undefined : fitPin(state.items, PLAN_RECIPES, state.plan, meal, today);
    if (fit && !fit.ok) return fit;
    const before = { mealsPerWeek: state.plan.mealsPerWeek, shoppingList: state.shoppingList };
    const mealsPerWeek = fit ? fit.mealsPerWeek : mealsForNewPin(state.plan, today);
    dispatch({ type: 'pinMeal', meal: force ? { ...meal, force: true } : meal, mealsPerWeek });
    go(mode === 'today' ? 'home' : 'plan');
    if (mealsPerWeek > before.mealsPerWeek) {
      showToast(`${meal.name}${eul(meal.name)} 넣느라 집밥을 ${mealsPerWeek}번으로 늘렸어요`, {
        label: '되돌리기',
        run: () => dispatch({ type: 'undoPin', id: meal.id, ...before }),
      });
      return { ok: true };
    }
    const extra = meal.buy.length ? ` 사야 할 재료 ${meal.buy.length}개는 장보기 목록에 담았어요` : '';
    showToast(
      mode === 'today'
        ? `오늘 한 끼를 ${meal.name}${ro(meal.name)} 정했어요.${extra}`
        : `${meal.name}${eul(meal.name)} 이번 주 플랜에 넣었어요.${extra}`,
    );
    return { ok: true };
  };

  const sheetItem = state.items.find((i) => i.id === sheetId);
  const closeSheet = useCallback(() => setSheetId(null), []);
  const skipDiscardReason = useCallback(() => {
    if (discardAsk) showToast(`${withJosa(discardAsk.name, eul)} 버린 걸로 기록했어요`);
    setDiscardAsk(null);
  }, [discardAsk, showToast]);

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
          if (!window.confirm(`냉장고에 있는 재료 ${n}개를 모두 지울까요?\n먹은·버린 기록과 플랜도 같이 지워져요. 지난번에 정한 값은 남아요.`)) return;
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
        notifAsk={showNotifAsk(state)}
        onNotifAsk={(choice) => {
          dispatch({ type: 'answerNotifAsk', choice, at: new Date().toISOString() });
          if (choice === 'install') openInstallGuide();
          else showToast('알겠어요. 홈 화면에 추가하는 방법은 ‘알림 시간 설정’에서 언제든 볼 수 있어요');
        }}
        bannerItem={soonBanner(state, today)}
        revealNew={revealNew}
        onRevealed={doneRevealing}
        onCloseBanner={() => dispatch({ type: 'closeBanner', today })}
        onNotifySettings={() => go('notify')}
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
        logs={state.logs}
        plan={state.plan}
        result={planResult}
        aiStates={ai.states}
        aiSwapping={ai.swapping}
        aiNotice={ai.notice}
        mustUseFirst={ai.mustUseFirst}
        onFindByVideo={() => go('video')}
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
        onRemovePinned={(id) => {
          const name = state.plan.pinned.find((p) => p.id === id)?.name;
          dispatch({ type: 'removePinned', id });
          if (name) showToast(`영상 메뉴 ${withJosa(name, eul)} 뺐어요`);
        }}
        shoppingList={state.shoppingList}
        onToggleShop={(name) => dispatch({ type: 'toggleShopping', name })}
        onRemoveShop={(name) => dispatch({ type: 'removeShopping', name })}
        onBought={(names) => {
          // 바로 읽지 않고, 글 입력칸에 채워서 장보기 올리기로
          setOrderText(names.join('\n'));
          setOrderRound((n) => n + 1);
          go('order');
        }}
      />
    );
  } else if (screen === 'notify') {
    view = (
      <NotifyTimeView
        time={state.notif.time}
        onTime={(time) => {
          dispatch({ type: 'setNotifTime', time });
          showToast('알림 시간을 저장했어요');
        }}
        onInstallGuide={openInstallGuide}
        onBack={() => go(prevScreen)}
      />
    );
  } else if (screen === 'install') {
    view = <InstallGuideView onBack={() => go(installBack)} />;
  } else if (screen === 'add') {
    view = <AddView items={state.items} onBack={() => go(prevScreen)} onAdd={addFromPicks} />;
  }

  return (
    <>
      <div id="app">
        {view}
        {/* 영상 확인·장보기 올리기는 진행 중인 단계를 기억하도록 다른 탭에 가도 화면을 숨기기만 한다 */}
        <div hidden={screen !== 'video'}>
          <VideoView items={state.items} today={today} onPin={pinMeal} />
        </div>
        <div hidden={screen !== 'order'}>
          <OrderView
            key={orderRound}
            initialText={orderText}
            today={today}
            myFoods={state.myFoods}
            onPickCatalog={() => go('add')}
            onAdd={(items) => {
              dispatch({ type: 'addItems', items, today });
              setOrderRound((n) => n + 1); // 넣고 나면 다음에는 처음 화면부터
              setOrderText('');
              go('plan');
              showToast('냉장고에 넣었어요. 앞으로 7일 먹을 순서예요', {
                label: '넣은 재료 보기',
                run: () => {
                  go('home');
                  setRevealNew((n) => n + 1);
                },
              });
            }}
          />
        </div>
      </div>
      <TabBar active={screen === 'add' || screen === 'notify' || screen === 'install' ? 'home' : screen} onChange={go} />
      {sheetItem && (
        <ItemSheet
          item={sheetItem}
          today={today}
          onClose={closeSheet}
          onShift={(delta) => dispatch({ type: 'shiftExpiry', id: sheetItem.id, delta })}
          onRemaining={(remaining) => dispatch({ type: 'setRemaining', id: sheetItem.id, remaining })}
          onFinish={(action) => {
            const at = new Date().toISOString();
            dispatch({ type: 'finishItem', id: sheetItem.id, action, today, at });
            setSheetId(null);
            // 버렸어요만 이유를 한 번 묻는다 (기록은 이미 남김, 건너뛰면 이유 없음)
            if (action === 'discard') setDiscardAsk({ itemId: sheetItem.id, at, name: sheetItem.name });
            else showToast(`${withJosa(sheetItem.name, eul)} 다 먹은 걸로 기록했어요`);
          }}
          onLocation={(location) => dispatch({ type: 'setLocation', id: sheetItem.id, location })}
          onEntered={(enteredAt) => dispatch({ type: 'setEnteredAt', id: sheetItem.id, enteredAt })}
          onPortion={(portion) => dispatch({ type: 'setPortion', id: sheetItem.id, portion })}
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
      {buyAsk && (
        <BuyCheckSheet
          missing={buyAsk.missing}
          onBought={() => {
            for (const name of buyAsk.missing) dispatch({ type: 'removeShopping', name });
            doConfirm(buyAsk.recipe);
            setBuyAsk(null);
          }}
          onWithout={() => {
            doConfirm(buyAsk.recipe);
            setBuyAsk(null);
          }}
          onCancel={cancelBuyAsk}
        />
      )}
      {discardAsk && (
        <DiscardSheet
          name={discardAsk.name}
          onPick={(reason) => {
            dispatch({ type: 'setDiscardReason', itemId: discardAsk.itemId, at: discardAsk.at, reason });
            setDiscardAsk(null);
            showToast(`${withJosa(discardAsk.name, eul)} 버린 걸로 기록했어요`);
          }}
          onSkip={skipDiscardReason}
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
