// 오프닝 화면: 처음 열었을 때 한 번만, 마스코트가 서비스를 소개한다.
// 카카오로 시작하기(빈 내 냉장고 + 로그인) / 로그인 없이 둘러보기(예시 냉장고, 커뮤니티는 읽기만) 중 고르면 홈으로.
// 모션(2026-11-04, 사용자 요청): 냉장고가 위에서 떨어져 착지 → 반짝임 → 글자가 한 자씩 생겨남 → 시작하기.
// 화면을 한 번 누르면 글자·버튼을 바로 다 보여준다. 움직임 줄이기 설정이면 처음부터 다 보인다.

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { KakaoButton } from './parts';

const TITLE = '안녕하세요, 저는 냉집사예요!';
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

/** 소개 글 읽어 주기 (2026-11-20, 사용자 요청): Fish Audio 어린이 목소리, 서버 함수 /api/tts (키는 Vercel 환경 변수) */
function useIntroVoice() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'off'>('idle');
  // v: 목소리를 바꿨을 때 브라우저·CDN 캐시를 피하려고 올린다
  const get = () => {
    if (!audio.current) {
      const a = new Audio('/api/tts?line=intro&v=2');
      a.preload = 'auto'; // 열자마자 미리 받아 두어 누르는 순간 바로 나오게
      a.onended = () => setState('idle');
      a.onerror = () => setState('off'); // 서버에 키가 없으면 버튼을 숨긴다
      audio.current = a;
    }
    return audio.current;
  };
  const play = () => {
    const a = get();
    a.currentTime = 0;
    setState((s) => (s === 'off' ? s : 'loading'));
    return a.play().then(
      () => setState('playing'),
      (e) => {
        setState((s) => (s === 'off' ? s : 'idle'));
        throw e;
      },
    );
  };
  const stop = () => {
    audio.current?.pause();
    setState((s) => (s === 'off' ? s : 'idle'));
  };
  // 오프닝이 열리자마자 소리를 받으며 바로 읽는다.
  // 브라우저는 사용자가 아무것도 안 만졌으면 소리를 막으므로, 막히면 화면을 처음 만지는(누르는·키 누르는) 순간 읽는다.
  useEffect(() => {
    get().load();
    const events = ['pointerdown', 'touchend', 'keydown'] as const;
    let started = false;
    const cleanup = () => events.forEach((e) => window.removeEventListener(e, onGesture, true));
    const start = () => {
      if (started) return;
      started = true;
      cleanup();
      play().catch(() => {});
    };
    function onGesture() {
      start();
    }
    events.forEach((e) => window.addEventListener(e, onGesture, true));
    // 열리자마자 바로 자동 재생을 시도한다 (막히면 위의 첫 만짐 기다림이 그대로 남는다)
    get()
      .play()
      .then(() => {
        started = true;
        cleanup();
        setState('playing');
      })
      .catch(() => setState((s) => (s === 'off' ? s : 'idle')));
    return () => {
      started = true;
      cleanup();
      audio.current?.pause();
    };
  }, []);
  return { state, play, stop };
}

export function OpeningView({ onKakao, onGuest }: { onKakao: () => void; onGuest: () => void }) {
  const [skip, setSkip] = useState(false);
  const voice = useIntroVoice();

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
      {voice.state !== 'off' && (
        <button
          className="voice-btn"
          aria-pressed={voice.state === 'playing'}
          disabled={voice.state === 'loading'}
          onClick={(e) => {
            e.stopPropagation();
            if (voice.state === 'playing') voice.stop();
            else voice.play().catch(() => {});
          }}
        >
          {voice.state === 'playing' ? '🔊 듣는 중 · 누르면 멈춰요' : voice.state === 'loading' ? '🔈 불러오는 중…' : '🔈 목소리로 듣기'}
        </button>
      )}
      {/* 시작 방법 (2026-11-16): 카카오로 시작(내 냉장고, 커뮤니티 글쓰기) / 로그인 없이 예시 냉장고로 둘러보기 */}
      <div className="opening-cta" style={{ animationDelay: `${ctaDelay.toFixed(2)}s` }}>
        <KakaoButton onClick={onKakao} label="카카오로 시작하기" />
        <button className="cta ghost" onClick={onGuest}>
          로그인 없이 둘러보기
        </button>
      </div>
    </div>
  );
}
