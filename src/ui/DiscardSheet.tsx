// 버렸어요 다음에 한 번만 묻는 하단 시트 (B-4): 칩 하나로 이유를 고른다. 꾸짖는 말은 넣지 않는다.

import { useEffect } from 'react';
import { DISCARD_REASONS } from '../rules/constants';

interface Props {
  name: string;
  onPick: (reason: string) => void;
  /** 건너뛰기·바깥 누르기·Esc (이유 없음) */
  onSkip: () => void;
}

export function DiscardSheet({ name, onPick, onSkip }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onSkip();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSkip]);

  return (
    <div className="sheet-bg" onClick={onSkip}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="discard-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h1 id="discard-title">왜 버리게 됐어요?</h1>
        <p className="lead">{name} · 하나만 골라 주세요</p>
        <div className="reason-chips">
          {DISCARD_REASONS.map((r) => (
            <button key={r} className="chip" onClick={() => onPick(r)}>
              {r}
            </button>
          ))}
        </div>
        <button className="note reason-skip" onClick={onSkip}>
          건너뛰기
        </button>
      </div>
    </div>
  );
}
