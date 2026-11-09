// 브라우저에서 커뮤니티 서버 함수(/api/community)를 부른다.
// 서버에 저장소가 아직 없으면(not-configured) 부른 쪽이 예시 글로 보여준다.

import type {
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
const SECRET_KEY = 'fridge-community-secret';
const TIMEOUT_MS = 20_000;

/** 이 기기의 비밀값. 처음 부를 때 만들고 기기에 둔다 (지우면 내 글을 더는 지울 수 없음). */
export function deviceSecret(): string {
  try {
    const old = localStorage.getItem(SECRET_KEY);
    if (old && old.length >= 32) return old;
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const s = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(SECRET_KEY, s);
    return s;
  } catch {
    // 저장을 못 하는 환경(비공개 창 등): 이번에 연 동안만 쓰는 값
    return (deviceSecret.temp ??= [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join(''));
  }
}
deviceSecret.temp = undefined as string | undefined;

type Req = CommunityRequest extends infer R ? (R extends { secret: string } ? Omit<R, 'secret'> : never) : never;

async function call(req: Req): Promise<Result<CommunityResponse & { ok: true }>> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...req, secret: deviceSecret() }),
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
    pick(await call({ action: 'feed', ...(topic ? { topic: topic as never } : {}), ...(before ? { before } : {}) }), (d) => ({
      posts: d.posts as PostView[],
      next: d.next as number | undefined,
    })),
  ranking: async () => pick(await call({ action: 'ranking' }), (d) => d.posts as PostView[]),
  post: async (id: string) =>
    pick(await call({ action: 'post', id }), (d) => ({ post: d.post as PostView, comments: d.comments as CommentView[] })),
  create: async (p: { topic: string; text: string; menu?: string; items?: string[]; photo?: string }) =>
    pick(await call({ action: 'create', ...p } as Req), (d) => d.post as PostView),
  like: async (id: string) => pick(await call({ action: 'like', id }), (d) => (d.posts as PostView[])[0]),
  comment: async (id: string, text: string) => pick(await call({ action: 'comment', id, text }), () => true),
  status: async (id: string, status: string) => pick(await call({ action: 'status', id, status: status as never }), () => true),
  remove: async (id: string) => pick(await call({ action: 'delete', id }), () => true),
  me: async () =>
    pick(await call({ action: 'me' }), (d) => ({ profile: d.profile as Profile, stats: d.stats as MyStats, authorId: d.authorId as string })),
  saveProfile: async (profile: Profile) => pick(await call({ action: 'profile', profile }), () => true),
};

export const imageUrl = (postId: string) => `${ENDPOINT}?img=${encodeURIComponent(postId)}`;

export function failureText(reason: CommunityFailure): string {
  switch (reason) {
    case 'not-configured':
      return '커뮤니티 서버를 아직 연결하지 않았어요';
    case 'offline':
      return '인터넷 연결을 확인해 주세요';
    case 'too-many':
      return '오늘은 더 올릴 수 없어요. 내일 다시 올려 주세요';
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
