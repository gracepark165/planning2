// 재료 행을 누르면 뜨는 하단 시트: 기준 표시, 소비기한 ±1일, 남은 양, 다 먹었어요/버렸어요

import { useEffect } from 'react';
import { findCatalog } from '../data';
import { REMAINING_LEVELS } from '../rules/constants';
import { formatMonthDay } from '../rules/date';
import { expiryBasisText, usualShelfText } from '../rules/expiry';
import { dDayLabel, daysLeft, daysSinceEntered, stateOf } from '../rules/status';
import type { DateKey, Item, Remaining } from '../rules/types';
import { StateBadge } from './parts';

interface Props {
  item: Item;
  today: DateKey;
  onClose: () => void;
  onShift: (delta: number) => void;
  onRemaining: (r: Remaining) => void;
  onFinish: (action: 'eat' | 'discard') => void;
}

export function ItemSheet({ item, today, onClose, onShift, onRemaining, onFinish }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const left = daysLeft(item, today);

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        onClick={(e) => e.stopPropagation()}
      >
        <StateBadge state={stateOf(item, today)} />
        <h1>{item.name}</h1>
        <p className="lead" style={{ marginBottom: 0 }}>
          {item.qty} · {item.location} · 들어온 지 {daysSinceEntered(item, today)}일
        </p>

        <div className="basis">
          <div>
            <span>입고일(기준일)</span>
            <b>{formatMonthDay(item.enteredAt)}</b>
          </div>
          <div>
            <span>소비기한</span>
            <b>
              {formatMonthDay(item.expiresAt)} ({dDayLabel(left)})
            </b>
          </div>
          <div>
            <span>근거</span>
            <b>{expiryBasisText(item)}</b>
          </div>
          <div className="usual">{usualShelfText(findCatalog(item.name), item.portioned)}</div>
          <div className="acts">
            <span style={{ alignSelf: 'center' }}>기한 고치기</span>
            <button className="small-btn alt" onClick={() => onShift(-1)}>
              −1일
            </button>
            <button className="small-btn alt" onClick={() => onShift(1)}>
              +1일
            </button>
          </div>
        </div>

        <div className="eyebrow" style={{ marginTop: 14 }}>
          남은 양
        </div>
        <div className="seg">
          {REMAINING_LEVELS.map((r) => (
            <button key={r} className={item.remaining === r ? 'on' : ''} onClick={() => onRemaining(r)}>
              {r}
            </button>
          ))}
        </div>

        <div className="ctas">
          <button
            className="btn-soft"
            style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
            onClick={() => onFinish('eat')}
          >
            ✓ 다 먹었어요
          </button>
          <button
            className="btn-soft"
            style={{ background: 'var(--red-bg)', color: 'var(--red)' }}
            onClick={() => onFinish('discard')}
          >
            버렸어요
          </button>
        </div>
        <button className="cta ghost" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
