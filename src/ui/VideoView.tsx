// 영상 확인(FR-29/30): 링크 → 메뉴·재료 읽기(AI, 예시 링크는 예시 결과) → 확인 → 냉장고와 비교·대체 제안
// AI는 영상을 보지 못하고 제목·설명란을 읽는다. 못 읽으면 직접 입력(FR-30).

import { useEffect, useRef, useState } from 'react';
import { youtubeIdOf } from '../../api/read';
import { AI_FAILURE_TEXT, readVideo } from '../ai/client';
import { videoMenusOf, type VideoMenu } from '../ai/convert';
import { PLAN_RECIPES, SUBSTITUTES, VIDEO_EXAMPLES } from '../data';
import { ro } from '../rules/josa';
import { pantryNames } from '../rules/plan';
import { dDayLabel, daysLeft, stateOf } from '../rules/status';
import type { DateKey, Item, PinnedMeal } from '../rules/types';
import {
  checkIngredients,
  splitManualIngredients,
  subQuestion,
  subReason,
  videoHeadline,
  videoMealOf,
  type VideoChoices,
} from '../rules/videoCheck';
import { newId } from './id';
import { BackButton, StateBadge, Tile } from './parts';

/** 영상 메뉴에서 빼지 않는 상비 재료 (레시피 표에서 상비 재료로만 쓰는 재료) */
const PANTRY = pantryNames(PLAN_RECIPES);
const NO_CHOICES: VideoChoices = { subs: {}, skipBuy: [] };

interface Recipe extends VideoMenu {
  /** AI가 읽은 결과인지 (아니면 예시·직접 입력) */
  fromAi?: boolean;
  /** 설명란에 재료가 없어서 메뉴 이름으로 짐작했는지 */
  guessed?: boolean;
}

// loading = 예시 읽는 척, reading = AI가 읽는 중, pick = 메뉴가 여러 개
type Step = 'input' | 'loading' | 'reading' | 'pick' | 'confirm' | 'result' | 'unknown' | 'manual';

interface Props {
  items: Item[];
  today: DateKey;
  /** 결과 화면의 "이번 주 플랜에 넣을게요"(week) / "오늘 한 끼로 할게요"(today) */
  onPin: (meal: PinnedMeal, mode: 'week' | 'today') => void;
}

export function VideoView({ items, today, onPin }: Props) {
  const [step, setStep] = useState<Step>('input');
  const [url, setUrl] = useState('');
  /** 확인 중인 영상 링크 (결과 화면에서는 입력칸을 비우므로 따로 기억) */
  const [sourceUrl, setSourceUrl] = useState('');
  /** 결과 화면에서 고른 것: 대체할지/살지, 장보기 목록에 담지 않을 재료 */
  const [choices, setChoices] = useState<VideoChoices>(NO_CHOICES);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [manualTitle, setManualTitle] = useState('');
  const [manualIngredients, setManualIngredients] = useState('');
  const [manualError, setManualError] = useState('');
  /** 못 읽은 이유 (없으면 AI 연결 전) */
  const [failText, setFailText] = useState<string | null>(null);
  const [menus, setMenus] = useState<Recipe[]>([]);
  const round = useRef(0);

  useEffect(() => {
    if (step !== 'loading') return;
    const t = window.setTimeout(() => setStep('confirm'), 1100);
    return () => window.clearTimeout(t);
  }, [step]);

  // 재료 확인까지 끝났으면 링크는 지운다 (다음 영상을 바로 붙여 넣게). 못 읽었을 때는 고쳐서 다시 하게 남겨 둔다.
  useEffect(() => {
    if (step === 'result') setUrl('');
  }, [step]);

  const reset = () => {
    round.current++;
    setStep('input');
    setRecipe(null);
    setChoices(NO_CHOICES);
    setSourceUrl('');
    window.scrollTo(0, 0);
  };

  const readExample = (id: string) => {
    const v = VIDEO_EXAMPLES.find((x) => x.id === id)!;
    setUrl(v.url);
    setSourceUrl(v.url);
    setChoices(NO_CHOICES);
    setRecipe({ title: v.title, names: v.ingredients.map((i) => i.name), skipped: v.skipped });
    setStep('loading');
  };

  const fail = (text: string | null) => {
    setFailText(text);
    setStep('unknown');
  };

  const check = async () => {
    const v = VIDEO_EXAMPLES.find((x) => x.url === url.trim());
    if (v) {
      readExample(v.id);
      return;
    }
    if (!youtubeIdOf(url)) {
      fail(AI_FAILURE_TEXT['not-youtube']);
      return;
    }
    const my = ++round.current;
    setSourceUrl(url.trim());
    setChoices(NO_CHOICES);
    setStep('reading');
    const res = await readVideo(url.trim());
    if (my !== round.current) return;
    if (!res.ok) {
      fail(res.reason === 'no-key' ? null : AI_FAILURE_TEXT[res.reason]);
      return;
    }
    const found: Recipe[] = videoMenusOf(res.data, SUBSTITUTES).map((m) => ({
      ...m,
      fromAi: true,
      guessed: res.data.basis === 'title',
    }));
    if (!found.length) {
      setManualTitle(res.data.videoTitle.slice(0, 40));
      fail('영상 제목과 설명란에서 재료를 찾지 못했어요. 메뉴와 재료를 직접 적어 주세요.');
      return;
    }
    if (found.length === 1) {
      setRecipe(found[0]);
      setStep('confirm');
    } else {
      setMenus(found);
      setStep('pick');
    }
  };

  /** "아니에요": AI 결과는 고칠 수 있게 직접 입력 화면에 채워 준다 */
  const notThis = (r: Recipe) => {
    if (!r.fromAi) {
      reset();
      return;
    }
    setManualTitle(r.title);
    setManualIngredients([...r.names, ...r.skipped].join(', '));
    setStep('manual');
    window.scrollTo(0, 0);
  };

  const examples = VIDEO_EXAMPLES.map((v) => (
    <button key={v.id} className="sample-btn" onClick={() => readExample(v.id)}>
      {v.title}
      <small>예시 링크로 채우기</small>
    </button>
  ));

  if (step === 'input') {
    return (
      <>
        <h1>
          영상 속 재료,
          <br />
          냉장고에 있는지 볼까요?
        </h1>
        <p className="lead">쇼츠 링크를 붙여 넣으면 필요한 재료를 확인해드려요.</p>
        <input
          type="text"
          placeholder="유튜브 쇼츠 링크"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && url.trim() && void check()}
          autoComplete="off"
          aria-label="유튜브 쇼츠 링크"
        />
        <button className="cta" disabled={!url.trim()} onClick={() => void check()}>
          확인하기
        </button>
        <button className="note" style={{ textDecoration: 'underline', display: 'block', marginTop: 12 }} onClick={() => setStep('manual')}>
          링크 없이 직접 입력하기
        </button>
        <p className="note">쇼츠도 긴 영상도 돼요. AI가 영상 제목과 설명란을 읽어요.</p>
        <div className="eyebrow">예시 영상으로 해보기</div>
        {examples}
      </>
    );
  }

  if (step === 'loading' || step === 'reading') {
    return (
      <div className="pulse">
        <div className="spin" />
        <b style={{ color: 'var(--fg)', fontSize: 18 }}>영상에서 재료를 읽고 있어요</b>
        <span>{step === 'reading' ? '제목과 설명란을 보고 있어요' : '잠깐만 기다려 주세요'}</span>
        {step === 'reading' && (
          <button className="cta ghost" style={{ marginTop: 16 }} onClick={reset}>
            그만두기
          </button>
        )}
      </div>
    );
  }

  if (step === 'pick') {
    return (
      <>
        <BackButton onClick={reset} />
        <h1>어떤 메뉴를 볼까요?</h1>
        <p className="lead">이 영상에 메뉴가 {menus.length}개 있어요.</p>
        {menus.map((m) => (
          <button
            key={m.title}
            className="sample-btn"
            onClick={() => {
              setRecipe(m);
              setStep('confirm');
            }}
          >
            {m.title}
            <small>{m.names.slice(0, 5).join(', ')}{m.names.length > 5 ? ' …' : ''}</small>
          </button>
        ))}
      </>
    );
  }

  if (step === 'unknown') {
    return (
      <>
        <BackButton onClick={reset} />
        <h1>{failText ? '영상을 읽지 못했어요' : '이 링크는 아직 못 읽어요'}</h1>
        <p className="lead">{failText ?? `AI 연결 전이라 예시 영상 ${VIDEO_EXAMPLES.length}개만 확인할 수 있어요.`}</p>
        {examples}
        <button className="cta" onClick={() => setStep('manual')}>
          직접 입력하기
        </button>
        <button className="cta ghost" onClick={reset}>
          돌아가기
        </button>
      </>
    );
  }

  if (step === 'manual') {
    const submit = () => {
      const { names, skipped } = splitManualIngredients(manualIngredients, SUBSTITUTES);
      if (!names.length) {
        setManualError('재료를 한 개 이상 적어 주세요');
        return;
      }
      setManualError('');
      setChoices(NO_CHOICES);
      setRecipe({ title: manualTitle.trim() || '직접 입력한 메뉴', names, skipped });
      setStep('result');
      window.scrollTo(0, 0);
    };
    return (
      <>
        <BackButton onClick={reset} />
        <h1>
          메뉴와 재료를
          <br />
          직접 적어 주세요
        </h1>
        <p className="lead">영상 설명을 못 읽을 때도 이어서 확인할 수 있어요. 재료는 쉼표(,)로 나눠 주세요.</p>
        <input
          type="text"
          placeholder="메뉴 이름 (예: 제육볶음)"
          value={manualTitle}
          onChange={(e) => setManualTitle(e.target.value)}
          autoComplete="off"
          aria-label="메뉴 이름"
        />
        <input
          type="text"
          style={{ marginTop: 10 }}
          placeholder="재료 (예: 돼지고기 앞다리살, 양파, 대파)"
          value={manualIngredients}
          onChange={(e) => setManualIngredients(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          autoComplete="off"
          aria-label="재료"
        />
        {manualError && (
          <p className="note" role="alert" style={{ color: 'var(--red)' }}>
            {manualError}
          </p>
        )}
        <button className="cta" onClick={submit}>
          재고 확인하기
        </button>
      </>
    );
  }

  const r = recipe!;

  if (step === 'confirm') {
    return (
      <>
        <BackButton onClick={reset} />
        <h1>‘{r.title}’ 영상이 맞나요?</h1>
        <p className="lead">
          {r.guessed
            ? '설명란에 재료가 없어서, 메뉴 이름으로 흔히 쓰는 재료를 짐작했어요.'
            : '영상에서 이런 재료를 읽었어요.'}
        </p>
        <div className="tags" style={{ gap: 8 }}>
          {r.names.map((n) => (
            <span key={n} className="tag" style={{ fontSize: 14, padding: '6px 12px' }}>
              {n}
            </span>
          ))}
        </div>
        <div className="ctas">
          <button className="cta ghost" onClick={() => notThis(r)}>
            {r.fromAi ? '고칠게요' : '아니에요'}
          </button>
          <button className="cta" onClick={() => setStep('result')}>
            맞아요
          </button>
        </div>
      </>
    );
  }

  // 결과
  const rows = checkIngredients(r.names, items, today, SUBSTITUTES);
  const nSub = rows.filter((x) => x.kind === 'sub').length;
  const undecided = rows.filter((x) => x.kind === 'sub' && !choices.subs[x.name]).length;
  const setSub = (name: string, c: 'sub' | 'buy') => setChoices((ch) => ({ ...ch, subs: { ...ch.subs, [name]: c } }));
  const toggleBuy = (name: string) =>
    setChoices((ch) => ({
      ...ch,
      skipBuy: ch.skipBuy.includes(name) ? ch.skipBuy.filter((n) => n !== name) : [...ch.skipBuy, name],
    }));
  const pin = (mode: 'week' | 'today') => {
    const meal: PinnedMeal = {
      id: newId(),
      name: r.title,
      ...videoMealOf(rows, choices, PANTRY),
      source: 'video',
      url: sourceUrl,
      title: r.title,
      ...(mode === 'today' ? { date: today } : {}),
    };
    onPin(meal, mode);
    reset();
  };

  return (
    <>
      <BackButton onClick={reset} />
      <h1>{videoHeadline(rows)}</h1>
      <p className="lead">
        {r.title}
        {nSub > 0 && ` · 대체할 수 있는 재료 ${nSub}개`}
      </p>
      <div>
        {rows.map((x) => {
          if (x.kind === 'have') {
            const st = stateOf(x.item, today);
            return (
              <div key={x.name} className="row">
                <Tile name={x.name} core={x.item.core} />
                <div className="main">
                  <div className="nm">{x.name}</div>
                  <div className="meta">
                    {x.item.qty} · {dDayLabel(daysLeft(x.item, today))}
                  </div>
                </div>
                {st !== 'ok' && <StateBadge state={st} />}
                <span className="badge b-ok">있어요</span>
              </div>
            );
          }
          if (x.kind === 'sub') {
            const reason = subReason(x, today);
            const choice = choices.subs[x.name];
            return (
              <div key={x.name} className="row" style={{ display: 'block' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Tile name={x.name} core={x.sub.core} />
                  <div className="main">
                    <div className="nm">{x.name}</div>
                  </div>
                  <span className="badge b-none">없어요</span>
                </div>
                <div className={`sub-card ${choice === 'sub' ? 'chosen' : ''}`}>
                  <b>{subQuestion(x.name, x.sub.name)}</b>
                  <span>{reason.text}</span>
                  {reason.state && (
                    <span className="sub-badge">
                      <StateBadge state={reason.state} />
                    </span>
                  )}
                  {x.group.tip && <span>{x.group.tip}</span>}
                  <div className="sub-acts">
                    <button
                      className={`small-btn ${choice === 'sub' ? 'on' : 'alt'}`}
                      aria-pressed={choice === 'sub'}
                      onClick={() => setSub(x.name, 'sub')}
                    >
                      {choice === 'sub' && '✓ '}
                      {x.sub.name}
                      {ro(x.sub.name)} 할게요
                    </button>
                    <button
                      className={`small-btn ${choice === 'buy' ? 'on' : 'alt'}`}
                      aria-pressed={choice === 'buy'}
                      onClick={() => setSub(x.name, 'buy')}
                    >
                      {choice === 'buy' && '✓ '}그냥 살게요
                    </button>
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div key={x.name} className="row">
              <Tile name={x.name} core="" />
              <div className="main">
                <div className="nm">{x.name}</div>
                <div className="meta">냉장고에 없어요</div>
              </div>
              <label className="buy-check">
                <input type="checkbox" checked={!choices.skipBuy.includes(x.name)} onChange={() => toggleBuy(x.name)} />
                장보기 목록에 담기
              </label>
            </div>
          );
        })}
      </div>
      <p className="note">
        {r.skipped.length > 0 ? `${r.skipped.join('·')} 같은 기본 양념은 빼고 확인했어요. ` : '기본 양념은 빼고 확인했어요. '}
        양은 비교하지 않아요. 대체는 같은 종류 재료끼리만 제안해요. 맛이나 식감, 알레르기는 직접 판단해 주세요.
      </p>
      <div className="video-actions">
        {undecided > 0 && <p className="note">대체할지 고르지 않은 재료 {undecided}개는 장보기 목록에 담아요.</p>}
        <button className="cta" onClick={() => pin('week')}>
          이번 주 플랜에 넣을게요
        </button>
        <div className="ctas">
          <button className="cta ghost" onClick={() => pin('today')}>
            오늘 한 끼로 할게요
          </button>
          <button className="cta ghost" onClick={reset}>
            다른 영상 확인하기
          </button>
        </div>
      </div>
    </>
  );
}
