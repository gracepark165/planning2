// 여러 화면에서 같이 쓰는 작은 조각들

import { findCatalog } from '../data';
import { STATE_META } from '../rules/constants';
import { emojiOf } from '../rules/emoji';
import type { Core, ItemState } from '../rules/types';

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

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="back" onClick={onClick} aria-label="뒤로가기">
      ‹
    </button>
  );
}
