// 재료 직접 추가(FR-07): 큰 분류(육류·채소 …)를 누르면 그 분류의 재료가 펼쳐지고, 여러 개 골라서 한 번에 담는다.
// 소비기한은 자동 (재료 사전 → 지난번 값 → 직접 적은 재료는 그 분류의 종류별 기본 기간).

import { useState } from 'react';
import { CATALOG, CATEGORIES, nameKey } from '../data';
import { emojiOf } from '../rules/emoji';
import type { FoodCategory, Item } from '../rules/types';
import type { AddPick } from '../state/store';
import { BackButton } from './parts';

interface Props {
  items: Item[];
  onBack: () => void;
  onAdd: (picks: AddPick[]) => void;
}

interface Picked extends AddPick {
  category?: string;
}

const matches = (q: string) => {
  const key = nameKey(q);
  return CATALOG.filter((c) => [c.name, ...(c.aliases ?? [])].some((n) => nameKey(n).includes(key)));
};

export function AddView({ items, onBack, onAdd }: Props) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState('');
  const owned = new Set(items.map((i) => nameKey(i.name)));
  const isPicked = (name: string) => picked.some((p) => nameKey(p.name) === nameKey(name));

  const toggle = (name: string, category?: string) =>
    setPicked((p) => (isPicked(name) ? p.filter((x) => nameKey(x.name) !== nameKey(name)) : [...p, { name, category }]));

  /** 목록에 없는 재료: 이름 + 분류 (사전에 있는 이름이면 사전 재료로) */
  const addCustom = (raw: string, cat: FoodCategory) => {
    const name = raw.trim();
    if (!name) return;
    const inCatalog = matches(name).find((c) => nameKey(c.name) === nameKey(name));
    if (!isPicked(inCatalog?.name ?? name)) {
      setPicked((p) => [...p, inCatalog ? { name: inCatalog.name, category: inCatalog.category } : { name, customKind: cat.customKind, category: cat.id }]);
    }
    setCustom('');
    setQuery('');
  };

  const tile = (c: (typeof CATALOG)[number]) => {
    const own = owned.has(nameKey(c.name));
    const on = isPicked(c.name);
    return (
      <button key={c.name} className={`gi ${on ? 'on' : ''}`} disabled={own} aria-pressed={on} onClick={() => toggle(c.name, c.category)}>
        <span className="e">{emojiOf(c.core, c)}</span>
        {c.name}
        {own && <small>있어요</small>}
      </button>
    );
  };

  const q = query.trim();
  const found = q ? matches(q) : [];
  const exact = found.some((c) => nameKey(c.name) === nameKey(q));
  const openCat = CATEGORIES.find((c) => c.id === open);
  const countIn = (id: string) => picked.filter((p) => p.category === id).length;

  return (
    <>
      <BackButton onClick={onBack} />
      <h1>
        냉장고에 어떤
        <br />
        재료들이 있나요?
      </h1>
      <p className="lead">분류를 누르고 고르기만 하세요. 소비기한은 자동으로 정해둘게요.</p>

      <input
        type="search"
        placeholder="🔍 재료 이름 찾기"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
        aria-label="재료 이름 찾기"
      />

      {q ? (
        <>
          {found.length > 0 && <div className="grid">{found.map(tile)}</div>}
          {!exact && (
            <div className="card" style={{ marginTop: 12 }}>
              <h3>‘{q}’ 직접 넣기</h3>
              <p>목록에 없으면 분류를 골라 주세요. 그 분류의 기본 기간으로 소비기한을 정해요.</p>
              <div className="chips" style={{ padding: 0, flexWrap: 'wrap' }}>
                {CATEGORIES.map((c) => (
                  <button key={c.id} className="chip" onClick={() => addCustom(q, c)}>
                    {c.emoji} {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid cats">
            {CATEGORIES.map((c) => {
              const n = countIn(c.id);
              return (
                <button
                  key={c.id}
                  className={`gi ${open === c.id ? 'on' : ''}`}
                  aria-expanded={open === c.id}
                  onClick={() => setOpen(open === c.id ? null : c.id)}
                >
                  <span className="e">{c.emoji}</span>
                  {c.label}
                  {n > 0 && <small className="cnt">{n}개 골랐어요</small>}
                </button>
              );
            })}
          </div>

          {openCat ? (
            <section aria-label={openCat.label}>
              <div className="eyebrow" style={{ marginTop: 20 }}>
                {openCat.emoji} {openCat.label}
              </div>
              <div className="grid">{CATALOG.filter((c) => c.category === openCat.id).map(tile)}</div>
              <div className="name-input" style={{ marginTop: 12 }}>
                <input
                  type="text"
                  placeholder={`목록에 없는 ${openCat.label} 직접 적기`}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCustom(custom, openCat)}
                  autoComplete="off"
                  aria-label={`목록에 없는 ${openCat.label} 이름`}
                />
                <button className="small-btn" disabled={!custom.trim()} onClick={() => addCustom(custom, openCat)}>
                  넣기
                </button>
              </div>
            </section>
          ) : (
            <p className="note" style={{ textAlign: 'center' }}>
              분류를 누르면 재료가 나와요. 여러 분류에서 골라도 돼요.
            </p>
          )}
        </>
      )}

      {picked.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="eyebrow">고른 재료 {picked.length}개</div>
          <div className="chips" style={{ padding: 0, flexWrap: 'wrap' }}>
            {picked.map((p) => (
              <button key={p.name} className="chip on" onClick={() => toggle(p.name)} aria-label={`${p.name} 빼기`}>
                {p.name}
                {p.customKind ? ' (직접)' : ''} ✕
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="ctas">
        <button className="cta ghost" onClick={onBack}>
          나중에 할게요
        </button>
        <button className="cta" disabled={!picked.length} onClick={() => onAdd(picked.map(({ name, customKind }) => ({ name, customKind })))}>
          {picked.length ? `${picked.length}개 담기` : '재료를 골라 주세요'}
        </button>
      </div>
    </>
  );
}
