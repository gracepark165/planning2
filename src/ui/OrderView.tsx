// 장보기 올리기 (FR-09/17): (가) 주문 화면 올리기(AI 연결 전까지 예시 결과) / (나) 글로 입력해서 올리기(규칙 읽기)

import { useEffect, useState } from 'react';
import { CATALOG, ORDER_EXAMPLE_ITEMS, RETAILERS, findCatalog } from '../data';
import { addDays, formatMonthDay } from '../rules/date';
import { autoExpiresAt, checkinDate, defaultLocation } from '../rules/expiry';
import { parseTextInput } from '../rules/textInput';
import type { DateKey, Item } from '../rules/types';
import { draftFromParsed, draftToItem, type DraftRow } from '../state/textDraft';
import { newId } from './id';
import { BackButton, Tile } from './parts';
import { TextConfirm } from './TextConfirm';

type Step = 'start' | 'text' | 'loading' | 'capture';

interface Props {
  today: DateKey;
  onAdd: (items: Item[]) => void;
  onPickCatalog: () => void;
}

const PLACEHOLDER = '예) 닭가슴살 세봉지 소분, 우유 2개\n대파 소분 한봉지';

export function OrderView({ today, onAdd, onPickCatalog }: Props) {
  const [step, setStep] = useState<Step>('start');
  const [text, setText] = useState('');
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [retailer, setRetailer] = useState(RETAILERS[0].name);
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    if (step !== 'loading') return;
    const t = window.setTimeout(() => setStep('capture'), 1200);
    return () => window.clearTimeout(t);
  }, [step]);

  const readText = () => {
    setRows(parseTextInput(text, CATALOG).map((l) => draftFromParsed(l, newId(), today, findCatalog)));
    setStep('text');
    window.scrollTo(0, 0);
  };

  const startCapture = (file?: File) => {
    setThumb(null);
    if (file) {
      const rd = new FileReader();
      rd.onload = () => setThumb(String(rd.result));
      rd.readAsDataURL(file);
    }
    setStep('loading');
  };

  if (step === 'text') {
    return (
      <TextConfirm
        rows={rows}
        today={today}
        onChange={setRows}
        onBack={() => setStep('start')}
        onSubmit={() => {
          onAdd(rows.map((r) => draftToItem(r, today, newId(), findCatalog)));
          setText('');
          setRows([]);
          setStep('start');
        }}
      />
    );
  }

  if (step === 'loading') {
    return (
      <div className="pulse">
        <div className="spin" />
        <b style={{ color: 'var(--fg)', fontSize: 18 }}>주문 내역을 읽고 있어요</b>
        <span>상품과 소비기한을 정리하는 중이에요</span>
      </div>
    );
  }

  if (step === 'capture') {
    const r = RETAILERS.find((x) => x.name === retailer)!;
    // 예시: 이틀 전 주문. 어느 마트를 골라도 입고일이 오늘보다 늦지 않게 (이미 받은 주문을 올리는 것이므로)
    const orderDate = addDays(today, -Math.max(...RETAILERS.map((x) => x.checkinDays)));
    const inDate = checkinDate(orderDate, r);
    return (
      <>
        <BackButton onClick={() => setStep('start')} />
        <h1>{ORDER_EXAMPLE_ITEMS.length}개를 찾았어요</h1>
        <p className="lead">소비기한은 자동으로 정해뒀어요. 나중에 언제든 고칠 수 있어요.</p>
        {thumb && <img className="thumb" src={thumb} alt="올린 주문 화면" />}
        <div className="eyebrow">어디서 주문했나요?</div>
        <div className="seg">
          {RETAILERS.map((x) => (
            <button key={x.name} className={retailer === x.name ? 'on' : ''} onClick={() => setRetailer(x.name)}>
              {x.name}
            </button>
          ))}
        </div>
        <p className="note" style={{ marginTop: 6 }}>
          {r.description}
          <br />
          {formatMonthDay(orderDate)} 주문 → <b>{formatMonthDay(inDate)}</b>에 냉장고에 들어온 걸로 계산해요.
        </p>
        <div style={{ marginTop: 8 }}>
          {ORDER_EXAMPLE_ITEMS.map((i) => (
            <div key={i.name} className="row">
              <Tile name={i.name} core={i.core} />
              <div className="main">
                <div className="nm">{i.name}</div>
                <div className="meta">
                  {i.qty} ·{' '}
                  {i.confident
                    ? `소비기한 ${i.shelfDays}일 뒤까지 (표기에서 읽음)`
                    : `소비기한을 못 읽어서 ${i.shelfDays}일로 자동 설정`}
                </div>
              </div>
              <span className={`badge ${i.confident ? 'b-ok' : 'b-info'}`}>{i.confident ? '읽었어요' : '자동 설정'}</span>
            </div>
          ))}
        </div>
        <button
          className="cta"
          onClick={() => {
            onAdd(
              ORDER_EXAMPLE_ITEMS.map((i) => {
                const entry = findCatalog(i.name);
                return {
                  id: newId(),
                  name: i.name,
                  qty: i.qty,
                  core: i.core,
                  location: defaultLocation(entry, false),
                  enteredAt: inDate,
                  expiresAt: i.confident ? addDays(inDate, i.shelfDays) : (autoExpiresAt(inDate, entry, false) ?? addDays(inDate, i.shelfDays)),
                  expiryBasis: i.confident ? 'label' : 'table',
                  remaining: '넉넉해요',
                  source: 'order',
                  portioned: false,
                };
              }),
            );
            setStep('start');
          }}
        >
          냉장고에 넣을게요
        </button>
      </>
    );
  }

  return (
    <>
      <h1>장 본 재료를 올려주세요</h1>
      <p className="lead">주문 화면을 올리거나 글로 적어 주세요. 재료와 소비기한은 알아서 정리해요.</p>

      <div className="eyebrow" style={{ marginTop: 0 }}>
        주문 화면(캡처) 올리기
      </div>
      <label className="drop" style={{ display: 'block', cursor: 'pointer', marginTop: 8 }}>
        컬리, B마트, 쿠팡 주문 내역 사진을 눌러서 고르세요
        <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && startCapture(e.target.files[0])} />
      </label>
      <button className="sample-btn" onClick={() => startCapture()}>
        예시 주문 화면으로 해볼게요<small>실제 인식 없이 정해진 결과가 나와요</small>
      </button>

      <div className="eyebrow" style={{ marginTop: 28 }}>
        글로 입력해서 올리기
      </div>
      <textarea
        className="text-input"
        rows={4}
        placeholder={PLACEHOLDER}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="장 본 재료를 글로 입력"
      />
      <button className="cta" style={{ marginTop: 8 }} disabled={!text.trim()} onClick={readText}>
        읽어볼게요
      </button>
      <p className="note">
        쉼표나 줄바꿈으로 나눠 적어요. “소분”이라고 쓰면 나눠 둔 재료로 넣고, 한 끼에 하나씩 써요. 읽은 결과는 넣기 전에 한 번
        보여드려요.
      </p>

      <button className="sample-btn" style={{ marginTop: 20 }} onClick={onPickCatalog}>
        재료를 직접 골라서 담을게요<small>사진 없이 고르기만 하면 돼요</small>
      </button>
      <p className="note">사진 인식은 AI를 붙이기 전이라, 어떤 사진을 올려도 같은 예시 결과가 나와요.</p>
    </>
  );
}
