// 오프닝 목소리 서버 함수 (Vercel Functions, GET /api/tts?line=intro)
//
// Fish Audio(https://fish.audio)로 정해진 소개 글만 읽어 mp3로 돌려준다. 키는 Vercel 환경 변수에만 있다.
//   FISH_API_KEY    (필수) Fish Audio 대시보드 → API Keys
//   FISH_VOICE_ID   (선택) 목소리 모델 ID. 없으면 아래 DEFAULT_VOICE("Gaby Perez의 명랑한 어린이")를 쓴다
//   FISH_MODEL      (선택) 기본 s2.1-pro-free(무료). 계정에서 쓰는 모델 이름이 다르면 바꾼다 (s1 등)
//
// 사용자가 보낸 글은 읽지 않는다. 아래 LINES에 있는 글만 읽으므로 남이 이 주소로 마음대로 음성을 만들 수 없고,
// 응답에 긴 캐시를 걸어 Vercel이 한 번 만든 소리를 다시 쓴다 (Fish 사용량을 거의 쓰지 않음).
// 이 파일은 다른 파일을 import하지 않는다 (api/read.ts와 같은 방식). 글을 바꾸면 src/ui/OpeningView.tsx의 글과 맞춘다.

/** fish.audio 목소리 "명랑한 어린이" (Gaby Perez). 모델 ID는 공개된 값이라 코드에 둔다. 바꾸려면 환경 변수 FISH_VOICE_ID */
export const DEFAULT_VOICE = 'bfc6cdc40a6340c085111c3882aaa951';

/** 크레딧 없이 쓸 수 있는 무료 모델 (Fish가 402 응답으로 알려 준 이름). 유료 모델을 쓰려면 환경 변수 FISH_MODEL (s2-pro 등) */
export const DEFAULT_MODEL = 's2.1-pro-free';

export const LINES: Record<string, string> = {
  intro:
    '안녕하세요, 저는 냉집사예요! 깜빡 잊은 재료가 없도록, 급한 재료부터 이번 주 끼니에 넣어 드릴게요. 장 본 걸 올려 주면 나머지는 제가 정리할게요.',
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
