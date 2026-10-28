// 확인 화면 (docs/text-input-rules.md 3장): 읽은 결과를 보여주고 틀린 줄만 고친다.
// 글 입력과 AI가 읽은 주문 화면이 같이 쓴다.

import { type ReactNode, useState } from 'react';
import { findCatalog } from '../data';
import { COUNT_MAX, COUNT_MIN, LOCATIONS } from '../rules/constants';
import { formatMonthDay } from '../rules/date';
import { dDayLabel, daysLeft } from '../rules/status';
import type { DateKey } from '../rules/types';
import {
  EXPIRY_CHOICES,
  ISSUE_TEXT,
  chooseExpiryDays,
  issuesOf,
  renameRow,
  shiftDraftCount,
  shiftDraftExpiry,
  togglePortion,
  type DraftRow,
} from '../state/textDraft';
import { BackButton, Tile } from './parts';

interface Props {
  rows: DraftRow[];
  today: DateKey;
  onChange: (rows: DraftRow[]) => void;
  onBack: () => void;
  onSubmit: () => void;
  /** 기본: "N개를 읽었어요" */
  title?: string;
  /** 제목 아래에 붙일 것 (주문 화면: 사진, 마트 고르기) */
  header?: ReactNode;
  /** 맨 아래 안내 문구 */
  footnote?: string;
}

const DEFAULT_FOOTNOTE =
  '소비기한은 입고일(오늘) + 기본 기간표(임시)로 정했어요. 소분한 재료는 소분 기간표(임시)를 써요. 넣은 뒤에도 냉장고에서 고칠 수 있어요.';

export function TextConfirm({ rows, today, onChange, onBack, onSubmit, title, header, footnote }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [typed, setTyped] = useState('');

  const update = (key: string, fn: (r: DraftRow) => DraftRow) => onChange(rows.map((r) => (r.key === key ? fn(r) : r)));
  const remove = (key: string) => onChange(rows.filter((r) => r.key !== key));
  const rename = (key: string, name: string) => {
    update(key, (r) => renameRow(r, name, today, findCatalog));
    setEditing(null);
    setTyped('');
  };

  const pending = rows.filter((r) => issuesOf(r).length).length;

  return (
    <>
      <BackButton onClick={onBack} />
      <h1>{title ?? `${rows.length}개를 읽었어요`}</h1>
      <p className="lead">
        틀린 줄만 고쳐 주세요. {pending > 0 && <b style={{ color: 'var(--red)' }}>표시된 줄 {pending}개는 꼭 확인해 주세요.</b>}
      </p>
      {header}

      {rows.map((r) => {
        const issues = issuesOf(r);
        const nameOpen = editing === r.key || issues.includes('name');
        const left = r.expiresAt ? daysLeft({ enteredAt: r.enteredAt ?? today, expiresAt: r.expiresAt }, today) : undefined;
        return (
          <div key={r.key} className={`draft ${issues.length ? 'warn' : ''}`}>
            <div className="draft-top">
              <Tile name={r.name} core={findCatalog(r.catalogName ?? '')?.core ?? ''} />
              <div className="main">
                <button className="nm draft-name" onClick={() => setEditing(editing === r.key ? null : r.key)}>
                  {r.name || '(이름 없음)'} <span aria-hidden="true">✎</span>
                </button>
                <div className="meta">
                  {r.source === 'order' ? '주문 화면' : '입력'}: {r.raw}
                </div>
              </div>
              <button className="small-btn alt" onClick={() => remove(r.key)} aria-label={`${r.name} 줄 지우기`}>
                지우기
              </button>
            </div>

            {(issues.length > 0 || r.byAi) && (
              <div className="tags">
                {r.byAi && <span className="badge b-info">AI가 읽었어요</span>}
                {r.expiryBasis === 'label' && <span className="badge b-ok">소비기한 표기 읽음</span>}
                {issues.map((i) => (
                  <span key={i} className={`badge ${i === 'name' ? 'b-buried' : 'b-soon'}`}>
                    {ISSUE_TEXT[i]}
                  </span>
                ))}
              </div>
            )}

            {nameOpen && (
              <div className="name-edit">
                <div className="chips" style={{ padding: '4px 0 8px' }}>
                  {r.nameCandidates.map((n) => (
                    <button key={n} className={`chip ${n === r.name ? 'on' : ''}`} onClick={() => rename(r.key, n)}>
                      {n}
                    </button>
                  ))}
                </div>
                <div className="name-input">
                  <input
                    type="text"
                    placeholder="직접 입력"
                    value={editing === r.key ? typed : ''}
                    onFocus={() => setEditing(r.key)}
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && rename(r.key, typed)}
                  />
                  <button className="small-btn" disabled={!typed.trim() || editing !== r.key} onClick={() => rename(r.key, typed)}>
                    바꾸기
                  </button>
                </div>
                {issues.includes('name') && (
                  <button className="note" style={{ textDecoration: 'underline' }} onClick={() => rename(r.key, r.name)}>
                    “{r.name}” 그대로 둘게요
                  </button>
                )}
              </div>
            )}

            <div className="fields">
              <div className="field">
                <span>{r.portioned ? '몇 개로 나눴나요' : '개수'}</span>
                <div className="mini-step">
                  <button
                    aria-label="하나 빼기"
                    disabled={r.count !== undefined && r.count <= COUNT_MIN}
                    onClick={() => update(r.key, (x) => shiftDraftCount(x, -1))}
                  >
                    −
                  </button>
                  <b>{r.count === undefined ? '?' : r.count}{r.unit}</b>
                  <button
                    aria-label="하나 더하기"
                    disabled={r.count !== undefined && r.count >= COUNT_MAX}
                    onClick={() => update(r.key, (x) => shiftDraftCount(x, 1))}
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="field">
                <span>소분</span>
                <button
                  className={`chip ${r.portioned ? 'on' : ''}`}
                  aria-pressed={r.portioned}
                  onClick={() => update(r.key, (x) => togglePortion(x, today, findCatalog))}
                >
                  {r.portioned ? '소분했어요' : '소분 안 함'}
                </button>
              </div>
              <div className="field">
                <span>보관</span>
                <div className="seg mini">
                  {LOCATIONS.map((l) => (
                    <button key={l} className={r.location === l ? 'on' : ''} onClick={() => update(r.key, (x) => ({ ...x, location: l }))}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span>소비기한</span>
                {r.expiresAt && left !== undefined ? (
                  <div className="acts" style={{ marginTop: 0, alignItems: 'center' }}>
                    <b style={{ fontWeight: 500 }}>
                      {formatMonthDay(r.expiresAt)} ({dDayLabel(left)})
                    </b>
                    <button className="small-btn alt" onClick={() => update(r.key, (x) => shiftDraftExpiry(x, -1, today))}>
                      −1일
                    </button>
                    <button className="small-btn alt" onClick={() => update(r.key, (x) => shiftDraftExpiry(x, 1, today))}>
                      +1일
                    </button>
                  </div>
                ) : (
                  <div className="chips" style={{ padding: 0 }}>
                    {EXPIRY_CHOICES.map((d) => (
                      <button key={d} className="chip" onClick={() => update(r.key, (x) => chooseExpiryDays(x, d, today))}>
                        {d}일
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {r.note && <div className="note" style={{ margin: 0 }}>참고: {r.note}</div>}
            </div>
          </div>
        );
      })}

      <button className="cta" disabled={!rows.length || pending > 0} onClick={onSubmit}>
        {!rows.length ? '넣을 재료가 없어요' : pending > 0 ? `확인할 줄이 ${pending}개 남았어요` : `냉장고에 넣을게요 (${rows.length}개)`}
      </button>
      <p className="note">{footnote ?? DEFAULT_FOOTNOTE}</p>
    </>
  );
}
