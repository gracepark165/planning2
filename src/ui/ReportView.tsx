// 나의 활동 (2026-11-10, 사용자 요청): 아래 탭 오른쪽 끝 🕒 탭. 다 먹었어요·버렸어요·집밥 기록을 기간별 리포트로 보여준다.
import { useState } from 'react';
import { formatDate, formatDayLabel } from '../rules/date';
import { REPORT_PERIODS, activityReport, reportSentence, type ReportPeriod } from '../rules/report';
import type { DateKey, DoneMeal, MealLog } from '../rules/types';

interface Props {
  logs: MealLog[];
  doneMeals: DoneMeal[];
  today: DateKey;
  /** 기록이 없을 때: 냉장고로 */
  onHome: () => void;
}

export function ReportView({ logs, doneMeals, today, onHome }: Props) {
  const [period, setPeriod] = useState<ReportPeriod>(7);
  const r = activityReport(logs, doneMeals, today, period);
  const empty = !r.eaten && !r.discarded && !r.meals;
  const maxReason = Math.max(1, ...r.reasons.map((x) => x.count));

  return (
    <>
      <h1>나의 활동</h1>
      <p className="lead">{reportSentence(r, period)}</p>

      <div className="seg" role="tablist" aria-label="기간">
        {REPORT_PERIODS.map((p) => (
          <button key={p} role="tab" aria-selected={period === p} className={period === p ? 'on' : ''} onClick={() => setPeriod(p)}>
            최근 {p}일
          </button>
        ))}
      </div>
      <p className="note" style={{ marginTop: 6 }}>
        {formatDate(r.start)} ~ {formatDate(r.end)}
      </p>

      <div className="report-stats">
        <div className="stat">
          <span>먹은 재료</span>
          <b>{r.eaten}개</b>
          {r.eatenSoon > 0 && <small>얼른 먹어야 할 것 {r.eatenSoon}개</small>}
        </div>
        <div className="stat">
          <span>버린 재료</span>
          <b className={r.discarded ? 'warn' : ''}>{r.discarded}개</b>
        </div>
        <div className="stat">
          <span>집밥</span>
          <b>{r.meals}번</b>
        </div>
        <div className="stat">
          <span>먹어서 지킨 비율</span>
          <b className="good">{r.savedRate === null ? '–' : `${r.savedRate}%`}</b>
        </div>
      </div>

      {r.savedRate !== null && (
        <div className="saved-bar" aria-hidden="true">
          <i style={{ width: `${r.savedRate}%` }} />
        </div>
      )}

      {r.reasons.length > 0 && (
        <div className="card">
          <h3>버린 이유</h3>
          <ul className="reason-list">
            {r.reasons.map((x) => (
              <li key={x.reason}>
                <span>{x.reason}</span>
                <i style={{ width: `${(x.count / maxReason) * 100}%` }} />
                <b>{x.count}</b>
              </li>
            ))}
          </ul>
        </div>
      )}

      {empty ? (
        <div className="card">
          <p style={{ margin: 0 }}>재료를 다 먹었어요·버렸어요로 남기거나, 이번 주에서 끼니를 정하면 여기에 쌓여요.</p>
          <button className="small-btn main" style={{ marginTop: 12 }} onClick={onHome}>
            냉장고 보기
          </button>
        </div>
      ) : (
        <>
          <div className="eyebrow">날짜별 기록</div>
          {r.days.map((d) => (
            <div key={d.date} className="day-log">
              <div className="when">{formatDayLabel(d.date, today)}</div>
              {d.meals.length > 0 && (
                <p>
                  <span className="kind meal">집밥</span>
                  {d.meals.join(', ')}
                </p>
              )}
              {d.eaten.length > 0 && (
                <p>
                  <span className="kind eat">다 먹었어요</span>
                  {d.eaten.join(', ')}
                </p>
              )}
              {d.discarded.length > 0 && (
                <p>
                  <span className="kind discard">버렸어요</span>
                  {d.discarded.map((x) => (x.reason ? `${x.name}(${x.reason})` : x.name)).join(', ')}
                </p>
              )}
            </div>
          ))}
        </>
      )}
    </>
  );
}
