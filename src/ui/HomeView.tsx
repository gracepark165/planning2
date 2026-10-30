import { type ReactNode, useState } from 'react';
import { BURIED_AGO, LOCATIONS, SOON_DAYS, STATE_META } from '../rules/constants';
import {
  countByState,
  dDayLabel,
  daysLeft,
  daysSinceEntered,
  groupForHome,
  homeHeadline,
  sameAsAbove,
  stateOf,
} from '../rules/status';
import type { DateKey, Item, ItemState, Location, MealLog } from '../rules/types';
import { formatDate } from '../rules/date';
import { discardLabel } from '../rules/logs';
import { Tile } from './parts';

type LocFilter = '전체' | Location;
type StateFilter = '전체' | ItemState;

const STATE_FILTERS: StateFilter[] = ['전체', 'soon', 'buried', 'ok'];
const filterLabel = (f: StateFilter) => (f === '전체' ? f : STATE_META[f].label);

/** "싱싱해요" 구역 펼침 상태는 기기에 기억해 둔다 (저장소를 못 써도 동작) */
const OK_OPEN_KEY = 'fridge-planner-ui-ok-open';
const readOkOpen = () => {
  try {
    return globalThis.localStorage?.getItem(OK_OPEN_KEY) === '1';
  } catch {
    return false;
  }
};
const writeOkOpen = (open: boolean) => {
  try {
    globalThis.localStorage?.setItem(OK_OPEN_KEY, open ? '1' : '0');
  } catch {
    // 무시
  }
};

interface Props {
  items: Item[];
  logs: MealLog[];
  today: DateKey;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onReset: () => void;
  onClear: () => void;
  onOrder: () => void;
  /** 첫 방문 안내 카드 */
  onboarding: boolean;
  onOnboard: (mode: 'sample' | 'mine') => void;
  /** 내 재료를 넣은 뒤 "예시 재료는 지울까요?" */
  samplePrompt: boolean;
  onSamplePrompt: (remove: boolean) => void;
  /** 마스코트 카드 아래 오늘의 한 끼 (B-2) */
  todayCard: ReactNode;
}

export function HomeView({
  items,
  logs,
  today,
  onOpen,
  onAdd,
  onReset,
  onClear,
  onOrder,
  onboarding,
  onOnboard,
  samplePrompt,
  onSamplePrompt,
  todayCard,
}: Props) {
  const [loc, setLoc] = useState<LocFilter>('전체');
  const [filter, setFilter] = useState<StateFilter>('전체');
  const [okOpen, setOkOpen] = useState(readOkOpen);
  const [howOpen, setHowOpen] = useState(false);
  const toggleOk = () => {
    writeOkOpen(!okOpen);
    setOkOpen(!okOpen);
  };

  const { title, lead } = homeHeadline(countByState(items, today));
  const locCount = (l: LocFilter) => (l === '전체' ? items.length : items.filter((i) => i.location === l).length);
  // 상태 필터칩을 고르면 그 상태 재료만 먼저 거른다 (같은 이름 재료를 다른 구역에서 끌어오지 않게)
  const groups = groupForHome(
    items.filter((i) => (loc === '전체' || i.location === loc) && (filter === '전체' || stateOf(i, today) === filter)),
    today,
  );
  // 상태 필터칩으로 한 상태만 볼 때는 구역 제목 없이 다 펼친다
  const sectioned = filter === '전체';

  const row = (i: Item, n: number, list: Item[]) => {
    const st = stateOf(i, today);
    const dday = dDayLabel(daysLeft(i, today));
    // 오른쪽 큰 글씨는 "왜 이 구역에 있는지": 잊혀지는 중이면 들어온 지 며칠째, 아니면 남은 기한
    const buried = st === 'buried';
    return (
      <button key={i.id} className={`row ${sameAsAbove(list, n) ? 'same' : ''}`} onClick={() => onOpen(i.id)}>
        <Tile name={i.name} core={i.core} />
        <div className="main">
          <div className="nm">
            {i.name}
            {i.sample && <span className="tag sample">예시</span>}
          </div>
          <div className="meta">
            {i.qty} · {i.location}
            {buried && ` · ${dday}`}
            {i.remaining !== '넉넉해요' && ` · 남은 양 ${i.remaining}`}
          </div>
        </div>
        {/* 상태는 구역 제목·필터칩이 알려주므로 배지 대신 이유를 크게 */}
        <span className={`dday ${st === 'soon' ? 'hot' : buried ? 'bur' : ''}`}>
          {buried ? `${daysSinceEntered(i, today)}일째` : dday}
        </span>
      </button>
    );
  };

  const eaten = logs.filter((l) => l.action === 'eat').length;
  const discarded = logs.length - eaten;
  // 최근에 버린 기록 3개 (이유와 함께)
  const recentDiscards = logs.filter((l) => l.action === 'discard').slice(-3).reverse();

  return (
    <>
      {onboarding && (
        <div className="card blue onboard">
          <h3>지금 보이는 건 예시 재료예요. 내 냉장고로 시작해 볼까요?</h3>
          <button className="cta" onClick={() => onOnboard('mine')}>
            내 재료로 시작할게요
          </button>
          <button className="cta ghost" onClick={() => onOnboard('sample')}>
            예시로 둘러볼게요
          </button>
        </div>
      )}
      {samplePrompt && (
        <div className="notice">
          <span>예시 재료는 지울까요?</span>
          <button className="small-btn" onClick={() => onSamplePrompt(true)}>
            지우기
          </button>
          <button className="small-btn alt" onClick={() => onSamplePrompt(false)}>
            놔둘게요
          </button>
        </div>
      )}
      <div className="hero">
        <span className="ver">{formatDate(today)}</span>
        <h1>{title}</h1>
        <p className="lead">{lead}</p>
        <img className="mascot" alt="" src="/mascot.webp" />
      </div>
      {todayCard}

      <div className="seg" style={{ marginTop: 16 }}>
        {(['전체', ...LOCATIONS] as LocFilter[]).map((l) => (
          <button key={l} className={loc === l ? 'on' : ''} onClick={() => setLoc(l)}>
            {l} {locCount(l)}
          </button>
        ))}
      </div>
      <div className="chips" style={{ marginTop: 8 }}>
        {STATE_FILTERS.map((f) => (
          <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
            {filterLabel(f)}
          </button>
        ))}
      </div>

      <div>
        {!items.length ? (
          <div className="card" style={{ textAlign: 'center', padding: '28px 16px' }}>
            <h3>냉장고가 비어 있어요</h3>
            <p>장 본 주문 화면이나 영수증을 올리거나, 재료를 하나씩 추가해 주세요.</p>
            <div className="ctas">
              <button className="cta ghost" onClick={onAdd}>
                재료 추가
              </button>
              <button className="cta" onClick={onOrder}>
                장보기 올리기
              </button>
            </div>
          </div>
        ) : groups.length ? (
          groups.map((g) => {
            const folded = sectioned && g.state === 'ok' && !okOpen;
            return (
              <section key={g.state} aria-label={STATE_META[g.state].label}>
                {sectioned && (
                  <div className={`sec-head s-${g.state}`}>
                    <span>
                      {STATE_META[g.state].icon} {STATE_META[g.state].label} <b>{g.count}</b>
                    </span>
                    {g.state === 'ok' && (
                      <button onClick={toggleOk} aria-expanded={okOpen}>
                        {okOpen ? '접기 ▴' : '펼치기 ▾'}
                      </button>
                    )}
                  </div>
                )}
                {!folded && g.items.map(row)}
              </section>
            );
          })
        ) : (
          <p className="lead" style={{ padding: '32px 0', textAlign: 'center' }}>
            이 상태의 재료가 없어요
          </p>
        )}
      </div>

      {logs.length > 0 && (
        <div className="card">
          <h3>이번 기록</h3>
          <p>
            다 먹었어요 {eaten}개 · 버렸어요 {discarded}개
          </p>
          {recentDiscards.length > 0 && (
            <ul className="log-list">
              {recentDiscards.map((l) => (
                <li key={`${l.itemId}-${l.at}`}>
                  {l.name && <b>{l.name}</b>}
                  {discardLabel(l)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button className="note how" aria-expanded={howOpen} onClick={() => setHowOpen(!howOpen)}>
        상태는 어떻게 정해요? {howOpen ? '▴' : '▾'}
      </button>
      {howOpen && (
        <p className="note">
          상태는 소비기한 {SOON_DAYS}일 이내({STATE_META.soon.label}), 들어온 지 {BURIED_AGO}일 이상(
          {STATE_META.buried.label}) 같은 규칙으로 계산해요. {STATE_META.soon.label} → {STATE_META.buried.label} →{' '}
          {STATE_META.ok.label} 순서로 묶고, 같은 묶음 안은 기한이 가까운 순서예요. 이름이 같은 재료는 가장 급한 것 아래에 붙여서 보여줘요. 기본 기간표로 정한 소비기한은 식약처 기준으로 검증하기 전이라 ‘임시’예요.
        </p>
      )}
      <div className="acts" style={{ gap: 16 }}>
        {items.length > 0 && (
          <button className="note" style={{ textDecoration: 'underline', marginTop: 4 }} onClick={onClear}>
            냉장고 비우기
          </button>
        )}
        <button className="note" style={{ textDecoration: 'underline', marginTop: 4 }} onClick={onReset}>
          예시 재료로 되돌리기
        </button>
      </div>
      {/* 맨 아래까지 스크롤하면 마지막 줄이 + 버튼·하단 탭에 가리지 않게 */}
      <div className="fab-space" aria-hidden="true" />
      <button className="fab" onClick={onAdd}>
        + 재료 추가
      </button>
    </>
  );
}
