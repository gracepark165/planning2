// 여러 화면에서 같이 쓰는 작은 조각들

import { useState } from 'react';
import { findCatalog } from '../data';
import { ENTERED_CHOICES, STATE_META } from '../rules/constants';
import { addDays, daysBetween } from '../rules/date';
import { emojiOf, imageOf } from '../rules/emoji';
import { findItem } from '../rules/plan';
import { dDayLabel, daysLeft, stateOf } from '../rules/status';
import type { CatalogEntry, Core, DateKey, Item, ItemState, Recipe } from '../rules/types';

/** 재료 그림: 사전에 그림이 있으면 그림, 없으면 이모지 */
export function FoodIcon({ entry, core }: { entry: CatalogEntry | undefined; core: Core }) {
  const src = imageOf(entry);
  if (src) return <img className="food-img" src={src} alt="" width={256} height={256} loading="lazy" decoding="async" draggable={false} />;
  return <>{emojiOf(core, entry)}</>;
}

/** 재료 그림 타일. stack이면 같은 재료가 여러 개라는 뜻으로 테두리를 두 겹으로 */
export function Tile({ name, core, stack = false }: { name: string; core: Core; stack?: boolean }) {
  return (
    <span className={`tile${stack ? ' stack' : ''}`} aria-hidden="true">
      <FoodIcon entry={findCatalog(name)} core={core} />
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
