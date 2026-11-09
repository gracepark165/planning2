// 재료 직접 추가(FR-07): 큰 분류(육류·채소 …)를 누르면 그 분류의 재료가 펼쳐지고, 여러 개 골라서 한 번에 담는다.
// 소비기한은 자동 (재료 사전 → 지난번 값 → 직접 적은 재료는 그 분류의 종류별 기본 기간).
// 재료를 누르면 바로 아래에 양(숫자 + 단위)·보관 위치를 고치는 칸이 열린다 (2026-11-04, 사용자 요청).
// 냉동을 고르면 소비기한도 냉동 기간으로 정한다.
// 제품 사진으로 넣기(2026-11-09): 포장 사진을 AI가 읽어 고른 재료로 담는다. 읽은 결과는 양 고치기 칸에서 확인받는다.

import { useEffect, useRef, useState } from 'react';
import { CATALOG, CATEGORIES, findCatalog, findKind, nameKey } from '../data';
import { LOCATIONS } from '../rules/constants';
import { defaultLocation, kindShelfDays, shelfDaysFor } from '../rules/expiry';
import { QTY_UNITS, joinQty, qtyStep, splitQty, switchUnit, toBasicUnit } from '../rules/qty';
import type { DateKey, FoodCategory, Item, Location } from '../rules/types';
import { AI_FAILURE_TEXT, readProductImage } from '../ai/client';
import { productToPicks } from '../ai/convert';
import { formatDate } from '../rules/date';
import { eul } from '../rules/josa';
import type { AddPick } from '../state/store';
import { BackButton, FoodIcon } from './parts';

interface Props {
  items: Item[];
  today: DateKey;
  onBack: () => void;
  onAdd: (picks: AddPick[]) => void;
}

interface Picked extends AddPick {
  category?: string;
  /** 제품 사진에서 읽었으면 포장에 적힌 상품명 */
  product?: string;
}

/** 고른 재료의 기본 수량: 사전 기본 수량을 ml·g·개로 (1송이 → 1개), 직접 적은 재료는 1개 */
const defaultQtyOf = (name: string) => joinQty(toBasicUnit(splitQty(findCatalog(name)?.defaultQty ?? '1개')));

/** 고른 재료의 기본 보관 위치와, 고른 위치에서의 기간(일) */
function placeOf(p: Picked): { loc: Location; days?: number; isDefault: boolean } {
  const entry = findCatalog(p.name);
  const kind = entry ? undefined : findKind(p.customKind);
  const base = entry ? defaultLocation(entry, false) : (kind?.location ?? '냉장');
  const loc = p.location ?? base;
  const days = entry ? shelfDaysFor(entry, false, loc) : kind ? kindShelfDays(kind, loc, false) : undefined;
  return { loc, days, isDefault: loc === base };
}

/** 고른 재료 아래에 열리는 양·보관 위치 고치기 칸 */
function QtyEditor({ p, onChange, onLocation, onRemove, onDone }: {
  p: Picked;
  onChange: (qty: string) => void;
  onLocation: (loc: Location) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
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
  const place = placeOf(p);

  return (
    <div className="qty-editor" ref={ref} role="group" aria-label={`${p.name} 양 고치기`}>
      <div className="qty-head">
        <span className="tile" aria-hidden="true">
          <FoodIcon entry={entry} core={entry?.core ?? ''} />
        </span>
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
        {QTY_UNITS.map((u) => (
          <button
            key={u}
            className={`chip ${u === cur.unit ? 'on' : ''}`}
            role="radio"
            aria-checked={u === cur.unit}
            // 단위를 바꾸면 그 단위의 알맞은 숫자로 (개 → 100g, g → 1개, g ↔ ml은 그대로)
            onClick={() => {
              if (u === cur.unit) return;
              const next = switchUnit(cur, u);
              set(next.n, next.unit);
            }}
          >
            {u}
          </button>
        ))}
      </div>
      <div className="qty-loc">
        <span>보관 위치</span>
        <div className="chips" style={{ padding: 0 }} role="radiogroup" aria-label="보관 위치">
          {LOCATIONS.map((l) => (
            <button key={l} className={`chip ${l === place.loc ? 'on' : ''}`} role="radio" aria-checked={l === place.loc} onClick={() => onLocation(l)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {p.expiresAt ? (
        <p className="qty-note">포장에 적힌 소비기한 {formatDate(p.expiresAt)}으로 넣을게요. 넣은 뒤에도 고칠 수 있어요.</p>
      ) : (
        place.days !== undefined && (
          <p className="qty-note">
            {place.loc === '냉동' ? '냉동 보관 기준' : '기본 기간표 기준'}으로 소비기한은 보통 {place.days}일로 정해둘게요.
          </p>
        )
      )}
      <button className="cta qty-done" onClick={onDone}>
        {joinQty(cur)} · {place.loc}에 넣을게요
      </button>
    </div>
  );
}

const matches = (q: string) => {
  const key = nameKey(q);
  return CATALOG.filter((c) => [c.name, ...(c.aliases ?? [])].some((n) => nameKey(n).includes(key)));
};

export function AddView({ items, today, onBack, onAdd }: Props) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  /** 제품 사진 읽기: 읽는 중이면 true, 끝나면 안내 문구 */
  const [photoReading, setPhotoReading] = useState(false);
  const [photoNote, setPhotoNote] = useState<{ text: string; ok: boolean } | null>(null);
  const photoRound = useRef(0);
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
  const setLocation = (name: string, location: Location) =>
    setPicked((p) => p.map((x) => (nameKey(x.name) === nameKey(name) ? { ...x, location } : x)));

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

  /** 제품 사진 → AI가 읽은 재료를 고른 재료로 담고 첫 재료의 양 고치기 칸을 연다 */
  const readPhoto = async (file: File) => {
    const my = ++photoRound.current;
    setPhotoReading(true);
    setPhotoNote(null);
    const res = await readProductImage(file, today);
    if (my !== photoRound.current) return;
    setPhotoReading(false);
    if (!res.ok) {
      const why = res.reason === 'no-key' || res.reason === 'ai-credit' || res.reason === 'ai-failed' ? '' : `${AI_FAILURE_TEXT[res.reason]}. `;
      setPhotoNote({ text: `${why}사진을 읽지 못했어요. 아래에서 직접 골라 주세요.`, ok: false });
      return;
    }
    const { picks, skipped } = productToPicks(res.data, today, findCatalog);
    if (!picks.length) {
      setPhotoNote({
        text: skipped.length
          ? `생수·음료와 실온 간편식은 냉장고에 넣지 않아요: ${skipped.join(', ')}`
          : '사진에서 식재료를 찾지 못했어요. 아래에서 직접 골라 주세요.',
        ok: false,
      });
      return;
    }
    setPicked((prev) => {
      const next = [...prev];
      for (const p of picks) {
        const i = next.findIndex((x) => nameKey(x.name) === nameKey(p.name));
        if (i >= 0) next[i] = { ...next[i], ...p };
        else next.push(p);
      }
      return next;
    });
    setEditing(picks[0].name);
    const dated = picks.filter((p) => p.expiresAt);
    setPhotoNote({
      text:
        (picks.length > 1
          ? `사진에서 ${picks.map((p) => p.name).join(', ')} ${picks.length}개를 담았어요.`
          : `사진에서 ${picks[0].name}${eul(picks[0].name)} 담았어요.`) +
        ' 양과 보관 위치를 확인해 주세요.' +
        (dated.length ? ` 소비기한은 포장에 적힌 날짜(${dated.map((p) => formatDate(p.expiresAt!)).join(', ')})로 넣어요.` : '') +
        (skipped.length ? ` 생수·음료와 실온 간편식은 냉장고에 넣지 않아요: ${skipped.join(', ')}` : ''),
      ok: true,
    });
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
        <span className="e" aria-hidden="true">
          <FoodIcon entry={c} core={c.core} />
        </span>
        {c.name}
        {own && <small>있어요</small>}
        {on && (
          <small className="cnt">
            {p.qty ?? defaultQtyOf(c.name)}
            {placeOf(p).isDefault ? '' : ` · ${placeOf(p).loc}`}
          </small>
        )}
      </button>
    );
  };

  const editingPick = editing ? picked.find((x) => nameKey(x.name) === nameKey(editing)) : undefined;
  const editor = editingPick && (
    <QtyEditor
      key={editingPick.name}
      p={editingPick}
      onChange={(qty) => setQty(editingPick.name, qty)}
      onLocation={(loc) => setLocation(editingPick.name, loc)}
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

      <label className={`sample-btn photo-btn ${photoReading ? 'busy' : ''}`}>
        📷 제품 사진으로 넣기
        <small>{photoReading ? '사진을 읽고 있어요…' : '포장을 찍어 올리면 재료와 소비기한을 읽어 담아요'}</small>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          disabled={photoReading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = ''; // 같은 사진을 다시 골라도 동작하게
            if (f) void readPhoto(f);
          }}
        />
      </label>
      {photoNote && (
        <p className={`note photo-note ${photoNote.ok ? 'ok' : ''}`} role="status">
          {photoNote.text}
        </p>
      )}

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
                  {p.customKind && !p.product ? ' (직접)' : ''} · {p.qty ?? defaultQtyOf(p.name)}
                  {p.expiresAt ? ` · ~${formatDate(p.expiresAt)}` : ''}
                  {placeOf(p).isDefault ? '' : ` · ${placeOf(p).loc}`}
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
        <button className="cta" disabled={!picked.length} onClick={() =>
            onAdd(
              picked.map(({ name, customKind, qty, location, expiresAt }) => ({
                name,
                customKind,
                qty: qty ?? defaultQtyOf(name),
                ...(location ? { location } : {}),
                ...(expiresAt ? { expiresAt } : {}),
              })),
            )
          }>
          {picked.length ? `${picked.length}개 담기` : '재료를 골라 주세요'}
        </button>
      </div>
    </>
  );
}
