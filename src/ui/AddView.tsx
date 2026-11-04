// 재료 직접 추가(FR-07): 큰 분류(육류·채소 …)를 누르면 그 분류의 재료가 펼쳐지고, 여러 개 골라서 한 번에 담는다.
// 소비기한은 자동 (재료 사전 → 지난번 값 → 직접 적은 재료는 그 분류의 종류별 기본 기간).
// 재료를 누르면 바로 아래에 양(숫자 + 단위)을 고치는 칸이 열린다 (2026-11-04, 사용자 요청).

import { useEffect, useRef, useState } from 'react';
import { CATALOG, CATEGORIES, findCatalog, nameKey } from '../data';
import { emojiOf } from '../rules/emoji';
import { joinQty, qtyStep, splitQty, unitChoices } from '../rules/qty';
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

/** 고른 재료의 기본 수량: 사전 기본 수량, 직접 적은 재료는 1개 */
const defaultQtyOf = (name: string) => findCatalog(name)?.defaultQty ?? '1개';

/** 고른 재료 아래에 열리는 양 고치기 칸 */
function QtyEditor({ p, onChange, onRemove, onDone }: {
  p: Picked;
  onChange: (qty: string) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const base = splitQty(defaultQtyOf(p.name));
  const cur = splitQty(p.qty ?? defaultQtyOf(p.name));
  const [text, setText] = useState(String(cur.n));
  useEffect(() => {
    setText(String(splitQty(p.qty ?? defaultQtyOf(p.name)).n));
    ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [p.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = qtyStep(cur.unit);
  const set = (n: number, unit = cur.unit) => {
    const v = Math.max(1, Math.round(n));
    setText(String(v));
    onChange(joinQty({ n: v, unit }));
  };
  const entry = findCatalog(p.name);

  return (
    <div className="qty-editor" ref={ref} role="group" aria-label={`${p.name} 양 고치기`}>
      <div className="qty-head">
        <span className="tile">{emojiOf(entry?.core ?? '', entry)}</span>
        <b>{p.name}</b>
        <button className="small-btn" onClick={onRemove}>
          빼기
        </button>
      </div>
      <div className="stepper" style={{ margin: '10px 0 8px' }}>
        양
        <div>
          <button aria-label={`${step} 빼기`} disabled={cur.n <= 1} onClick={() => set(cur.n - step)}>
            −
          </button>
          <input
            className="qty-num"
            type="number"
            inputMode="numeric"
            min={1}
            value={text}
            aria-label={`${p.name} 개수`}
            onChange={(e) => {
              setText(e.target.value);
              const n = Number(e.target.value);
              if (n >= 1) onChange(joinQty({ n: Math.round(n), unit: cur.unit }));
            }}
            onBlur={() => set(Number(text) >= 1 ? Number(text) : cur.n)}
            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), onDone())}
          />
          <span className="qty-unit">{cur.unit}</span>
          <button aria-label={`${step} 더하기`} onClick={() => set(cur.n + step)}>
            +
          </button>
        </div>
      </div>
      <div className="chips" style={{ padding: 0, flexWrap: 'wrap' }} role="radiogroup" aria-label="단위">
        {unitChoices(base.unit).map((u) => (
          <button
            key={u}
            className={`chip ${u === cur.unit ? 'on' : ''}`}
            role="radio"
            aria-checked={u === cur.unit}
            // 단위를 바꾸면 그 단위의 알맞은 숫자로 (g ↔ 개)
            onClick={() => set(u === base.unit ? base.n : qtyStep(u) === step ? cur.n : qtyStep(u) === 1 ? 1 : 100, u)}
          >
            {u}
          </button>
        ))}
      </div>
      <button className="cta qty-done" onClick={onDone}>
        {joinQty(cur)}로 할게요
      </button>
    </div>
  );
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
  /** 양 고치기 칸이 열린 재료 이름 */
  const [editing, setEditing] = useState<string | null>(null);
  const owned = new Set(items.map((i) => nameKey(i.name)));
  const isPicked = (name: string) => picked.some((p) => nameKey(p.name) === nameKey(name));

  const remove = (name: string) => {
    setPicked((p) => p.filter((x) => nameKey(x.name) !== nameKey(name)));
    setEditing((e) => (e && nameKey(e) === nameKey(name) ? null : e));
  };

  /** 재료 누르기: 안 고른 재료는 담고 양 고치기 칸을 연다. 고른 재료는 칸을 열고 닫는다. */
  const tap = (name: string, category?: string) => {
    if (!isPicked(name)) {
      setPicked((p) => [...p, { name, category }]);
      setEditing(name);
    } else {
      setEditing((e) => (e && nameKey(e) === nameKey(name) ? null : name));
    }
  };

  const setQty = (name: string, qty: string) =>
    setPicked((p) => p.map((x) => (nameKey(x.name) === nameKey(name) ? { ...x, qty } : x)));

  /** 목록에 없는 재료: 이름 + 분류 (사전에 있는 이름이면 사전 재료로) */
  const addCustom = (raw: string, cat: FoodCategory) => {
    const name = raw.trim();
    if (!name) return;
    const inCatalog = matches(name).find((c) => nameKey(c.name) === nameKey(name));
    if (!isPicked(inCatalog?.name ?? name)) {
      setPicked((p) => [...p, inCatalog ? { name: inCatalog.name, category: inCatalog.category } : { name, customKind: cat.customKind, category: cat.id }]);
    }
    setEditing(inCatalog?.name ?? name);
    setCustom('');
    setQuery('');
  };

  const tile = (c: (typeof CATALOG)[number]) => {
    const own = owned.has(nameKey(c.name));
    const p = picked.find((x) => nameKey(x.name) === nameKey(c.name));
    const on = !!p;
    return (
      <button
        key={c.name}
        className={`gi ${on ? 'on' : ''} ${editing && nameKey(editing) === nameKey(c.name) ? 'editing' : ''}`}
        disabled={own}
        aria-pressed={on}
        onClick={() => tap(c.name, c.category)}
      >
        <span className="e">{emojiOf(c.core, c)}</span>
        {c.name}
        {own && <small>있어요</small>}
        {on && <small className="cnt">{p.qty ?? c.defaultQty ?? '1개'}</small>}
      </button>
    );
  };

  const editingPick = editing ? picked.find((x) => nameKey(x.name) === nameKey(editing)) : undefined;
  const editor = editingPick && (
    <QtyEditor
      key={editingPick.name}
      p={editingPick}
      onChange={(qty) => setQty(editingPick.name, qty)}
      onRemove={() => remove(editingPick.name)}
      onDone={() => setEditing(null)}
    />
  );

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
          {editor}
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
              {editor}
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
            <>
              <p className="note" style={{ textAlign: 'center' }}>
                분류를 누르면 재료가 나와요. 여러 분류에서 골라도 돼요.
              </p>
              {editor}
            </>
          )}
        </>
      )}

      {picked.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="eyebrow">고른 재료 {picked.length}개</div>
          <div className="chips" style={{ padding: 0, flexWrap: 'wrap' }}>
            {picked.map((p) => (
              <span key={p.name} className="chip on picked-chip">
                <button onClick={() => setEditing(p.name)} aria-label={`${p.name} 양 고치기`}>
                  {p.name}
                  {p.customKind ? ' (직접)' : ''} · {p.qty ?? defaultQtyOf(p.name)}
                </button>
                <button onClick={() => remove(p.name)} aria-label={`${p.name} 빼기`}>
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="ctas">
        <button className="cta ghost" onClick={onBack}>
          나중에 할게요
        </button>
        <button className="cta" disabled={!picked.length} onClick={() => onAdd(picked.map(({ name, customKind, qty }) => ({ name, customKind, ...(qty ? { qty } : {}) })))}>
          {picked.length ? `${picked.length}개 담기` : '재료를 골라 주세요'}
        </button>
      </div>
    </>
  );
}
