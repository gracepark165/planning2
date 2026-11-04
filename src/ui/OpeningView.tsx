// 오프닝 화면: 처음 열었을 때 한 번만, 마스코트가 서비스를 소개한다. 시작하기를 누르면 홈(첫 사용 안내 카드)으로.
// 모션(2026-11-04, 사용자 요청): 냉장고가 위에서 떨어져 착지 → 반짝임 → 글자가 한 자씩 생겨남 → 시작하기.
// 화면을 한 번 누르면 글자·버튼을 바로 다 보여준다. 움직임 줄이기 설정이면 처음부터 다 보인다.

import { useState, type CSSProperties } from 'react';

const TITLE = '안녕하세요, 저는 냉장고예요!';
const LINES = [
  '깜빡 잊은 재료가 없도록, 급한 재료부터 이번 주 끼니에 넣어 드릴게요.',
  '장 본 걸 올려 주면 나머지는 제가 정리할게요.',
];

// 시간표(초)
const TEXT_START = 1.15; // 냉장고 착지 뒤
const TITLE_STEP = 0.055; // 제목 한 글자 간격
const LINE_STEP = 0.026; // 설명 한 글자 간격
const GAP = 0.2; // 줄 사이 쉼

/** 글자를 한 자씩 생겨나게. 단어 단위로 묶어 줄바꿈은 단어 사이에서만 일어나게 한다. */
function Typed({ text, start, step }: { text: string; start: number; step: number }) {
  let i = 0;
  const words = text.split(' ');
  return (
    <span aria-hidden="true">
      {words.map((w, wi) => (
        <span key={wi}>
          <span className="type-word">
            {Array.from(w).map((ch, ci) => (
              <span key={ci} className="type-char" style={{ animationDelay: `${(start + step * i++).toFixed(3)}s` } as CSSProperties}>
                {ch}
              </span>
            ))}
          </span>
          {wi < words.length - 1 && (i++, ' ')}
        </span>
      ))}
    </span>
  );
}

const len = (s: string) => Array.from(s).length;

// 반짝이 위치(마스코트 기준 %)·크기·시작 시간
const SPARKLES: { x: number; y: number; s: number; d: number }[] = [
  { x: -6, y: 12, s: 22, d: 0.95 },
  { x: 98, y: 4, s: 28, d: 1.15 },
  { x: 104, y: 52, s: 16, d: 1.45 },
  { x: -10, y: 62, s: 18, d: 1.7 },
  { x: 74, y: -6, s: 14, d: 1.3 },
  { x: 18, y: -4, s: 12, d: 2.0 },
];

export function OpeningView({ onStart }: { onStart: () => void }) {
  const [skip, setSkip] = useState(false);

  const titleEnd = TEXT_START + TITLE_STEP * len(TITLE);
  const lineStarts: number[] = [];
  let t = titleEnd + GAP;
  for (const l of LINES) {
    lineStarts.push(t);
    t += LINE_STEP * len(l) + GAP;
  }
  const ctaDelay = t;

  return (
    <div className={'opening' + (skip ? ' skip' : '')} onClick={() => setSkip(true)}>
      <div className="opening-body">
        <div className="opening-stage">
          <div className="opening-drop">
            <img className="opening-mascot" alt="" src="/mascot.webp" />
            <div className="opening-shine" aria-hidden="true" />
          </div>
          <div className="opening-shadow" aria-hidden="true" />
          {SPARKLES.map((p, k) => (
            <svg
              key={k}
              className="sparkle"
              aria-hidden="true"
              viewBox="0 0 24 24"
              style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s, animationDelay: `${p.d}s` }}
            >
              <path d="M12 0C13 7 17 11 24 12C17 13 13 17 12 24C11 17 7 13 0 12C7 11 11 7 12 0Z" />
            </svg>
          ))}
        </div>
        <h1>
          <span className="sr-only">{TITLE}</span>
          <Typed text={TITLE} start={TEXT_START} step={TITLE_STEP} />
        </h1>
        {LINES.map((l, k) => (
          <p key={k}>
            <span className="sr-only">{l}</span>
            <Typed text={l} start={lineStarts[k]} step={LINE_STEP} />
          </p>
        ))}
      </div>
      <button className="cta opening-cta" style={{ animationDelay: `${ctaDelay.toFixed(2)}s` }} onClick={onStart}>
        시작하기
      </button>
    </div>
  );
}
