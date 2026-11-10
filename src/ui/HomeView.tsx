import { type ReactNode, useEffect, useState } from 'react';
import { BURIED_AGO, LOCATIONS, SOON_DAYS, STATE_META } from '../rules/constants';
import {
  countByState,
  dDayLabel,
  dueBannerText,
  daysLeft,
  daysSinceEntered,
  groupForHome,
  homeHeadline,
  stateOf,
} from '../rules/status';
import { clusterSameName, groupByCategory } from '../rules/homeGroups';
import { CATEGORIES, categoryMeta, categoryOfItem } from '../data';
import type { DateKey, Item, ItemState, Location } from '../rules/types';
import { formatDate } from '../rules/date';
import { nextFabHidden } from './fabScroll';
import { FoodIcon, Tile } from './parts';
import { findCatalog } from '../data';

type LocFilter = '전체' | Location;
/** 재료 보기 (2026-11-09, 사용자 요청): 목록 또는 폰 바탕화면 폴더처럼 분류별 네모 폴더 */
type ViewMode = 'list' | 'folder';
const VIEW_KEY = 'fridge-home-view';
const loadView = (): ViewMode => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'folder' ? 'folder' : 'list';
  } catch {
    return 'list';
  }
};
type StateFilter = '전체' | ItemState;

const STATE_FILTERS: StateFilter[] = ['전체', 'soon', 'buried', 'ok'];
const filterLabel = (f: StateFilter) => (f === '전체' ? f : STATE_META[f].label);

interface Props {
  items: Item[];
  today: DateKey;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onReset: () => void;
  onClear: () => void;
  onOrder: () => void;
  /** 맨 위 공감 랭킹 카드 (2026-11-09: 예전 "예시 재료" 안내 카드 자리) */
  ranking: ReactNode;
  /** 내 재료를 넣은 뒤 "예시 재료는 지울까요?" */
  samplePrompt: boolean;
  onSamplePrompt: (remove: boolean) => void;
  /** 마스코트 카드 아래 오늘의 한 끼 (B-2) */
  todayCard: ReactNode;
  /** "홈 화면에 추가해 두면 더 빨리 열 수 있어요" 카드 (B-3, V3-3) */
  notifAsk: boolean;
  onNotifAsk: (choice: 'install' | 'later') => void;
  /** 인앱 배너가 짚을 가장 급한 재료 (없으면 숨김) */
  bannerItem: Item | undefined;
  onCloseBanner: () => void;
  /** 알림 시간 설정 화면으로 */
  onNotifySettings: () => void;
  /** "넣은 재료 보기"를 누를 때마다 바뀌는 값: 방금 넣은 재료가 보이게 펼치고 그 줄로 스크롤 (V4-4) */
  revealNew: number;
  /** 한 번 보여줬으면 알린다 (홈에 다시 올 때마다 스크롤하지 않게) */
  onRevealed: () => void;
}

export function HomeView({
  items,
  today,
  onOpen,
  onAdd,
  onReset,
  onClear,
  onOrder,
  ranking,
  samplePrompt,
  onSamplePrompt,
  todayCard,
  notifAsk,
  onNotifAsk,
  bannerItem,
  onCloseBanner,
  onNotifySettings,
  revealNew,
  onRevealed,
}: Props) {
  const [loc, setLoc] = useState<LocFilter>('전체');
  const [filter, setFilter] = useState<StateFilter>('전체');
  // 싱싱해요의 큰 분류·같은 이름 묶음 중 펼친 것. 처음엔 접되, 오늘 새로 넣은 재료가 든 분류는 펼쳐 둔다
  // (2026-11-09 사용자 제보: 까나리액젓을 넣었는데 '기타' 분류 안에 접혀 있어 안 보였음)
  const [openCats, setOpenCats] = useState<ReadonlySet<string>>(
    () => new Set(items.filter((i) => i.addedOn === today).map((i) => categoryOfItem(i))),
  );
  const [openClusters, setOpenClusters] = useState<ReadonlySet<string>>(new Set());
  const toggleIn = (set: ReadonlySet<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };
  const [howOpen, setHowOpen] = useState(false);
  const [view, setViewState] = useState<ViewMode>(loadView);
  const setView = (v: ViewMode) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // 저장 못 해도 이번에는 바뀐다
    }
  };
  /** 폴더 보기에서 연 폴더 (분류 id) */
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  useEffect(() => {
    if (!openFolder) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenFolder(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openFolder]);
  // "넣은 재료 보기": 전체 보기로 바꾸고, 방금 넣은 재료가 든 분류·같은 이름 묶음을 펼친 뒤 첫 줄로 스크롤
  useEffect(() => {
    if (!revealNew) return;
    setLoc('전체');
    setFilter('전체');
    const fresh = items.filter((i) => i.addedOn === today);
    setOpenCats((s) => new Set([...s, ...fresh.map((i) => categoryOfItem(i))]));
    setOpenClusters((s) => new Set([...s, ...fresh.map((i) => i.name)]));
    const t = window.setTimeout(() => {
      document.querySelector('.row.new')?.scrollIntoView({ block: 'center' });
      onRevealed();
    }, 50);
    return () => window.clearTimeout(t);
  }, [revealNew, onRevealed, items, today]);

  // + 재료 추가 버튼: 아래로 스크롤하는 동안은 숨긴다 (V3-6-3)
  const [fabHidden, setFabHidden] = useState(false);
  useEffect(() => {
    let prevY = window.scrollY;
    const onScroll = () => {
      const from = prevY;
      const y = window.scrollY;
      const vh = window.innerHeight;
      const page = document.documentElement.scrollHeight;
      prevY = y;
      setFabHidden((h) => nextFabHidden(h, from, y, vh, page));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const { title, lead } = homeHeadline(countByState(items, today));
  const locCount = (l: LocFilter) => (l === '전체' ? items.length : items.filter((i) => i.location === l).length);
  // 상태 필터칩을 고르면 그 상태 재료만 먼저 거른다 (같은 이름 재료를 다른 구역에서 끌어오지 않게)
  const groups = groupForHome(
    items.filter((i) => (loc === '전체' || i.location === loc) && (filter === '전체' || stateOf(i, today) === filter)),
    today,
  );
  // 상태 필터칩으로 한 상태만 볼 때는 구역 제목 없이 다 펼친다
  const sectioned = filter === '전체';

  const row = (i: Item, same = false) => {
    const st = stateOf(i, today);
    const dday = dDayLabel(daysLeft(i, today));
    // 오른쪽 큰 글씨는 "왜 이 구역에 있는지": 잊혀지는 중이면 들어온 지 며칠째, 아니면 남은 기한
    const buried = st === 'buried';
    return (
      <button
        key={i.id}
        className={`row ${same ? 'same' : ''} ${i.addedOn === today ? 'new' : ''}`}
        onClick={() => onOpen(i.id)}
      >
        <Tile name={i.name} core={i.core} kind={i.kind} />
        <div className="main">
          <div className="nm">
            {i.name}
            {i.sample && <span className="tag sample">예시</span>}
            {i.addedOn === today && <span className="tag fresh">새로</span>}
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

  // 이름이 같은 재료 여러 개: 한 줄로 접고(아이콘 두 겹 테두리), 누르면 하나씩 펼친다
  const cluster = (c: Item[]) => {
    if (c.length === 1) return row(c[0]);
    const first = c[0];
    const key = first.name;
    const open = openClusters.has(key);
    const st = stateOf(first, today);
    const buried = st === 'buried';
    const dday = dDayLabel(daysLeft(first, today));
    return (
      <div key={`c-${first.id}`} className="same-group">
        <button
          className={`row stack ${c.some((i) => i.addedOn === today) ? 'new' : ''}`}
          aria-expanded={open}
          onClick={() => setOpenClusters((s) => toggleIn(s, key))}
        >
          <Tile name={first.name} core={first.core} kind={first.kind} stack />
          <div className="main">
            <div className="nm">
              {first.name}
              <span className="tag count">
                {c.length}개 {open ? '▴' : '▾'}
              </span>
              {c.some((i) => i.sample) && <span className="tag sample">예시</span>}
              {c.some((i) => i.addedOn === today) && <span className="tag fresh">새로</span>}
            </div>
            <div className="meta">
              {first.qty} · {first.location} 외 {c.length - 1}개
            </div>
          </div>
          <span className={`dday ${st === 'soon' ? 'hot' : buried ? 'bur' : ''}`}>
            {buried ? `${daysSinceEntered(first, today)}일째` : dday}
          </span>
        </button>
        {open && c.map((i) => row(i, true))}
      </div>
    );
  };
  const listOf = (list: Item[]) => clusterSameName(list).map(cluster);
  // 싱싱해요: 큰 분류로 묶고, 분류 옆에는 그 안에서 가장 임박한 날짜
  const byCategory = (list: Item[]) =>
    groupByCategory(list, today, categoryOfItem, CATEGORIES.map((c) => c.id)).map((g) => {
      const m = categoryMeta(g.id);
      const open = openCats.has(g.id);
      return (
        <div key={`cat-${g.id}`} className="cat-group">
          <button className={`row cat ${open ? 'open' : ''}`} aria-expanded={open} onClick={() => setOpenCats((s) => toggleIn(s, g.id))}>
            <span className="tile" aria-hidden="true">
              {m.emoji}
            </span>
            <div className="main">
              <div className="nm">{m.label}</div>
              <div className="meta">{g.items.length}개</div>
            </div>
            <span className="dday">{dDayLabel(g.nearestLeft)}</span>
            <span className="chev" aria-hidden="true">
              {open ? '▴' : '▾'}
            </span>
          </button>
          {open && <div className="cat-body">{listOf(g.items)}</div>}
        </div>
      );
    });

  // 폴더 보기: 걸러진 재료를 급한 순서 그대로 분류별 네모 폴더에 담는다 (폴더끼리도 가장 급한 재료 순)
  const folders = groupByCategory(groups.flatMap((g) => g.items), today, categoryOfItem, CATEGORIES.map((c) => c.id));
  const iconOf = (i: Item) => <FoodIcon entry={findCatalog(i.name)} core={i.core} kind={i.kind} />;
  const folderGrid = (
    <div className="folders">
      {folders.map((f) => {
        const m = categoryMeta(f.id);
        const soon = f.items.filter((i) => stateOf(i, today) === 'soon').length;
        return (
          <button key={f.id} className="folder" onClick={() => setOpenFolder(f.id)} aria-label={`${m.label} 폴더, ${f.items.length}개${soon ? `, 얼른 먹어야 할 재료 ${soon}개` : ''}`}>
            <span className="folder-box">
              {f.items.slice(0, 9).map((i) => (
                <span key={i.id} className={`mini ${stateOf(i, today)}`}>
                  {iconOf(i)}
                </span>
              ))}
              {soon > 0 && <span className="folder-badge">{soon}</span>}
            </span>
            <span className="folder-name">
              {m.label} <small>{f.items.length}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
  const folderOpen = openFolder ? folders.find((f) => f.id === openFolder) : undefined;
  const folderPop = folderOpen && (
    <div className="sheet-bg folder-bg" onClick={() => setOpenFolder(null)}>
      <div className="folder-pop" role="dialog" aria-modal="true" aria-label={`${categoryMeta(folderOpen.id).label} 폴더`} onClick={(e) => e.stopPropagation()}>
        <h2>
          {categoryMeta(folderOpen.id).emoji} {categoryMeta(folderOpen.id).label}
        </h2>
        <div className="folder-apps">
          {folderOpen.items.map((i) => {
            const st = stateOf(i, today);
            return (
              <button
                key={i.id}
                className="app-icon"
                onClick={() => {
                  setOpenFolder(null);
                  onOpen(i.id);
                }}
              >
                <span className={`app-tile ${st}`}>
                  {iconOf(i)}
                  {i.sample && <span className="app-tag">예시</span>}
                </span>
                <span className="app-name">{i.name}</span>
                <span className={`app-dday ${st === 'soon' ? 'hot' : st === 'buried' ? 'bur' : ''}`}>
                  {st === 'buried' ? `${daysSinceEntered(i, today)}일째` : dDayLabel(daysLeft(i, today))}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );


  return (
    <>
      {ranking}
      {notifAsk && (
        <div className="card blue onboard">
          <h3>홈 화면에 추가해 두면 더 빨리 열 수 있어요</h3>
          <p>앱을 열면 얼른 먹어야 할 재료부터 알려드려요.</p>
          <button className="cta" onClick={() => onNotifAsk('install')}>
            홈 화면에 추가하는 방법 보기
          </button>
          <button className="cta ghost" onClick={() => onNotifAsk('later')}>
            나중에
          </button>
        </div>
      )}
      {bannerItem && (
        <div className="banner" role="status">
          <button className="banner-text" onClick={() => onOpen(bannerItem.id)}>
            {STATE_META.soon.icon} {dueBannerText(bannerItem, today)}
          </button>
          <button className="banner-x" aria-label="배너 닫기" onClick={onCloseBanner}>
            ✕
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
      <div className="filter-row">
        <div className="chips" style={{ marginTop: 8 }}>
          {STATE_FILTERS.map((f) => (
            <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
              {filterLabel(f)}
            </button>
          ))}
        </div>
        <div className="view-toggle" role="radiogroup" aria-label="재료 보기">
          <button role="radio" aria-checked={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} aria-label="목록으로 보기">
            ☰
          </button>
          <button role="radio" aria-checked={view === 'folder'} className={view === 'folder' ? 'on' : ''} onClick={() => setView('folder')} aria-label="폴더로 보기">
            ▦
          </button>
        </div>
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
        ) : groups.length && view === 'folder' ? (
          folderGrid
        ) : groups.length ? (
          groups.map((g) => (
            <section key={g.state} aria-label={STATE_META[g.state].label}>
              {sectioned && (
                <div className={`sec-head s-${g.state}`}>
                  <span>
                    {STATE_META[g.state].icon} {STATE_META[g.state].label} <b>{g.count}</b>
                  </span>
                </div>
              )}
              {g.state === 'ok' ? byCategory(g.items) : listOf(g.items)}
            </section>
          ))
        ) : (
          <p className="lead" style={{ padding: '32px 0', textAlign: 'center' }}>
            이 상태의 재료가 없어요
          </p>
        )}
      </div>

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
        <button className="note" style={{ textDecoration: 'underline', marginTop: 4 }} onClick={onNotifySettings}>
          알림 시간 설정
        </button>
      </div>
      {/* 맨 아래까지 스크롤하면 마지막 줄이 + 버튼·하단 탭에 가리지 않게 */}
      <div className="fab-space" aria-hidden="true" />
      {folderPop}
      {/* 냉장고가 비었으면 안내 카드에 재료 추가 버튼이 있으니 떠 있는 버튼은 숨긴다 */}
      {items.length > 0 && (
        <button className={`fab ${fabHidden ? 'hide' : ''}`} onClick={onAdd} tabIndex={fabHidden ? -1 : 0}>
          + 재료 추가
        </button>
      )}
    </>
  );
}
