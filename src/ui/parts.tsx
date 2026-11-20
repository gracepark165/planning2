// 여러 화면에서 같이 쓰는 작은 조각들

import { useState } from 'react';
import { findCatalog } from '../data';
import { ENTERED_CHOICES, STATE_META } from '../rules/constants';
import { addDays, daysBetween, formatDate } from '../rules/date';
import { emojiOf, imageOf } from '../rules/emoji';
import { findItem } from '../rules/plan';
import { dDayLabel, daysLeft, stateOf } from '../rules/status';
import type { CatalogEntry, Core, DateKey, Item, ItemState, Recipe } from '../rules/types';

/** 재료 그림: 사전에 그림이 있으면 그림, 없으면 이모지 */
export function FoodIcon({ entry, core, kind }: { entry: CatalogEntry | undefined; core: Core; kind?: string }) {
  const src = imageOf(entry, kind);
  if (src) return <img className="food-img" src={src} alt="" width={256} height={256} loading="lazy" decoding="async" draggable={false} />;
  return <>{emojiOf(core, entry)}</>;
}

/** 재료 그림 타일. stack이면 같은 재료가 여러 개라는 뜻으로 테두리를 두 겹으로 */
export function Tile({ name, core, kind, stack = false }: { name: string; core: Core; kind?: string; stack?: boolean }) {
  return (
    <span className={`tile${stack ? ' stack' : ''}`} aria-hidden="true">
      <FoodIcon entry={findCatalog(name)} core={core} kind={kind} />
    </span>
  );
}

export function StateBadge({ state }: { state: ItemState }) {
  const m = STATE_META[state];
  return (
    <span className={`badge b-${state}`}>
      <span className="em">{m.icon}</span>
      {m.label}
    </span>
  );
}

/** 끼니가 쓰는 재료 칩: 오늘 내일 해요면 D-day, 잊혀지는 중이면 상태 이름을 붙여 색으로 표시 */
export function UseTag({ name, items, today }: { name: string; items: readonly Item[]; today: DateKey }) {
  const it = findItem(items, name, today);
  const st = it ? stateOf(it, today) : 'ok';
  const cls = st === 'soon' ? 'hot' : st === 'buried' ? 'bur' : '';
  const extra = st === 'soon' && it ? ` · ${dDayLabel(daysLeft(it, today))}` : st === 'buried' ? ` · ${STATE_META.buried.label}` : '';
  return <span className={`tag ${cls}`}>{name + extra}</span>;
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="back" onClick={onClick} aria-label="뒤로가기">
      ‹
    </button>
  );
}

/** 들어온 날 빠른 선택 (V4-2): 오늘 · 어제 · 3일 전 · 일주일 전 · 직접(날짜 고르기) */
export function EnteredPicker({ value, today, onChange }: { value: DateKey; today: DateKey; onChange: (d: DateKey) => void }) {
  const ago = daysBetween(value, today);
  const preset = ENTERED_CHOICES.find((c) => c.ago === ago);
  const [custom, setCustom] = useState(!preset);
  return (
    <div className="entered-picker">
      <div className="chips" style={{ padding: 0, flexWrap: 'wrap' }}>
        {ENTERED_CHOICES.map((c) => (
          <button
            key={c.ago}
            className={`chip ${!custom && preset?.ago === c.ago ? 'on' : ''}`}
            aria-pressed={!custom && preset?.ago === c.ago}
            onClick={() => {
              setCustom(false);
              onChange(addDays(today, -c.ago));
            }}
          >
            {c.label}
          </button>
        ))}
        <button className={`chip ${custom ? 'on' : ''}`} aria-pressed={custom} onClick={() => setCustom(true)}>
          직접
        </button>
      </div>
      {custom && (
        <input
          type="date"
          className="date-input"
          value={value}
          max={today}
          aria-label="들어온 날"
          onChange={(e) => e.target.value && onChange(e.target.value)}
        />
      )}
    </div>
  );
}

/** 레시피 출처 (2026-11-09): "▶ 백종원 레시피 영상 보기" — 누르면 영상(또는 레시피 글) */
export function RecipeSource({ recipe }: { recipe: { by?: string; url?: string } }) {
  if (!recipe.by) return null;
  const label = `${recipe.by} 레시피`;
  const video = recipe.url?.includes('youtube.com') || recipe.url?.includes('youtu.be');
  return recipe.url ? (
    <a className="recipe-src" href={recipe.url} target="_blank" rel="noreferrer">
      {video ? `▶ ${label} 영상 보기` : `${label} 보기 ›`}
    </a>
  ) : (
    <div className="recipe-src">{label}</div>
  );
}

/** 같이 먹을 반찬 (2026-11-09): 메인에 곁들여 남는 재료를 같이 먹는다 */
export function SideDishes({ sides, items, today }: { sides?: Recipe[]; items: Item[]; today: DateKey }) {
  if (!sides?.length) return null;
  const owned = new Set(items.map((i) => i.name));
  return (
    <div className="sides">
      <div className="sides-h">같이 먹을 반찬</div>
      {sides.map((r) => (
        <div key={r.name} className="side">
          <div className="side-nm">{r.name}</div>
          <div className="tags">
            {r.uses.map((n) => (
              <UseTag key={n} name={n} items={items} today={today} />
            ))}
            {r.buy
              .filter((n) => !owned.has(n))
              .map((n) => (
                <span key={n} className="tag buy">
                  사야 해요 · {n}
                </span>
              ))}
          </div>
          <RecipeSource recipe={r} />
        </div>
      ))}
    </div>
  );
}

/** 카카오 로그인 버튼 (카카오 디자인 가이드의 노란 버튼·말풍선 모양) */
export function KakaoButton({ onClick, label = '카카오로 로그인' }: { onClick: () => void; label?: string }) {
  return (
    <button className="kakao-btn" onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3C6.48 3 2 6.58 2 11c0 2.85 1.86 5.35 4.66 6.77-.2.74-.74 2.7-.85 3.12-.13.52.19.51.4.37.17-.11 2.63-1.79 3.7-2.52.68.1 1.38.15 2.09.15 5.52 0 10-3.58 10-8S17.52 3 12 3z" />
      </svg>
      {label}
    </button>
  );
}

/**
 * 날짜를 옆으로 밀어서 고르는 슬라이더 (2026-11-20, 사용자 요청: ±1일 버튼 대신).
 * 입고일부터 넉넉히(소비기한보다 60일 뒤까지) 하루씩. 키보드 화살표로도 하루씩 움직인다.
 */
export function DateSlider({
  label,
  hint,
  value,
  min,
  today,
  tone,
  onChange,
}: {
  label: string;
  hint: string;
  value: DateKey;
  min: DateKey;
  today: DateKey;
  tone?: 'sub';
  onChange: (date: DateKey) => void;
}) {
  const span = Math.max(120, daysBetween(min, value) + 60);
  const offset = Math.max(0, Math.min(span, daysBetween(min, value)));
  const left = daysBetween(today, value);
  return (
    <div className={`date-slider ${tone ?? ''}`}>
      <div className="ds-head">
        <span>{label}</span>
        <b>
          {formatDate(value)} · {dDayLabel(left)}
        </b>
      </div>
      <input
        type="range"
        min={0}
        max={span}
        step={1}
        value={offset}
        aria-label={`${label} 고르기`}
        aria-valuetext={`${formatDate(value)}, ${dDayLabel(left)}`}
        onChange={(e) => onChange(addDays(min, Number(e.target.value)))}
      />
      <div className="ds-hint">{hint}</div>
    </div>
  );
}
