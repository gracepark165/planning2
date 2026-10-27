import { useState } from 'react';
import { BURIED_AGO, LOCATIONS, SOON_DAYS, STATE_META } from '../rules/constants';
import { countByState, dDayLabel, daysLeft, homeHeadline, sortForHome, stateOf } from '../rules/status';
import type { DateKey, Item, ItemState, Location, MealLog } from '../rules/types';
import { StateBadge, Tile, dateWithDow } from './parts';

type LocFilter = '전체' | Location;
type StateFilter = '전체' | ItemState;

const STATE_FILTERS: StateFilter[] = ['전체', 'soon', 'buried', 'ok'];
const filterLabel = (f: StateFilter) => (f === '전체' ? f : STATE_META[f].label);

interface Props {
  items: Item[];
  logs: MealLog[];
  today: DateKey;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onPlan: () => void;
  onReset: () => void;
}

export function HomeView({ items, logs, today, onOpen, onAdd, onPlan, onReset }: Props) {
  const [loc, setLoc] = useState<LocFilter>('전체');
  const [filter, setFilter] = useState<StateFilter>('전체');

  const { title, lead } = homeHeadline(countByState(items, today));
  const locCount = (l: LocFilter) => (l === '전체' ? items.length : items.filter((i) => i.location === l).length);
  const list = sortForHome(
    items.filter((i) => loc === '전체' || i.location === loc),
    today,
  ).filter((i) => filter === '전체' || stateOf(i, today) === filter);

  const eaten = logs.filter((l) => l.action === 'eat').length;
  const discarded = logs.length - eaten;

  return (
    <>
      <div className="hero">
        <span className="ver">{dateWithDow(today)}</span>
        <h1>{title}</h1>
        <p className="lead">{lead}</p>
        <button className="pill" onClick={onPlan}>
          오늘 뭐 먹지? ›
        </button>
        <img className="mascot" alt="" src="/mascot.webp" />
      </div>

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
        {list.length ? (
          list.map((i) => (
            <button key={i.id} className="row" onClick={() => onOpen(i.id)}>
              <Tile name={i.name} core={i.core} />
              <div className="main">
                <div className="nm">{i.name}</div>
                <div className="meta">
                  {i.qty} · {i.location} · {dDayLabel(daysLeft(i, today))}
                  {i.remaining !== '넉넉해요' && ` · 남은 양 ${i.remaining}`}
                </div>
              </div>
              <StateBadge state={stateOf(i, today)} />
            </button>
          ))
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
        </div>
      )}

      <p className="note">
        상태는 소비기한 {SOON_DAYS}일 이내({STATE_META.soon.label}), 들어온 지 {BURIED_AGO}일 이상(
        {STATE_META.buried.label}) 같은 규칙으로 계산해요. {STATE_META.buried.label}인 재료를 맨 위에, 그다음 기한이
        가까운 순서예요. 기본 기간표로 정한 소비기한은 식약처 기준으로 검증하기 전이라 ‘임시’예요.
      </p>
      <button className="note" style={{ textDecoration: 'underline', display: 'block', marginTop: 4 }} onClick={onReset}>
        처음 상태로 되돌리기
      </button>
      <button className="fab" onClick={onAdd}>
        + 재료 추가
      </button>
    </>
  );
}
