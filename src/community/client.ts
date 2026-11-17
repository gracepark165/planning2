// 브라우저에서 커뮤니티 서버 함수(/api/community)와 카카오 로그인(/api/auth)을 부른다.
// 서버에 저장소가 아직 없으면(not-configured) 부른 쪽이 예시 글로 보여준다.

import type {
  ShareStatus,
  Topic,
  CommentView,
  CommunityErrorCode,
  CommunityRequest,
  CommunityResponse,
  MyStats,
  PostView,
  Profile,
} from '../../api/community';

export type { CommentView, MyStats, PostView, Profile };
export type { ShareStatus, Topic } from '../../api/community';
export { AVATARS, LIMITS, SHARE_STATUSES, TOPICS } from '../../api/community';

export type CommunityFailure = CommunityErrorCode | 'offline';
export type Result<T> = { ok: true; data: T } | { ok: false; reason: CommunityFailure };

const ENDPOINT = '/api/community';
const TIMEOUT_MS = 20_000;

/** 로그인은 쿠키(api/auth.ts)로 한다. 같은 사이트 요청이라 쿠키가 같이 간다. */
async function call(req: CommunityRequest): Promise<Result<CommunityResponse & { ok: true }>> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      credentials: 'same-origin',
      signal: ctrl.signal,
    });
    const body = (await res.json().catch(() => null)) as CommunityResponse | null;
    if (!body) return { ok: false, reason: res.status === 404 ? 'not-configured' : 'server' };
    if (!body.ok) return { ok: false, reason: body.error };
    return { ok: true, data: body };
  } catch {
    return { ok: false, reason: 'offline' };
  } finally {
    window.clearTimeout(timer);
  }
}

const pick = <T>(r: Result<CommunityResponse & { ok: true }>, f: (d: Record<string, unknown>) => T): Result<T> =>
  r.ok ? { ok: true, data: f(r.data as unknown as Record<string, unknown>) } : r;

export const community = {
  feed: async (topic?: string, before?: number) =>
    pick(await call({ action: 'feed', ...(topic ? { topic: topic as Topic } : {}), ...(before ? { before } : {}) }), (d) => ({
      posts: d.posts as PostView[],
      next: d.next as number | undefined,
    })),
  ranking: async () => pick(await call({ action: 'ranking' }), (d) => d.posts as PostView[]),
  post: async (id: string) =>
    pick(await call({ action: 'post', id }), (d) => ({ post: d.post as PostView, comments: d.comments as CommentView[] })),
  create: async (p: { topic: string; text: string; menu?: string; items?: string[]; photo?: string }) =>
    pick(await call({ action: 'create', ...p } as CommunityRequest), (d) => d.post as PostView),
  like: async (id: string) => pick(await call({ action: 'like', id }), (d) => (d.posts as PostView[])[0]),
  /** parentId: 답글을 달 댓글 (없으면 그냥 댓글) */
  comment: async (id: string, text: string, parentId?: string) =>
    pick(await call({ action: 'comment', id, text, ...(parentId ? { parentId } : {}) }), () => true),
  status: async (id: string, status: string) => pick(await call({ action: 'status', id, status: status as ShareStatus }), () => true),
  remove: async (id: string) => pick(await call({ action: 'delete', id }), () => true),
  me: async () =>
    pick(await call({ action: 'me' }), (d) => ({ profile: d.profile as Profile, stats: d.stats as MyStats, authorId: d.authorId as string })),
  /** photo: 새 사진 data URL / null = 사진 지우기 / 없음 = 그대로 */
  saveProfile: async (profile: Profile, photo?: string | null) =>
    pick(await call({ action: 'profile', profile: { ...profile, ...(photo !== undefined ? { photo } : {}) } } as CommunityRequest), () => true),
};

export const imageUrl = (postId: string) => `${ENDPOINT}?img=${encodeURIComponent(postId)}`;
/** 프로필 사진 주소 (사진이 없으면 undefined → 그림 이모지) */
export const avatarUrl = (author: { id?: string; photoV?: number }) =>
  author.id && author.photoV ? `${ENDPOINT}?avatar=${encodeURIComponent(author.id)}&v=${author.photoV}` : undefined;

export function failureText(reason: CommunityFailure): string {
  switch (reason) {
    case 'not-configured':
      return '커뮤니티 서버를 아직 연결하지 않았어요';
    case 'offline':
      return '인터넷 연결을 확인해 주세요';
    case 'too-many':
      return '오늘은 더 올릴 수 없어요. 내일 다시 올려 주세요';
    case 'login-required':
      return '카카오로 로그인하면 쓸 수 있어요';
    case 'forbidden':
      return '내가 쓴 글만 바꿀 수 있어요';
    case 'not-found':
      return '지워진 글이에요';
    case 'bad-request':
      return '글자 수나 사진을 확인해 주세요';
    default:
      return '잠시 뒤에 다시 해 주세요';
  }
}

// ── 카카오 로그인 (api/auth.ts) ──
export type AuthState = { loggedIn: boolean; nick?: string; configured: boolean };

export async function fetchAuth(): Promise<AuthState | null> {
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"action":"me"}',
      credentials: 'same-origin',
    });
    const b = (await res.json()) as { ok?: boolean; loggedIn?: boolean; nick?: string; configured?: boolean };
    return b.ok ? { loggedIn: !!b.loggedIn, nick: b.nick, configured: !!b.configured } : null;
  } catch {
    return null;
  }
}

/** 카카오 로그인 화면으로 (돌아오면 주소에 ?login=kakao|fail|off) */
export const startKakaoLogin = () => window.location.assign('/api/auth?start=1');

export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"logout"}', credentials: 'same-origin' });
  } catch {
    // 오프라인이어도 화면은 로그아웃으로
  }
}
