// 시연영상 (2026-11-27, 사용자 요청): 카카오 로그인을 하고 싶지 않은 사람이 앱이 어떤 건지 먼저 볼 수 있게.
// 오프닝의 `▶ 시연영상 보기`와 홈 맨 위 둘러보기 안내에서 연다. 영상은 누를 때 받는다(처음 화면을 무겁게 하지 않음).

import { useEffect, useRef, useState } from 'react';

/** 시연영상 버튼: 오프닝·홈에서 같은 모양 */
export function DemoVideoButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button className={`demo-link ${className}`} onClick={onClick}>
      <span className="demo-play" aria-hidden="true">
        ▶
      </span>
      시연영상 보기 <small>약 1분 30초 · 소리·자막 · 로그인 없이</small>
    </button>
  );
}

/** 영상 창 (바깥을 누르거나 Esc, ✕로 닫는다) */
export function DemoVideoModal({ onClose }: { onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  /** 브라우저가 소리 있는 자동 재생을 막아서 소리 없이 시작했는지 */
  const [silent, setSilent] = useState(false);
  useEffect(() => {
    // 버튼을 누른 직후라서 소리와 함께 바로 재생된다. 막히면 소리 없이 시작하고 안내한다.
    const v = video.current;
    if (!v) return;
    v.muted = false;
    v.play().catch(() => {
      v.muted = true;
      setSilent(true);
      void v.play().catch(() => {});
    });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="demo-bg" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="demo-modal" role="dialog" aria-modal="true" aria-label="냉집사 시연영상" onClick={(e) => e.stopPropagation()}>
        <div className="demo-head">
          <b>냉집사 시연영상</b>
          <button className="demo-x" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <video
          ref={video}
          className="demo-video"
          src="/demo/demo.mp4"
          poster="/demo/demo-poster.jpg"
          controls
          playsInline
          preload="metadata"
        >
          {/* 자막 (2026-11-27): 영상 창의 CC 버튼으로 켜고 끈다 */}
          <track kind="subtitles" srcLang="ko" label="한국어" src="/demo/demo.ko.vtt" default />
        </video>
        <p className="demo-note">
          {silent ? '소리를 들으려면 영상의 스피커 버튼을 눌러 주세요. ' : '안내 목소리가 나와요. '}
          자막은 CC 버튼으로 켜고 꺼요. 시연용 화면과 예시 데이터예요. 전체 화면으로 보면 더 잘 보여요.
        </p>
      </div>
    </div>
  );
}
