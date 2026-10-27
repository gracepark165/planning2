// 1단계 임시 화면: 데이터가 제대로 불러와지는지만 확인한다. 3단계에서 냉장고 홈으로 바꾼다.
import { makeSampleInventory } from '../data/sampleInventory';
import { daysBetween, todayKey } from '../rules/date';

export function App() {
  const today = todayKey();
  const inv = makeSampleInventory(today);
  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20 }}>냉장고 플래너 (준비 중)</h1>
      <p>샘플 재료 {inv.length}개를 불러왔어요.</p>
      <ul>
        {inv.map((i) => (
          <li key={i.id}>
            {i.name} · {i.qty} · {i.location} · 남은 {daysBetween(today, i.expiresAt)}일 · 들어온 지{' '}
            {daysBetween(i.enteredAt, today)}일
          </li>
        ))}
      </ul>
    </main>
  );
}
