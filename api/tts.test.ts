import { describe, expect, it, vi } from 'vitest';
import { handleTts, LINES } from './tts';

const req = (q: string) => new Request(`https://x.test/api/tts${q}`);
const env = { FISH_API_KEY: 'k', FISH_VOICE_ID: 'v' };

describe('/api/tts', () => {
  it('정해진 글만 읽는다 (모르는 line은 404, 호출 안 함)', async () => {
    const f = vi.fn();
    const res = await handleTts(req('?line=hello'), { env, fetch: f as never });
    expect(res.status).toBe(404);
    expect(f).not.toHaveBeenCalled();
    expect((await handleTts(req('?line=toString'), { env, fetch: f as never })).status).toBe(404);
  });
  it('키가 없으면 503', async () => {
    const res = await handleTts(req('?line=intro'), { env: {}, fetch: vi.fn() as never });
    expect(res.status).toBe(503);
  });
  it('Fish Audio에 정해진 글·목소리로 부르고 mp3를 캐시와 함께 돌려준다', async () => {
    const f = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    const res = await handleTts(req('?line=intro&text=남의글'), { env: { ...env, FISH_MODEL: 's1' }, fetch: f as never });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(res.headers.get('cache-control')).toContain('s-maxage');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.fish.audio/v1/tts');
    expect((init.headers as Record<string, string>).model).toBe('s1');
    const body = JSON.parse(init.body as string);
    expect(body.text).toBe(LINES.intro);
    expect(body.reference_id).toBe('v');
    expect(new Uint8Array(await res.arrayBuffer())).toHaveLength(3);
  });
  it('Fish Audio가 실패하면 502 (캐시 안 함)', async () => {
    const res = await handleTts(req('?line=intro'), { env, fetch: (async () => new Response('no', { status: 401 })) as never });
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
