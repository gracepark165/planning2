// 사야 할 재료가 있는 메뉴를 확정할 때 한 번 묻는 시트 (V4-6-5): "상추는 준비됐어요?"

import { useEffect } from 'react';
import { eun } from '../rules/josa';

interface Props {
  missing: string[];
  /** 샀어요: 장보기 목록에서 지우고 확정 */
  onBought: () => void;
  /** 없이 만들었어요: 그대로 확정 */
  onWithout: () => void;
  onCancel: () => void;
}

export function BuyCheckSheet({ missing, onBought, onWithout, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const names = missing.join(', ');
  return (
    <div className="sheet-bg" onClick={onCancel}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="buy-check-title" onClick={(e) => e.stopPropagation()}>
        <h1 id="buy-check-title">
          {names}
          {eun(missing.at(-1) ?? '')} 준비됐어요?
        </h1>
        <div className="ctas">
          <button className="cta ghost" onClick={onWithout}>
            없이 만들었어요
          </button>
          <button className="cta" onClick={onBought}>
            샀어요
          </button>
        </div>
        <button className="note reason-skip" onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  );
}
