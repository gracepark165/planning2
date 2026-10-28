import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// 설치형 웹앱(PWA): 배포 빌드에서만 서비스 워커를 켠다 (개발 중에는 바뀐 코드가 바로 보이게)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // 등록 실패해도 앱은 그대로 동작
    });
  });
}
