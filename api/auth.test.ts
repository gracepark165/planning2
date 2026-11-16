import { describe, expect, it } from 'vitest';
import { handleAuthGet, handleAuthPost, readSession, SESSION_COOKIE, type AuthDeps } from './auth';

const NOW = Date.UTC(2026, 10, 16);
const ENV = { KAKAO_REST_API_KEY: 'rest-key', AUTH_SECRET: 's'.repeat(40) };
const ORIGIN = 'https://planning2-gold.vercel.app';

/** 카카오 서버 흉내: 토큰 → 사용자 정보 */
function kakaoFetch(calls: { url: string; body?: string }[], me: object = { id: 42, kakao_account: { profile: { nickname: '냉집사' } } }) {
  return (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body as string | undefined });
    if (String(url).includes('/oauth/token')) return Response.json({ access_token: 'tok' });
    return Response.json(me);
  }) as typeof fetch;
}

const deps = (env: Record<string, string | undefined> = ENV, f: typeof fetch = kakaoFetch([])): AuthDeps => ({
  env,
  fetch: f,
  now: () => NOW,
  random: () => 'STATE123',
});

const cookies = (res: Response) => res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
const sessionCookie = (res: Response) =>
  decodeURIComponent(cookies(res).find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.split(';')[0].split('=').slice(1).join('=') ?? '');

describe('카카오 로그인', () => {
  it('시작: 카카오 로그인 화면으로 보내고 state 쿠키를 굽는다', async () => {
    const res = await handleAuthGet(new Request(`${ORIGIN}/api/auth?start=1`), deps());
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get('location')!);
    expect(to.origin + to.pathname).toBe('https://kauth.kakao.com/oauth/authorize');
    expect(to.searchParams.get('client_id')).toBe('rest-key');
    expect(to.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth`);
    expect(to.searchParams.get('state')).toBe('STATE123');
    expect(cookies(res).join()).toContain('fs_kstate=STATE123');
    expect(cookies(res).join()).toContain('HttpOnly');
  });

  it('돌아옴: 코드로 토큰을 받고 회원번호·닉네임으로 로그인 쿠키를 굽는다', async () => {
    const calls: { url: string; body?: string }[] = [];
    const req = new Request(`${ORIGIN}/api/auth?code=CODE&state=STATE123`, { headers: { cookie: 'fs_kstate=STATE123' } });
    const res = await handleAuthGet(req, deps(ENV, kakaoFetch(calls)));
    expect(res.headers.get('location')).toBe('/?login=kakao');
    expect(calls[0].url).toBe('https://kauth.kakao.com/oauth/token');
    expect(calls[0].body).toContain('code=CODE');
    expect(calls[0].body).toContain(`redirect_uri=${encodeURIComponent(`${ORIGIN}/api/auth`)}`);
    const s = await readSession(sessionCookie(res), ENV.AUTH_SECRET, NOW);
    expect(s).toMatchObject({ uid: 'kakao:42', nick: '냉집사' });
    expect(cookies(res).join()).toContain('Secure');
  });

  it('state가 다르면 (다른 사이트에서 보낸 요청) 로그인하지 않는다', async () => {
    const req = new Request(`${ORIGIN}/api/auth?code=CODE&state=STATE123`, { headers: { cookie: 'fs_kstate=OTHER' } });
    const res = await handleAuthGet(req, deps());
    expect(res.headers.get('location')).toBe('/?login=fail');
    expect(sessionCookie(res)).toBe('');
  });

  it('카카오 키·AUTH_SECRET이 없으면 off로 돌아간다', async () => {
    const res = await handleAuthGet(new Request(`${ORIGIN}/api/auth?start=1`), deps({}));
    expect(res.headers.get('location')).toBe('/?login=off');
    const me = (await (await handleAuthPost(new Request(`${ORIGIN}/api/auth`, { method: 'POST', body: '{"action":"me"}' }), deps({}))).json()) as object;
    expect(me).toEqual({ ok: true, loggedIn: false, configured: false });
  });

  it('닉네임이 없으면 "이웃", 12자로 자른다', async () => {
    const req = new Request(`${ORIGIN}/api/auth?code=C&state=STATE123`, { headers: { cookie: 'fs_kstate=STATE123' } });
    const noNick = await handleAuthGet(req, deps(ENV, kakaoFetch([], { id: 7 })));
    expect((await readSession(sessionCookie(noNick), ENV.AUTH_SECRET, NOW))?.nick).toBe('이웃');
    const long = await handleAuthGet(req.clone(), deps(ENV, kakaoFetch([], { id: 8, properties: { nickname: '가나다라마바사아자차카타파하' } })));
    expect((await readSession(sessionCookie(long), ENV.AUTH_SECRET, NOW))?.nick).toBe('가나다라마바사아자차카타');
  });

  it('me: 쿠키가 있으면 로그인, logout은 쿠키를 지운다', async () => {
    const req = new Request(`${ORIGIN}/api/auth?code=C&state=STATE123`, { headers: { cookie: 'fs_kstate=STATE123' } });
    const token = sessionCookie(await handleAuthGet(req, deps()));
    const me = await handleAuthPost(
      new Request(`${ORIGIN}/api/auth`, { method: 'POST', body: '{"action":"me"}', headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` } }),
      deps(),
    );
    expect(await me.json()).toEqual({ ok: true, loggedIn: true, nick: '냉집사', configured: true });
    const out = await handleAuthPost(new Request(`${ORIGIN}/api/auth`, { method: 'POST', body: '{"action":"logout"}' }), deps());
    expect(cookies(out).join()).toContain(`${SESSION_COOKIE}=; `);
    expect(cookies(out).join()).toContain('Max-Age=0');
  });

  it('개발 서버(카카오 키 없음)에서는 시험 로그인, 배포에서는 안 된다', async () => {
    const dev = await handleAuthGet(new Request('http://localhost:5179/api/auth?start=1'), deps({ COMMUNITY_DEV_MEMORY: '1' }));
    expect(dev.headers.get('location')).toBe('/?login=kakao');
    expect(sessionCookie(dev)).not.toBe('');
    const prod = await handleAuthGet(new Request(`${ORIGIN}/api/auth?start=1`), deps({ AUTH_SECRET: ENV.AUTH_SECRET }));
    expect(prod.headers.get('location')).toBe('/?login=off');
  });
});
