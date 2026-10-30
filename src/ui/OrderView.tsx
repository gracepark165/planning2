// 장보기 올리기 (FR-09/17)
// (가) 주문 화면 올리기: AI가 읽어서 확인 화면으로. AI 연결 전이거나 실패하면 예시 결과.
// (나) 글로 입력해서 올리기: 규칙으로 읽고, 규칙이 못 읽은 줄만 AI가 보완 (AI가 없으면 그대로).

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { AI_FAILURE_TEXT, readOrderImage, readTextLines, type AiFailure } from '../ai/client';
import { mergeTextAi, needsAiHelp, orderDateOf, orderToDrafts, retailerOf } from '../ai/convert';
import { CATALOG, ORDER_EXAMPLE_ITEMS, RETAILERS, findCatalog } from '../data';
import { addDays, formatDate } from '../rules/date';
import { autoExpiresAt, checkinDate, defaultLocation } from '../rules/expiry';
import { parseTextInput } from '../rules/textInput';
import type { DateKey, Item } from '../rules/types';
import { withMyFoods, type MyFoods } from '../state/myFoods';
import { draftFromParsed, draftToItem, setDraftEnteredAt, type DraftRow } from '../state/textDraft';
import { newId } from './id';
import { BackButton, Tile } from './parts';
import { TextConfirm } from './TextConfirm';

// loading/capture = 예시 결과, aiReading/aiConfirm = AI가 읽은 주문 화면, textReading = 글 입력 AI 보완 중
type Step = 'start' | 'text' | 'textReading' | 'loading' | 'capture' | 'aiReading' | 'aiConfirm';

interface Props {
  today: DateKey;
  /** 지난번에 넣은 내 재료 (사전에 없는 재료의 기간·보관 위치를 자동으로 채움) */
  myFoods: MyFoods;
  onAdd: (items: Item[]) => void;
  onPickCatalog: () => void;
  /** 글 입력칸에 미리 채울 글 (장보기 목록의 "샀어요 → 냉장고에 넣기") */
  initialText?: string;
}

const PLACEHOLDER = '예) 닭가슴살 세봉지 소분, 우유 2개\n대파 소분 한봉지';

export function OrderView({ today, myFoods, onAdd, onPickCatalog, initialText = '' }: Props) {
  /** 재료 사전 → 지난번 값 순으로 찾는다 */
  const lookup = useMemo(() => withMyFoods(findCatalog, myFoods), [myFoods]);
  const myNames = useMemo(() => Object.values(myFoods).map((m) => m.name), [myFoods]);
  const [step, setStep] = useState<Step>('start');
  const [text, setText] = useState(initialText);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [retailer, setRetailer] = useState(RETAILERS[0].name);
  const [thumb, setThumb] = useState<string | null>(null);
  /** 예시 결과를 보여주는 이유 (AI 실패 등). 없으면 사용자가 예시를 고른 것 */
  const [exampleWhy, setExampleWhy] = useState<string | null>(null);
  /** AI가 읽은 주문일 (없으면 오늘 주문으로 봄) */
  const [orderDate, setOrderDate] = useState<DateKey>(today);
  /** 기다리는 중에 뒤로 가면 늦게 온 결과는 버린다 */
  const round = useRef(0);

  useEffect(() => {
    if (step !== 'loading') return;
    const t = window.setTimeout(() => setStep('capture'), 1200);
    return () => window.clearTimeout(t);
  }, [step]);

  const back = () => {
    round.current++;
    setStep('start');
  };

  const readText = async () => {
    const parsed = parseTextInput(text, CATALOG).map((l) => draftFromParsed(l, newId(), today, lookup));
    const targets = parsed.filter(needsAiHelp);
    window.scrollTo(0, 0);
    if (!targets.length) {
      setRows(parsed);
      setStep('text');
      return;
    }
    const my = ++round.current;
    setStep('textReading');
    const res = await readTextLines(targets.map((r) => r.raw), myNames);
    if (my !== round.current) return;
    // AI가 없거나 실패해도 규칙으로 읽은 결과는 그대로 보여준다
    setRows(res.ok ? mergeTextAi(parsed, targets.map((r) => r.key), res.data, today, lookup) : parsed);
    setStep('text');
  };

  const showExample = (why: string | null) => {
    setExampleWhy(why);
    setStep('loading');
  };

  const startCapture = async (file?: File) => {
    setThumb(null);
    window.scrollTo(0, 0);
    if (!file) {
      showExample(null);
      return;
    }
    const rd = new FileReader();
    rd.onload = () => setThumb(String(rd.result));
    rd.readAsDataURL(file);

    const my = ++round.current;
    setStep('aiReading');
    const res = await readOrderImage(file, today, myNames);
    if (my !== round.current) return;
    if (!res.ok) {
      showExample(captureFailText(res.reason));
      return;
    }
    const r = retailerOf(res.data, RETAILERS) ?? RETAILERS.find((x) => x.name === retailer)!;
    const od = orderDateOf(res.data, today) ?? today;
    const drafts = orderToDrafts(res.data, checkinDate(od, r), today, newId, lookup);
    if (!drafts.length) {
      showExample('주문 화면에서 식재료를 찾지 못했어요. 아래는 예시 결과예요. 글로 입력해도 돼요.');
      return;
    }
    setRetailer(r.name);
    setOrderDate(od);
    setRows(drafts);
    setStep('aiConfirm');
  };

  /** 주문 화면에서 마트를 바꾸면 입고일이 바뀐다 */
  const pickRetailer = (name: string) => {
    setRetailer(name);
    const r = RETAILERS.find((x) => x.name === name)!;
    const inDate = checkinDate(orderDate, r);
    setRows((rs) => rs.map((row) => setDraftEnteredAt(row, inDate, lookup)));
  };

  const submitRows = () => {
    onAdd(rows.map((r) => draftToItem(r, today, newId(), lookup)));
    setText('');
    setRows([]);
    setStep('start');
  };

  const retailerPicker = (inDate: DateKey, od: DateKey, onPick: (name: string) => void): ReactNode => {
    const r = RETAILERS.find((x) => x.name === retailer)!;
    return (
      <>
        <div className="eyebrow">어디서 주문했나요?</div>
        <div className="seg wrap">
          {RETAILERS.map((x) => (
            <button key={x.name} className={retailer === x.name ? 'on' : ''} onClick={() => onPick(x.name)}>
              {x.name}
            </button>
          ))}
        </div>
        <p className="note" style={{ marginTop: 6 }}>
          {r.description}
          <br />
          {formatDate(od)} {r.name === '오프라인 마트' ? '구매' : '주문'} → <b>{formatDate(inDate)}</b>에 냉장고에 들어온 걸로 계산해요.
        </p>
      </>
    );
  };

  if (step === 'text') {
    return <TextConfirm lookup={lookup} rows={rows} today={today} onChange={setRows} onBack={back} onSubmit={submitRows} />;
  }

  if (step === 'aiConfirm') {
    const inDate = checkinDate(orderDate, RETAILERS.find((x) => x.name === retailer)!);
    return (
      <TextConfirm
        lookup={lookup}
        rows={rows}
        today={today}
        onChange={setRows}
        onBack={back}
        onSubmit={submitRows}
        title={`${rows.length}개를 찾았어요`}
        header={
          <>
            {thumb && <img className="thumb" src={thumb} alt="올린 주문 화면" />}
            {retailerPicker(inDate, orderDate, pickRetailer)}
          </>
        }
        footnote="AI가 주문 화면을 읽은 결과예요. 화면에 소비기한이 적혀 있으면 그 날짜를, 없으면 입고일 + 기본 기간표(임시)를 썼어요. 사전에 없는 재료는 AI가 고른 종류의 기본 기간(임시)이나 지난번에 정한 값을 써요. 넣은 뒤에도 냉장고에서 고칠 수 있어요."
      />
    );
  }

  if (step === 'loading' || step === 'aiReading' || step === 'textReading') {
    return (
      <div className="pulse">
        <div className="spin" />
        <b style={{ color: 'var(--fg)', fontSize: 18 }}>
          {step === 'textReading' ? '헷갈린 줄을 다시 읽고 있어요' : '주문 내역을 읽고 있어요'}
        </b>
        <span>{step === 'textReading' ? '규칙으로 못 읽은 줄만 AI가 봐요' : '상품과 소비기한을 정리하는 중이에요'}</span>
        {step !== 'loading' && (
          <button className="cta ghost" style={{ marginTop: 16 }} onClick={back}>
            그만두기
          </button>
        )}
      </div>
    );
  }

  if (step === 'capture') {
    const r = RETAILERS.find((x) => x.name === retailer)!;
    // 예시: 이틀 전 주문. 어느 마트를 골라도 입고일이 오늘보다 늦지 않게 (이미 받은 주문을 올리는 것이므로)
    const exampleOrderDate = addDays(today, -Math.max(...RETAILERS.map((x) => x.checkinDays)));
    const inDate = checkinDate(exampleOrderDate, r);
    return (
      <>
        <BackButton onClick={back} />
        <h1>{ORDER_EXAMPLE_ITEMS.length}개를 찾았어요</h1>
        <p className="lead">소비기한은 자동으로 정해뒀어요. 나중에 언제든 고칠 수 있어요.</p>
        <p className="example-why">{exampleWhy ?? '예시 주문 화면의 결과예요.'}</p>
        {thumb && <img className="thumb" src={thumb} alt="올린 주문 화면" />}
        {retailerPicker(inDate, exampleOrderDate, setRetailer)}
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
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = ''; // 같은 사진을 다시 골라도 동작하게
            if (f) void startCapture(f);
          }}
        />
      </label>
      <button className="sample-btn" onClick={() => void startCapture()}>
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
      <button className="cta" style={{ marginTop: 8 }} disabled={!text.trim()} onClick={() => void readText()}>
        읽어볼게요
      </button>
      <p className="note">
        쉼표나 줄바꿈으로 나눠 적어요. “소분”이라고 쓰면 나눠 둔 재료로 넣고, 한 끼에 하나씩 써요. 읽은 결과는 넣기 전에 한 번
        보여드려요.
      </p>

      <button className="sample-btn" style={{ marginTop: 20 }} onClick={onPickCatalog}>
        재료를 직접 골라서 담을게요<small>사진 없이 고르기만 하면 돼요</small>
      </button>
      <p className="note">사진은 AI가 읽어요. AI를 쓸 수 없을 때는 예시 결과를 보여드려요.</p>
    </>
  );
}

/** 사진을 못 읽었을 때 예시 결과 위에 보여줄 문구 */
function captureFailText(reason: AiFailure): string {
  const tail = ' 아래는 예시 결과예요. 글로 입력해도 돼요.';
  if (reason === 'no-key') return `AI 연결 전이라 사진을 읽을 수 없어요.${tail}`;
  return `${AI_FAILURE_TEXT[reason]}.${tail}`;
}
