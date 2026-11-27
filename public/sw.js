// 오프라인에서도 열리게 하는 작은 서비스 워커.
// - 화면(페이지): 네트워크 먼저, 안 되면 저장해 둔 것 (새 버전이 바로 보이게)
// - 그림·스크립트 등: 저장해 둔 것 먼저 (빌드 파일 이름이 바뀌므로 오래된 것이 남지 않음)
// - /api/ (AI 연결 서버)는 저장하지 않는다

const CACHE = 'fridge-planner-v14'; // 2026-11-27: 시연영상(/demo/demo.mp4)은 저장하지 않고 그대로 통과 · 2026-11-23: 피클·올리브·딸기잼·머스터드·랜치 드레싱·샐러드 그림을 같은 파일 이름으로 바꿈

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // 영상은 부분 요청(Range)으로 받아서 저장할 수 없다 → 브라우저가 직접 받게 둔다
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.endsWith('.mp4') || req.headers.has('range')) return;

  const save = (res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  };

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(save).catch(() => caches.match(req).then((r) => r ?? caches.match('/'))));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit ?? fetch(req).then(save)));
});
