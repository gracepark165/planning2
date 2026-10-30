// 알림 설정 (B-3 A단계): 홈 화면에 추가하는 방법 + 알림 시간.
// 웹앱은 앱이 꺼져 있을 때 보내는 알림이 제한적이라(아이폰은 홈 화면에 추가한 앱만), 먼저 홈 화면에 추가하게 안내한다.
// 알림 시간은 지금은 저장만 한다 (실제로 보내는 것은 B단계).

import { BackButton } from './parts';

/** 고를 수 있는 알림 시간: 오전 7시 ~ 오후 10시, 한 시간 단위 */
const TIMES = Array.from({ length: 16 }, (_, i) => 7 + i).map((h) => ({
  value: `${String(h).padStart(2, '0')}:00`,
  label: h < 12 ? `오전 ${h}시` : h === 12 ? '낮 12시' : `오후 ${h - 12}시`,
}));

interface Props {
  time: string;
  onTime: (time: string) => void;
  onBack: () => void;
}

export function NotifyView({ time, onTime, onBack }: Props) {
  return (
    <>
      <BackButton onClick={onBack} />
      <h1>알림 받는 방법</h1>
      <p className="lead">
        얼른 먹어야 할 재료가 생기면 알려드릴게요. 알림을 받으려면 먼저 이 앱을 홈 화면에 추가해 주세요. 아이폰은 홈 화면에
        추가한 앱에서만 알림을 받을 수 있어요.
      </p>

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

      <div className="eyebrow">알림 시간</div>
      <select value={time} onChange={(e) => onTime(e.target.value)} aria-label="알림 시간" style={{ marginTop: 8 }}>
        {TIMES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <p className="note">지금은 알림 시간만 저장해 둬요. 정해진 시간에 알림을 보내는 기능은 준비 중이에요.</p>
    </>
  );
}
