// 홈 화면에 추가하는 방법 / 알림 시간 설정 (B-3 A단계, 수정명세 v3 V3-3).
// 알림을 보내는 기능은 아직 없으므로 "알림을 받는다"고 약속하지 않는다. 알림 시간은 저장만 한다.

import { useState } from 'react';
import { notifyTimeChoices } from '../rules/notifyTime';
import { BackButton } from './parts';

/** 홈 화면에 추가하는 방법 (아이폰·안드로이드 글 안내) */
export function InstallGuideView({ onBack }: { onBack: () => void }) {
  return (
    <>
      <BackButton onClick={onBack} />
      <h1>홈 화면에 추가하는 방법</h1>
      <p className="lead">홈 화면에 추가하면 앱처럼 바로 열 수 있어요. 알림 기능은 준비 중이에요.</p>

      <div className="card guide">
        <h3>아이폰 (사파리)</h3>
        <ol>
          <li>
            공유 버튼(네모에서 화살표가 나온 모양)을 눌러요. 화면 아래에 안 보이면 주소창 옆 ‘⋯’ 버튼을 먼저 눌러요.
          </li>
          <li>목록에서 ‘홈 화면에 추가’를 눌러요.</li>
          <li>오른쪽 위 ‘추가’를 누르면 끝이에요.</li>
        </ol>
      </div>
      <div className="card guide">
        <h3>안드로이드 (크롬)</h3>
        <ol>
          <li>오른쪽 위 메뉴(⋮)를 눌러요.</li>
          <li>‘홈 화면에 추가’ 또는 ‘앱 설치’를 눌러요.</li>
          <li>‘추가’를 누르면 끝이에요.</li>
        </ol>
      </div>
    </>
  );
}

interface TimeProps {
  time: string;
  onTime: (time: string) => void;
  onInstallGuide: () => void;
  onBack: () => void;
}

/** 알림 시간 설정: 오후 5~9시 5개 + "다른 시간" (지금은 저장만) */
export function NotifyTimeView({ time, onTime, onInstallGuide, onBack }: TimeProps) {
  const { main, more, startOpen } = notifyTimeChoices(time);
  const [open, setOpen] = useState(startOpen);
  const button = (t: { value: string; label: string }) => (
    <button key={t.value} className={time === t.value ? 'on' : ''} aria-pressed={time === t.value} onClick={() => onTime(t.value)}>
      {t.label}
    </button>
  );

  return (
    <>
      <BackButton onClick={onBack} />
      <h1>알림 시간 설정</h1>
      <p className="lead">정해진 시간에 알림을 보내는 기능은 준비 중이에요. 시간만 미리 정해 둘 수 있어요.</p>

      <div className="seg wrap time-choices">{main.map(button)}</div>
      {open ? (
        <div className="seg wrap time-choices">{more.map(button)}</div>
      ) : (
        <button className="note" style={{ textDecoration: 'underline' }} onClick={() => setOpen(true)}>
          다른 시간
        </button>
      )}

      <button className="sample-btn" style={{ marginTop: 24 }} onClick={onInstallGuide}>
        홈 화면에 추가하는 방법 보기<small>홈 화면에 추가하면 앱처럼 바로 열 수 있어요</small>
      </button>
    </>
  );
}
