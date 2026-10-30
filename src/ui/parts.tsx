// 여러 화면에서 같이 쓰는 작은 조각들

import { findCatalog } from '../data';
import { STATE_META } from '../rules/constants';
import { emojiOf } from '../rules/emoji';
import { findItem } from '../rules/plan';
import { dDayLabel, daysLeft, stateOf } from '../rules/status';
import type { Core, DateKey, Item, ItemState } from '../rules/types';

export function Tile({ name, core }: { name: string; core: Core }) {
  return (
    <span className="tile" aria-hidden="true">
      {emojiOf(core, findCatalog(name))}
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
