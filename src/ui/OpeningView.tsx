// 오프닝 화면: 처음 열었을 때 한 번만, 마스코트가 서비스를 소개한다. 시작하기를 누르면 홈(첫 사용 안내 카드)으로.

export function OpeningView({ onStart }: { onStart: () => void }) {
  return (
    <div className="opening">
      <div className="opening-body">
        <img className="opening-mascot" alt="" src="/mascot.webp" />
        <h1>안녕하세요, 저는 냉장고예요!</h1>
        <p>깜빡 잊은 재료가 없도록, 급한 재료부터 이번 주 끼니에 넣어 드릴게요.</p>
        <p>장 본 걸 올려 주면 나머지는 제가 정리할게요.</p>
      </div>
      <button className="cta" onClick={onStart}>
        시작하기
      </button>
    </div>
  );
}
