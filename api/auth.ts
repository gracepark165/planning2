// 카카오 로그인 서버 함수 (Vercel Functions)
//
//   GET  /api/auth?start=1          → 카카오 로그인 화면으로 보낸다
//   GET  /api/auth?code=…&state=…   → 카카오가 돌려보내는 곳 (리다이렉트 URI). 로그인 쿠키를 굽고 앱으로 돌아간다
//   POST /api/auth { action: 'me' }     → 로그인했는지, 카카오 닉네임
//   POST /api/auth { action: 'logout' } → 로그인 쿠키 지우기
//
// 환경 변수 (Vercel → Settings → Environment Variables)
//   KAKAO_REST_API_KEY   (필수) 카카오 개발자 사이트 → 내 애플리케이션 → 앱 키 → REST API 키
//   KAKAO_CLIENT_SECRET  (선택) 카카오 로그인 → 보안 → Client Secret을 "사용"으로 켰을 때만
//   AUTH_SECRET          (필수) 로그인 쿠키 서명용 아무 긴 글자 (32자 이상). 바꾸면 모두 다시 로그인해야 한다
//
// 로그인은 커뮤니티 글쓰기·공감·댓글에만 쓴다. 냉장고 재료는 기기에만 저장한다.
// 카카오에서 받는 건 회원번호와 닉네임뿐이다 (프로필 사진·이메일은 받지 않는다).
// 이 파일은 다른 파일을 import하지 않는다 (api/read.ts와 같은 방식). 쿠키 확인은 api/community.ts에도 같은 코드가 있다.

export const SESSION_COOKIE = 'fs_session';
const STATE_COOKIE = 'fs_kstate';
const SESSION_DAYS = 30;

export interface Session {
  /** 'kakao:회원번호' (개발 서버의 시험 로그인은 'dev:…') */
  uid: string;
  /** 카카오 닉네임 (커뮤니티 처음 프로필 이름) */
  nick: string;
  /** 만료 시각 (ms) */
  exp: number;
}

export type AuthMe = { ok: true; loggedIn: false; configured: boolean } | { ok: true; loggedIn: true; nick: string; configured: true };

// ───────────────────────── 서명 쿠키 ─────────────────────────

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export async function signSession(s: Session, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(s)));
  return `${body}.${b64url(await hmac(secret, body))}`;
}

/** 쿠키 값 → 세션. 서명이 틀리거나 만료됐으면 null */
export async function readSession(token: string | undefined, secret: string | undefined, now: number): Promise<Session | null> {
  if (!token || !secret) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = b64url(await hmac(secret, body));
  if (want.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Session;
    return typeof s.uid === 'string' && typeof s.exp === 'number' && s.exp > now ? s : null;
  } catch {
    return null;
  }
}

export function cookieOf(header: string | null, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

const cookie = (name: string, value: string, maxAge: number, secure: boolean) =>
  `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;

// ───────────────────────── 처리 ─────────────────────────

export interface AuthDeps {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  now: () => number;
  random?: () => string;
}

const randomState = () => b64url(crypto.getRandomValues(new Uint8Array(16)));
const nickOf = (raw: unknown) => (typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 12) : '');

const redirect = (to: string, cookies: string[] = []) => {
  const headers = new Headers({ Location: to, 'Cache-Control': 'no-store' });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers });
};

/** 개발 서버에서만: 카카오 키 없이 시험 로그인 (배포에는 COMMUNITY_DEV_MEMORY가 없다) */
const devLogin = (env: AuthDeps['env']) => env.COMMUNITY_DEV_MEMORY === '1' && !env.KAKAO_REST_API_KEY;

export async function handleAuthGet(request: Request, deps: AuthDeps): Promise<Response> {
  const { env, now } = deps;
  const url = new URL(request.url);
  const secure = url.protocol === 'https:';
  const redirectUri = `${url.origin}/api/auth`;
  const secret = env.AUTH_SECRET;
  const kakaoKey = env.KAKAO_REST_API_KEY;
  const back = (result: 'kakao' | 'fail' | 'off', cookies: string[] = []) =>
    redirect(`/?login=${result}`, [...cookies, cookie(STATE_COOKIE, '', 0, secure)]);

  // 1) 로그인 시작
  if (url.searchParams.has('start')) {
    if (devLogin(env)) {
      const s: Session = { uid: 'dev:tester', nick: '시험 사용자', exp: now() + SESSION_DAYS * 86_400_000 };
      return back('kakao', [cookie(SESSION_COOKIE, await signSession(s, secret ?? 'dev-secret-dev-secret-dev-secret'), SESSION_DAYS * 86400, secure)]);
    }
    if (!kakaoKey || !secret) return back('off');
    const state = (deps.random ?? randomState)();
    const to = new URL('https://kauth.kakao.com/oauth/authorize');
    to.searchParams.set('client_id', kakaoKey);
    to.searchParams.set('redirect_uri', redirectUri);
    to.searchParams.set('response_type', 'code');
    to.searchParams.set('state', state);
    return redirect(to.toString(), [cookie(STATE_COOKIE, state, 600, secure)]);
  }

  // 2) 카카오가 돌려보냄
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state || !kakaoKey || !secret) return back(kakaoKey && secret ? 'fail' : 'off');
  if (cookieOf(request.headers.get('cookie'), STATE_COOKIE) !== state) return back('fail');
  try {
    const form = new URLSearchParams({ grant_type: 'authorization_code', client_id: kakaoKey, redirect_uri: redirectUri, code });
    if (env.KAKAO_CLIENT_SECRET) form.set('client_secret', env.KAKAO_CLIENT_SECRET);
    const tokenRes = await deps.fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: form.toString(),
    });
    if (!tokenRes.ok) return back('fail');
    const { access_token } = (await tokenRes.json()) as { access_token?: string };
    if (!access_token) return back('fail');
    const meRes = await deps.fetch('https://kapi.kakao.com/v2/user/me', { headers: { Authorization: `Bearer ${access_token}` } });
    if (!meRes.ok) return back('fail');
    const me = (await meRes.json()) as { id?: number | string; properties?: { nickname?: string }; kakao_account?: { profile?: { nickname?: string } } };
    if (me.id === undefined || me.id === null) return back('fail');
    const s: Session = {
      uid: `kakao:${me.id}`,
      nick: nickOf(me.kakao_account?.profile?.nickname) || nickOf(me.properties?.nickname) || '이웃',
      exp: now() + SESSION_DAYS * 86_400_000,
    };
    return back('kakao', [cookie(SESSION_COOKIE, await signSession(s, secret), SESSION_DAYS * 86400, secure)]);
  } catch (e) {
    console.error('카카오 로그인 실패:', e);
    return back('fail');
  }
}

export async function handleAuthPost(request: Request, deps: AuthDeps): Promise<Response> {
  const secure = new URL(request.url).protocol === 'https:';
  let body: { action?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // 빈 몸통은 me로 본다
  }
  const configured = !!(deps.env.KAKAO_REST_API_KEY && deps.env.AUTH_SECRET) || devLogin(deps.env);
  if (body.action === 'logout') {
    return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookie(SESSION_COOKIE, '', 0, secure), 'Cache-Control': 'no-store' } });
  }
  const secret = deps.env.AUTH_SECRET ?? (devLogin(deps.env) ? 'dev-secret-dev-secret-dev-secret' : undefined);
  const s = await readSession(cookieOf(request.headers.get('cookie'), SESSION_COOKIE), secret, deps.now());
  const out: AuthMe = s ? { ok: true, loggedIn: true, nick: s.nick, configured: true } : { ok: true, loggedIn: false, configured };
  return Response.json(out, { headers: { 'Cache-Control': 'no-store' } });
}

const deps = (): AuthDeps => ({ env: process.env, fetch, now: Date.now });

/** Vercel 진입점 */
export const GET = (request: Request) => handleAuthGet(request, deps());
export const POST = (request: Request) => handleAuthPost(request, deps());
