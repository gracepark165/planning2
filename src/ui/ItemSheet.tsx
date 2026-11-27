// 재료 행을 누르면 뜨는 하단 시트: 기준 표시, 소비기한 ±1일, 남은 양, 다 먹었어요/버렸어요

import { useEffect, useRef, useState } from 'react';
import { findCatalog } from '../data';
import { COUNT_MAX, COUNT_MIN, LOCATIONS, REMAINING_LEVELS } from '../rules/constants';
import { formatDate } from '../rules/date';
import { basisNote, enteredText, expiryBasisText, sellByOf } from '../rules/expiry';
import { dDayLabel, daysLeft, daysSinceEntered, stateOf } from '../rules/status';
import type { DateKey, Item, Location, Remaining } from '../rules/types';
import { portionOf } from '../rules/portion';
import { DateSlider, EnteredPicker, StateBadge } from './parts';

interface Props {
  item: Item;
  today: DateKey;
  onClose: () => void;
  /** 소비기한·유통기한 슬라이더 (2026-11-20) */
  onExpiry: (date: DateKey) => void;
  onSellBy: (date: DateKey) => void;
  onRemaining: (r: Remaining) => void;
  onFinish: (action: 'eat' | 'discard') => void;
  onLocation: (l: Location) => void;
  onCount: (delta: number) => void;
  onRemove: () => void;
  /** 들어온 날 바꾸기 (V4-2) */
  onEntered: (enteredAt: string) => void;
  /** 한 번에 다 써요 / 여러 번 나눠 써요 (V4-3) */
  onPortion: (portion: 'level' | 'whole') => void;
}

export function ItemSheet({ item, today, onClose, onExpiry, onSellBy, onRemaining, onFinish, onLocation, onCount, onRemove, onEntered, onPortion }: Props) {
  const [showSellBy, setShowSellBy] = useState(false);
  /** 날짜를 고친 뒤 잠깐 보여 주는 "저장했어요" 안내 (고친 날짜 포함) */
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const savedTimer = useRef<number | undefined>(undefined);
  const flashSaved = (d: string) => {
    setSavedNote(formatDate(d as DateKey));
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSavedNote(null), 2200);
  };
  useEffect(() => () => window.clearTimeout(savedTimer.current), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const left = daysLeft(item, today);
  const usual = basisNote(item);

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
          {item.qty} · {item.location} · {enteredText(daysSinceEntered(item, today))}
        </p>

        <div className="basis">
          <div>
            <span>입고일(기준일)</span>
            <b>{formatDate(item.enteredAt)}</b>
          </div>
          <div>
            <span>소비기한</span>
            <b>
              {formatDate(item.expiresAt)} · {dDayLabel(left)}
            </b>
          </div>
          <div>
            <span>근거</span>
            <b>{expiryBasisText(item)}</b>
          </div>
          {findCatalog(item.name) ? (
            usual && <div className="usual">{usual}</div>
          ) : (
            <div className="usual">
              재료 사전에 없는 재료예요. 고친 기한·보관 위치는 기억해 두었다가 다음에 같은 재료를 넣을 때 써요.
            </div>
          )}
          {/* 2026-11-27 사용자 점검: 날짜가 두 개 나란히 있어 헷갈림 → 소비기한만 먼저, 포장 기한은 펼쳐서 */}
          <DateSlider
            label="소비기한 · 이 날까지 먹어요"
            hint="얼른 먹어야 할 재료를 정하는 기준이에요. 막대를 옆으로 밀어 고쳐요."
            value={item.expiresAt}
            min={item.enteredAt}
            today={today}
            onChange={(d) => {
              onExpiry(d);
              flashSaved(d);
            }}
          />
          {savedNote && (
            <p className="saved-flash" role="status">
              ✓ 저장했어요 · {savedNote}
            </p>
          )}
          <button className="note" style={{ textDecoration: 'underline', marginTop: 10 }} aria-expanded={showSellBy} onClick={() => setShowSellBy((o) => !o)}>
            포장에 적힌 유통기한도 보기 {showSellBy ? '▴' : '▾'}
          </button>
          {showSellBy && (
            <DateSlider
              label="유통기한 · 포장에 적힌 날짜 (참고)"
              hint="참고용이에요. 소비기한보다 늦출 수 없고, 소비기한을 앞당기면 같이 당겨져요."
              value={sellByOf(item)}
              min={item.enteredAt}
              high={item.expiresAt}
              today={today}
              tone="sub"
              onChange={(d) => {
                onSellBy(d);
                flashSaved(d);
              }}
            />
          )}
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

        {!item.portioned && (
          <div className="seg" style={{ marginTop: 8 }} role="group" aria-label="쓰는 방식">
            {(['whole', 'level'] as const).map((p) => (
              <button key={p} className={portionOf(item) === p ? 'on' : ''} onClick={() => onPortion(p)}>
                {p === 'whole' ? '한 번에 다 써요' : '여러 번 나눠 써요'}
              </button>
            ))}
          </div>
        )}

        {item.portioned && (
          <>
            <div className="eyebrow" style={{ marginTop: 14 }}>
              남은 개수 (소분)
            </div>
            <div className="stepper" style={{ margin: '8px 0 4px' }}>
              한 끼에 하나씩 써요
              <div>
                <button aria-label="하나 빼기" disabled={(item.count ?? 1) <= COUNT_MIN} onClick={() => onCount(-1)}>
                  −
                </button>
                <b>
                  {item.count ?? 1}
                  {item.unit ?? '개'}
                </b>
                <button aria-label="하나 더하기" disabled={(item.count ?? 1) >= COUNT_MAX} onClick={() => onCount(1)}>
                  +
                </button>
              </div>
            </div>
          </>
        )}

        <div className="eyebrow" style={{ marginTop: 14 }}>
          들어온 날
        </div>
        <EnteredPicker key={item.id} value={item.enteredAt} today={today} onChange={onEntered} />

        <div className="eyebrow" style={{ marginTop: 14 }}>
          보관 위치
        </div>
        <div className="seg">
          {LOCATIONS.map((l) => (
            <button key={l} className={item.location === l ? 'on' : ''} onClick={() => onLocation(l)}>
              {l}
            </button>
          ))}
        </div>

        <div className="ctas" style={{ marginTop: 16 }}>
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
        <button className="note" style={{ textDecoration: 'underline', display: 'block', margin: '14px auto 0' }} onClick={onRemove}>
          잘못 넣었어요 (지우기)
        </button>
      </div>
    </div>
  );
}
