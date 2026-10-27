// 재료 직접 추가(FR-07): 카탈로그 타일에서 고르기 → 소비기한 자동

import { useState } from 'react';
import { PICKER_CATALOG } from '../data';
import type { Item } from '../rules/types';
import { BackButton } from './parts';

interface Props {
  items: Item[];
  onBack: () => void;
  onAdd: (names: string[]) => void;
}

export function AddView({ items, onBack, onAdd }: Props) {
  const [picked, setPicked] = useState<string[]>([]);
  const owned = new Set(items.map((i) => i.name));
  const toggle = (name: string) =>
    setPicked((p) => (p.includes(name) ? p.filter((n) => n !== name) : [...p, name]));

  return (
    <>
      <BackButton onClick={onBack} />
      <h1>
        지금 냉장고에
        <br />
        어떤 재료들이 있나요?
      </h1>
      <p className="lead">고르기만 하세요. 소비기한은 자동으로 정해둘게요.</p>
      <div className="grid">
        {PICKER_CATALOG.map((c) => {
          const own = owned.has(c.name);
          const on = picked.includes(c.name);
          return (
            <button
              key={c.name}
              className={`gi ${on ? 'on' : ''}`}
              disabled={own}
              aria-pressed={on}
              onClick={() => toggle(c.name)}
            >
              <span className="e">{c.emoji}</span>
              {c.name}
              {own && <small>있어요</small>}
            </button>
          );
        })}
      </div>
      <div className="ctas">
        <button className="cta ghost" onClick={onBack}>
          나중에 할게요
        </button>
        <button className="cta" disabled={!picked.length} onClick={() => onAdd(picked)}>
          {picked.length ? `${picked.length}개 담기` : '재료를 골라 주세요'}
        </button>
      </div>
    </>
  );
}
