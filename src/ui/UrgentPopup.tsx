// 앱을 열 때 하루 한 번 뜨는 팝업 (2026-11-10, 사용자 요청: 홈 위에 계속 있던 배너 대신)
// 가장 급한 재료 + 그 재료를 쓰는 끼니, `이번 주 플랜 보기`로 바로 이동

import { useEffect } from 'react';
import type { Item } from '../rules/types';
import type { PlanSlot } from '../rules/plan';
import { dueBannerText } from '../rules/status';
import { formatDayLabel } from '../rules/date';
import { STATE_META } from '../rules/constants';

interface Props {
  item: Item;
  /** 얼른 먹어야 할 재료 수 (이 재료 포함) */
  soonCount: number;
  /** 이 재료를 쓰는 가장 빠른 끼니 */
  slot: PlanSlot | undefined;
  today: string;
  onPlan: () => void;
  onClose: () => void;
}

export function UrgentPopup({ item, soonCount, slot, today, onPlan, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="popup-bg" onClick={onClose}>
      <div className="popup" role="dialog" aria-modal="true" aria-labelledby="urgent-title" onClick={(e) => e.stopPropagation()}>
        <div className="popup-icon" aria-hidden>
          {STATE_META.soon.icon}
        </div>
        <h1 id="urgent-title">{dueBannerText(item, today)}</h1>
        {soonCount > 1 && <p className="popup-sub">얼른 먹어야 할 재료가 {soonCount}개 있어요</p>}
        {slot?.recipe ? (
          <p className="popup-meal">
            <span>{formatDayLabel(slot.date, today)}</span>
            <b>{slot.recipe.name}에 넣어 뒀어요</b>
          </p>
        ) : (
          <p className="popup-sub">이번 주 플랜에서 언제 먹을지 확인해 보세요</p>
        )}
        <button className="cta" onClick={onPlan}>
          이번 주 플랜 보기
        </button>
        <button className="note reason-skip" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
