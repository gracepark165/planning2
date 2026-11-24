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

/** 소리가 나가기 시작한 뒤 목소리가 시작하기까지 비워 두는 시간(초): 스피커·블루투스가 깨어나는 동안 첫 음이 잘리지 않게 */
const VOICE_LEAD = 0.4;

/**
 * 소개 글 읽어 주기 (2026-11-20, 사용자 요청): 어린이 목소리.
 * 2026-11-24 끊김 수정 (사용자: 첫 재생에서 계속 끊김):
 *  - 소리를 미리 풀어서(디코딩) 메모리에 올려 두고 Web Audio로 튼다. <audio>로 mp3를 스트리밍하면 첫 재생 때 디코더가 데워지며 첫 음이 끊긴다.
 *  - 소리가 나가기 시작한 뒤 0.4초 뒤에 목소리를 시작한다 (기기가 깨어나는 순간의 잘림을 비워 둔 시간이 흡수).
 *  - 한 번 시작한 소리는 처음으로 되돌려 다시 틀지 않는다 (자동 재생과 첫 터치가 겹쳐도 한 번만).
 *  - 소리 파일은 `public/intro-voice.mp3` (없으면 서버 /api/tts).
 */
function useIntroVoice() {
  const ctxRef = useRef<AudioContext | null>(null);
  const bufRef = useRef<AudioBuffer | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  /** 재생을 시작했는지 (끝나거나 멈추기 전까지 다시 시작하지 않는다) */
  const started = useRef(false);
  /** 소리를 다 풀기 전에 사용자가 만졌으면, 다 풀리는 대로 바로 튼다 */
  const wanted = useRef(false);
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'off'>('loading');

  const begin = async () => {
    const ctx = ctxRef.current;
    const buf = bufRef.current;
    if (!ctx || !buf || started.current) return;
    started.current = true;
    try {
      // 브라우저가 소리를 막았으면 resume이 끝나지 않으므로 잠깐만 기다려 본다
      if (ctx.state !== 'running') await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 250))]);
      if (ctx.state !== 'running') {
        started.current = false; // 막힘 → 첫 터치를 기다린다
        setState('idle');
        return;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.onended = () => {
        if (srcRef.current !== src) return;
        srcRef.current = null;
        started.current = false;
        setState('idle');
      };
      src.start(ctx.currentTime + VOICE_LEAD);
      srcRef.current = src;
      setState('playing');
    } catch {
      started.current = false;
      setState('idle');
    }
  };
  const stop = () => {
    const src = srcRef.current;
    srcRef.current = null;
    started.current = false;
    try {
      src?.stop();
    } catch {
      // 이미 끝났다
    }
    setState((s) => (s === 'off' ? s : 'idle'));
  };
  /** 버튼: 처음부터 다시 */
  const play = () => {
    stop();
    return begin();
  };

  useEffect(() => {
    let dead = false;
    const events = ['pointerdown', 'touchend', 'keydown'] as const;
    const onGesture = () => {
      events.forEach((e) => window.removeEventListener(e, onGesture, true));
      if (bufRef.current) void begin();
      else wanted.current = true;
    };
    events.forEach((e) => window.addEventListener(e, onGesture, true));

    const fetchBytes = async (src: string) => {
      const res = await fetch(src);
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('audio')) throw new Error('no audio');
      return res.arrayBuffer();
    };
    (async () => {
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) throw new Error('no web audio');
        // 다듬어 둔 파일 → 없으면 서버가 만든 소리
        const bytes = await fetchBytes('/intro-voice.mp3?v=3').catch(() => fetchBytes('/api/tts?line=intro&v=2'));
        if (dead) return;
        const ctx = new AC();
        ctxRef.current = ctx;
        bufRef.current = await ctx.decodeAudioData(bytes);
        if (dead) return;
        await begin(); // 풀리자마자 자동 재생 시도. 막히면 첫 터치에서
        if (started.current) events.forEach((e) => window.removeEventListener(e, onGesture, true));
        else if (wanted.current) await begin();
        else setState('idle');
      } catch {
        if (!dead) setState('off'); // 소리를 못 풀면 버튼을 숨긴다
      }
    })();
    return () => {
      dead = true;
      events.forEach((e) => window.removeEventListener(e, onGesture, true));
      try {
        srcRef.current?.stop();
      } catch {
        // 이미 끝났다
      }
      void ctxRef.current?.close().catch(() => {});
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
