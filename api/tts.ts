// 오프닝 목소리 서버 함수 (Vercel Functions, GET /api/tts?line=intro)
//
// Fish Audio(https://fish.audio)로 정해진 소개 글만 읽어 mp3로 돌려준다. 키는 Vercel 환경 변수에만 있다.
//   FISH_API_KEY    (필수) Fish Audio 대시보드 → API Keys
//   FISH_VOICE_ID   (선택) 목소리 모델 ID. 없으면 아래 DEFAULT_VOICE(fish.audio 목소리 d58ebc8e…)를 쓴다
//   FISH_MODEL      (선택) 기본 s2.1-pro-free(무료). 계정에서 쓰는 모델 이름이 다르면 바꾼다 (s1 등)
//
// 사용자가 보낸 글은 읽지 않는다. 아래 LINES에 있는 글만 읽으므로 남이 이 주소로 마음대로 음성을 만들 수 없고,
// 응답에 긴 캐시를 걸어 Vercel이 한 번 만든 소리를 다시 쓴다 (Fish 사용량을 거의 쓰지 않음).
// 이 파일은 다른 파일을 import하지 않는다 (api/read.ts와 같은 방식). 글을 바꾸면 src/ui/OpeningView.tsx의 글과 맞춘다.

/** fish.audio 목소리 (2026-11-20 사용자가 고름). 모델 ID는 공개된 값이라 코드에 둔다. 바꾸려면 환경 변수 FISH_VOICE_ID */
export const DEFAULT_VOICE = 'd58ebc8e84ee49ed96b08e3dc8051bbc';

/** 크레딧 없이 쓸 수 있는 무료 모델 (Fish가 402 응답으로 알려 준 이름). 유료 모델을 쓰려면 환경 변수 FISH_MODEL (s2-pro 등) */
export const DEFAULT_MODEL = 's2.1-pro-free';

export const LINES: Record<string, string> = {
  intro:
    '안녕하세요, 저는 냉집사예요! 깜빡 잊은 재료가 없도록, 급한 재료부터 이번 주 끼니에 넣어 드릴게요. 장 본 걸 올려 주면 나머지는 제가 정리할게요.',
  // 시연영상 안내 목소리 (2026-11-27): public/demo/demo.mp4의 장면마다 한 줄. 영상에 입힐 소리를 받는 데만 쓴다.
  demo01: '안녕하세요, 저는 냉집사예요. 급한 재료부터 챙겨 드릴게요.',
  demo02: '카카오로 시작해도 되고, 로그인 없이 둘러봐도 돼요.',
  demo03: '장 본 영수증이나 주문 화면을 올려 보세요.',
  demo04: '재료와 소비기한을 알아서 읽어 줘요.',
  demo05: '냉장고에 넣으면 이번 주 식단이 바로 짜여요.',
  demo06: '냉장고 사진을 올리면 안에 있는 재료를 한 번에 담아 줘요.',
  demo07: '오늘내일 상하는 재료는 맨 위에 모아 보여 드려요.',
  demo08: '소비기한은 밀어서 직접 고칠 수 있어요.',
  demo09: '요리 쇼츠 링크를 붙이면 필요한 재료를 확인해 줘요.',
  demo10: '없는 재료는 비슷한 재료로 바꿔 쓰자고 제안해요.',
  demo11: '그 메뉴를 식단에 넣고, 살 것만 장보기 목록에 담아요.',
  demo12: '만든 요리는 커뮤니티에 올려서 이웃과 나눠요.',
  demo13: '나의 활동에서 먹은 것과 버린 것도 한눈에 봐요.',
};

export interface TtsDeps {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
}

export async function handleTts(request: Request, deps: TtsDeps): Promise<Response> {
  const line = new URL(request.url).searchParams.get('line') ?? '';
  const text = Object.hasOwn(LINES, line) ? LINES[line] : undefined;
  if (!text) return Response.json({ ok: false, error: 'unknown-line' }, { status: 404 });
  const key = deps.env.FISH_API_KEY;
  const voice = deps.env.FISH_VOICE_ID || DEFAULT_VOICE;
  if (!key) return Response.json({ ok: false, error: 'not-configured' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  try {
    const res = await deps.fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', model: deps.env.FISH_MODEL || DEFAULT_MODEL },
      body: JSON.stringify({ text, reference_id: voice, format: 'mp3', latency: 'normal' }),
    });
    if (!res.ok) {
      // 이유를 알 수 있게 Fish가 돌려준 상태 번호와 짧은 설명만 알려 준다 (키는 담지 않는다)
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      console.error('Fish Audio 실패:', res.status, detail);
      return Response.json({ ok: false, error: 'tts-failed', upstream: res.status, detail }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }
    return new Response(await res.arrayBuffer(), {
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=86400, s-maxage=31536000' },
    });
  } catch (e) {
    console.error('Fish Audio 연결 실패:', e);
    return Response.json({ ok: false, error: 'tts-failed' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}

/** Vercel 진입점 */
export const GET = (request: Request) => handleTts(request, { env: process.env, fetch });
