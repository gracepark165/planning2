// 커뮤니티 서버 함수 (Vercel Functions, POST /api/community · 사진은 GET /api/community?img=ID)
//
// 글은 모든 사용자가 같이 본다. 저장소는 Upstash Redis (Vercel → Storage에서 연결하면 환경 변수가 자동으로 들어온다).
//   KV_REST_API_URL / KV_REST_API_TOKEN          (Vercel 연결 이름)
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (Upstash 기본 이름) — 둘 중 하나만 있으면 된다.
// 저장소가 없으면 { ok: false, error: 'not-configured' }를 돌려주고, 앱은 예시 글로 보여준다.
//
// 로그인은 없다. 앱이 기기마다 만든 비밀값(secret)을 보내면 서버가 해시로 작성자 id를 만든다.
// 같은 비밀값을 가진 기기만 그 글을 지우거나 나눔 상태를 바꿀 수 있다.
//
// 배포 때 다른 파일을 불러오다 깨지지 않도록 이 파일은 다른 파일을 import하지 않는다 (api/read.ts와 같은 방식).

// ───────────────────────── 타입 (앱도 같이 씀) ─────────────────────────

export type Topic = 'meal' | 'share' | 'tip';
export const TOPICS: readonly Topic[] = ['meal', 'share', 'tip'];
export type ShareStatus = '나눔 중' | '예약 중' | '나눔 완료';
export const SHARE_STATUSES: readonly ShareStatus[] = ['나눔 중', '예약 중', '나눔 완료'];
export const AVATARS = ['🥕', '🍅', '🥦', '🧅', '🍳', '🍙', '🥟', '🐰', '🐻', '🐱', '🐶', '🦊'] as const;

export interface Profile {
  nick: string;
  avatar: string;
  /** 동네 (나눔 글에 보임). 비워 둬도 된다 */
  area: string;
}

export interface AuthorView extends Profile {
  id: string;
}

export interface PostView {
  id: string;
  author: AuthorView;
  topic: Topic;
  text: string;
  /** 끼니 인증: 만든 메뉴 이름 */
  menu?: string;
  /** 나눔·끼니 인증: 재료 이름들 */
  items?: string[];
  hasPhoto: boolean;
  /** 나눔 글만 */
  status?: ShareStatus;
  createdAt: number;
  likes: number;
  liked: boolean;
  comments: number;
  mine: boolean;
}

export interface CommentView {
  id: string;
  author: AuthorView;
  text: string;
  createdAt: number;
  mine: boolean;
}

export interface MyStats {
  /** 이번 주(최근 7일) 쓴 글 */
  weekPosts: number;
  /** 이번 주 글이 받은 공감 */
  weekLikes: number;
  /** 지금까지 쓴 글 */
  totalPosts: number;
}

export type CommunityRequest =
  | { action: 'feed'; secret: string; topic?: Topic; before?: number }
  | { action: 'ranking'; secret: string }
  | { action: 'post'; secret: string; id: string }
  | { action: 'create'; secret: string; topic: Topic; text: string; menu?: string; items?: string[]; photo?: string }
  | { action: 'like'; secret: string; id: string }
  | { action: 'comment'; secret: string; id: string; text: string }
  | { action: 'status'; secret: string; id: string; status: ShareStatus }
  | { action: 'delete'; secret: string; id: string }
  | { action: 'me'; secret: string }
  | { action: 'profile'; secret: string; profile: Profile };

export type CommunityErrorCode = 'not-configured' | 'bad-request' | 'not-found' | 'forbidden' | 'too-many' | 'server';

export type CommunityResponse =
  | { ok: true; posts: PostView[]; next?: number }
  | { ok: true; post: PostView; comments: CommentView[] }
  | { ok: true; profile: Profile; stats: MyStats; authorId: string }
  | { ok: true; done: true }
  | { ok: false; error: CommunityErrorCode };

// ───────────────────────── 제한 ─────────────────────────

export const LIMITS = {
  text: 500,
  comment: 200,
  menu: 40,
  item: 20,
  items: 10,
  nick: 12,
  area: 20,
  /** 사진 data URL 최대 길이 (앱이 640px JPEG로 줄여서 보낸다) */
  photo: 400_000,
  postsPerDay: 20,
  commentsPerDay: 100,
  pageSize: 20,
  /** 랭킹: 최근 7일 글 중 공감 많은 순 */
  rankingDays: 7,
  rankingSize: 3,
} as const;

const DAY = 86_400_000;

// ───────────────────────── 저장소 ─────────────────────────

export type Cmd = (string | number)[];
/** Redis 명령 여러 개를 한 번에 실행한다 (결과는 명령 순서대로) */
export interface Store {
  exec(cmds: Cmd[]): Promise<unknown[]>;
}

/** Upstash Redis REST (파이프라인) */
export function restStore(url: string, token: string, fetchFn: typeof fetch): Store {
  return {
    async exec(cmds) {
      if (!cmds.length) return [];
      const res = await fetchFn(`${url.replace(/\/$/, '')}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cmds.map((c) => c.map(String))),
      });
      if (!res.ok) throw new Error(`redis ${res.status}`);
      const out = (await res.json()) as { result?: unknown; error?: string }[];
      return out.map((r) => {
        if (r.error) throw new Error(`redis: ${r.error}`);
        return r.result;
      });
    },
  };
}

/** 메모리 저장소: 테스트와 내 컴퓨터 개발 서버용. 쓰는 명령만 흉내 낸다. */
export function memoryStore(): Store {
  const str = new Map<string, string>();
  const zsets = new Map<string, Map<string, number>>();
  const sets = new Map<string, Set<string>>();
  const lists = new Map<string, string[]>();
  const z = (k: string) => zsets.get(k) ?? zsets.set(k, new Map()).get(k)!;
  const s = (k: string) => sets.get(k) ?? sets.set(k, new Set()).get(k)!;
  const l = (k: string) => lists.get(k) ?? lists.set(k, []).get(k)!;
  const bound = (v: string | number, isMax: boolean) => {
    const t = String(v);
    if (t === '+inf') return { n: Infinity, ex: false };
    if (t === '-inf') return { n: -Infinity, ex: false };
    if (t.startsWith('(')) return { n: Number(t.slice(1)), ex: true };
    return { n: Number(t), ex: false, isMax };
  };
  const run = (c: Cmd): unknown => {
    const [name, ...a] = c;
    const k = String(a[0]);
    switch (String(name).toUpperCase()) {
      case 'GET':
        return str.get(k) ?? null;
      case 'SET':
        str.set(k, String(a[1]));
        return 'OK';
      case 'DEL':
        return a.reduce<number>((n, key) => {
          const kk = String(key);
          const had = str.delete(kk) || zsets.delete(kk) || sets.delete(kk) || lists.delete(kk);
          return n + (had ? 1 : 0);
        }, 0);
      case 'INCR': {
        const v = Number(str.get(k) ?? 0) + 1;
        str.set(k, String(v));
        return v;
      }
      case 'EXPIRE':
        return 1;
      case 'ZADD':
        z(k).set(String(a[2]), Number(a[1]));
        return 1;
      case 'ZREM':
        return z(k).delete(String(a[1])) ? 1 : 0;
      case 'ZCARD':
        return z(k).size;
      case 'ZREVRANGEBYSCORE': {
        const max = bound(a[1], true);
        const min = bound(a[2], false);
        const off = a[3] === 'LIMIT' ? Number(a[4]) : 0;
        const cnt = a[3] === 'LIMIT' ? Number(a[5]) : Infinity;
        return [...z(k).entries()]
          .filter(([, sc]) => (max.ex ? sc < max.n : sc <= max.n) && (min.ex ? sc > min.n : sc >= min.n))
          .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? 1 : -1))
          .slice(off, off + cnt)
          .map(([m]) => m);
      }
      case 'SADD':
        return s(k).has(String(a[1])) ? 0 : (s(k).add(String(a[1])), 1);
      case 'SREM':
        return s(k).delete(String(a[1])) ? 1 : 0;
      case 'SCARD':
        return s(k).size;
      case 'SISMEMBER':
        return s(k).has(String(a[1])) ? 1 : 0;
      case 'RPUSH':
        return l(k).push(String(a[1]));
      case 'LLEN':
        return l(k).length;
      case 'LRANGE': {
        const list = l(k);
        const end = Number(a[2]) < 0 ? list.length + Number(a[2]) + 1 : Number(a[2]) + 1;
        return list.slice(Number(a[1]), end);
      }
      default:
        throw new Error(`memoryStore: ${String(name)} 명령은 없어요`);
    }
  };
  return { exec: async (cmds) => cmds.map(run) };
}

/** 환경 변수로 저장소를 고른다. 없으면 undefined (= 연결 전) */
export function storeFromEnv(env: Record<string, string | undefined>, fetchFn: typeof fetch): Store | undefined {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? restStore(url, token, fetchFn) : undefined;
}

// ───────────────────────── 처리 ─────────────────────────

interface StoredPost {
  id: string;
  authorId: string;
  topic: Topic;
  text: string;
  menu?: string;
  items?: string[];
  hasPhoto: boolean;
  status?: ShareStatus;
  createdAt: number;
}
interface StoredComment {
  id: string;
  authorId: string;
  text: string;
  createdAt: number;
}

export interface Deps {
  store: Store | undefined;
  now: () => number;
  /** 글·댓글 id */
  newId?: () => string;
}

const K = {
  post: (id: string) => `post:${id}`,
  img: (id: string) => `img:${id}`,
  feed: (topic?: Topic) => (topic ? `feed:${topic}` : 'feed:all'),
  likes: (id: string) => `likes:${id}`,
  comments: (id: string) => `cmts:${id}`,
  user: (id: string) => `user:${id}`,
  userPosts: (id: string) => `uposts:${id}`,
  rate: (id: string, kind: string, day: string) => `rl:${id}:${kind}:${day}`,
};

class Fail extends Error {
  constructor(readonly code: CommunityErrorCode) {
    super(code);
  }
}

const str = (v: unknown, max: number, min = 0): string => {
  if (typeof v !== 'string') throw new Fail('bad-request');
  const t = v.trim().replace(/\s+\n/g, '\n');
  if (t.length < min || t.length > max) throw new Fail('bad-request');
  return t;
};
const optStr = (v: unknown, max: number) => (v === undefined || v === null || v === '' ? undefined : str(v, max, 1));
const isTopic = (v: unknown): v is Topic => typeof v === 'string' && (TOPICS as readonly string[]).includes(v);

/** 비밀값 → 작성자 id (앞 16자리 해시). 비밀값은 저장하지 않는다. */
export async function authorIdOf(secret: unknown): Promise<string> {
  if (typeof secret !== 'string' || secret.length < 16 || secret.length > 128) throw new Fail('bad-request');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`fridge-community:${secret}`));
  return [...new Uint8Array(buf)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 처음 쓰는 사람의 기본 프로필: "이웃 + 숫자 4자리" */
export const defaultProfile = (authorId: string): Profile => ({
  nick: `이웃${(parseInt(authorId.slice(0, 6), 16) % 10000).toString().padStart(4, '0')}`,
  avatar: AVATARS[parseInt(authorId.slice(6, 8), 16) % AVATARS.length],
  area: '',
});

const parse = <T>(v: unknown): T | undefined => {
  if (typeof v !== 'string') return undefined;
  try {
    return JSON.parse(v) as T;
  } catch {
    return undefined;
  }
};

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

async function profilesOf(store: Store, ids: string[]): Promise<Map<string, AuthorView>> {
  const uniq = [...new Set(ids)];
  const raw = await store.exec(uniq.map((id) => ['GET', K.user(id)]));
  return new Map(uniq.map((id, i) => [id, { id, ...(parse<Profile>(raw[i]) ?? defaultProfile(id)) }]));
}

/** 글 id들 → 화면에 쓸 글 (공감 수·댓글 수·내가 공감했는지 붙임). 지워진 글은 뺀다. */
async function viewsOf(store: Store, ids: string[], me: string): Promise<PostView[]> {
  if (!ids.length) return [];
  const raw = await store.exec(
    ids.flatMap((id) => [['GET', K.post(id)], ['SCARD', K.likes(id)], ['SISMEMBER', K.likes(id), me], ['LLEN', K.comments(id)]]),
  );
  const posts = ids
    .map((_, i) => ({
      p: parse<StoredPost>(raw[i * 4]),
      likes: Number(raw[i * 4 + 1] ?? 0),
      liked: Number(raw[i * 4 + 2] ?? 0) === 1,
      comments: Number(raw[i * 4 + 3] ?? 0),
    }))
    .filter((x): x is typeof x & { p: StoredPost } => !!x.p);
  const authors = await profilesOf(store, posts.map((x) => x.p.authorId));
  return posts.map(({ p, likes, liked, comments }) => ({
    id: p.id,
    author: authors.get(p.authorId)!,
    topic: p.topic,
    text: p.text,
    ...(p.menu ? { menu: p.menu } : {}),
    ...(p.items?.length ? { items: p.items } : {}),
    hasPhoto: p.hasPhoto,
    ...(p.status ? { status: p.status } : {}),
    createdAt: p.createdAt,
    likes,
    liked,
    comments,
    mine: p.authorId === me,
  }));
}

async function loadPost(store: Store, id: unknown): Promise<StoredPost> {
  if (typeof id !== 'string' || !/^[a-z0-9]{4,32}$/.test(id)) throw new Fail('bad-request');
  const [raw] = await store.exec([['GET', K.post(id)]]);
  const p = parse<StoredPost>(raw);
  if (!p) throw new Fail('not-found');
  return p;
}

async function rateLimit(store: Store, me: string, kind: 'post' | 'comment', now: number) {
  const key = K.rate(me, kind, dayKey(now));
  const [n] = await store.exec([['INCR', key], ['EXPIRE', key, 2 * 86400]]);
  const max = kind === 'post' ? LIMITS.postsPerDay : LIMITS.commentsPerDay;
  if (Number(n) > max) throw new Fail('too-many');
}

export async function handleCommunity(body: unknown, deps: Deps): Promise<{ status: number; body: CommunityResponse }> {
  const { store, now } = deps;
  const newId = deps.newId ?? genId;
  if (!store) return { status: 503, body: { ok: false, error: 'not-configured' } };
  try {
    const b = (body ?? {}) as Record<string, unknown>;
    const me = await authorIdOf(b.secret);
    const t = now();
    switch (b.action) {
      case 'feed': {
        const topic = b.topic === undefined ? undefined : isTopic(b.topic) ? b.topic : undefined;
        const before = typeof b.before === 'number' && Number.isFinite(b.before) ? `(${b.before}` : '+inf';
        const [ids] = (await store.exec([['ZREVRANGEBYSCORE', K.feed(topic), before, '-inf', 'LIMIT', 0, LIMITS.pageSize]])) as [string[]];
        const posts = await viewsOf(store, ids, me);
        const last = posts.at(-1);
        return { status: 200, body: { ok: true, posts, ...(ids.length === LIMITS.pageSize && last ? { next: last.createdAt } : {}) } };
      }
      case 'ranking': {
        const [ids] = (await store.exec([
          ['ZREVRANGEBYSCORE', K.feed(), '+inf', t - LIMITS.rankingDays * DAY, 'LIMIT', 0, 200],
        ])) as [string[]];
        const posts = (await viewsOf(store, ids, me))
          .filter((p) => p.likes > 0)
          .sort((x, y) => y.likes - x.likes || y.createdAt - x.createdAt)
          .slice(0, LIMITS.rankingSize);
        return { status: 200, body: { ok: true, posts } };
      }
      case 'post': {
        const p = await loadPost(store, b.id);
        const [[post], [rawComments]] = await Promise.all([
          viewsOf(store, [p.id], me).then((v) => [v[0]]),
          store.exec([['LRANGE', K.comments(p.id), 0, -1]]) as Promise<[string[]]>,
        ]);
        const cs = (rawComments ?? []).map((c) => parse<StoredComment>(c)).filter((c): c is StoredComment => !!c);
        const authors = await profilesOf(store, cs.map((c) => c.authorId));
        const comments = cs.map((c) => ({ id: c.id, author: authors.get(c.authorId)!, text: c.text, createdAt: c.createdAt, mine: c.authorId === me }));
        return { status: 200, body: { ok: true, post, comments } };
      }
      case 'create': {
        if (!isTopic(b.topic)) throw new Fail('bad-request');
        const text = str(b.text, LIMITS.text, 1);
        const menu = b.topic === 'meal' ? optStr(b.menu, LIMITS.menu) : undefined;
        const items = Array.isArray(b.items)
          ? b.items.slice(0, LIMITS.items).map((x) => str(x, LIMITS.item, 1))
          : undefined;
        let photo: string | undefined;
        if (b.photo !== undefined && b.photo !== null && b.photo !== '') {
          if (typeof b.photo !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.photo)) throw new Fail('bad-request');
          if (b.photo.length > LIMITS.photo) throw new Fail('bad-request');
          photo = b.photo;
        }
        await rateLimit(store, me, 'post', t);
        const id = newId();
        const post: StoredPost = {
          id,
          authorId: me,
          topic: b.topic,
          text,
          ...(menu ? { menu } : {}),
          ...(items?.length ? { items } : {}),
          hasPhoto: !!photo,
          ...(b.topic === 'share' ? { status: '나눔 중' as const } : {}),
          createdAt: t,
        };
        await store.exec([
          ['SET', K.post(id), JSON.stringify(post)],
          ...(photo ? [['SET', K.img(id), photo] as Cmd] : []),
          ['ZADD', K.feed(), t, id],
          ['ZADD', K.feed(b.topic), t, id],
          ['ZADD', K.userPosts(me), t, id],
        ]);
        const [view] = await viewsOf(store, [id], me);
        return { status: 200, body: { ok: true, post: view, comments: [] } };
      }
      case 'like': {
        const p = await loadPost(store, b.id);
        const [has] = await store.exec([['SISMEMBER', K.likes(p.id), me]]);
        await store.exec([[Number(has) === 1 ? 'SREM' : 'SADD', K.likes(p.id), me]]);
        const [view] = await viewsOf(store, [p.id], me);
        return { status: 200, body: { ok: true, posts: [view] } };
      }
      case 'comment': {
        const p = await loadPost(store, b.id);
        const text = str(b.text, LIMITS.comment, 1);
        await rateLimit(store, me, 'comment', t);
        const c: StoredComment = { id: newId(), authorId: me, text, createdAt: t };
        await store.exec([['RPUSH', K.comments(p.id), JSON.stringify(c)]]);
        return { status: 200, body: { ok: true, done: true } };
      }
      case 'status': {
        const p = await loadPost(store, b.id);
        if (p.authorId !== me) throw new Fail('forbidden');
        if (p.topic !== 'share' || typeof b.status !== 'string' || !(SHARE_STATUSES as readonly string[]).includes(b.status)) {
          throw new Fail('bad-request');
        }
        await store.exec([['SET', K.post(p.id), JSON.stringify({ ...p, status: b.status })]]);
        return { status: 200, body: { ok: true, done: true } };
      }
      case 'delete': {
        const p = await loadPost(store, b.id);
        if (p.authorId !== me) throw new Fail('forbidden');
        await store.exec([
          ['DEL', K.post(p.id), K.img(p.id), K.likes(p.id), K.comments(p.id)],
          ['ZREM', K.feed(), p.id],
          ['ZREM', K.feed(p.topic), p.id],
          ['ZREM', K.userPosts(me), p.id],
        ]);
        return { status: 200, body: { ok: true, done: true } };
      }
      case 'me': {
        const [rawProfile, weekIds, total] = (await store.exec([
          ['GET', K.user(me)],
          ['ZREVRANGEBYSCORE', K.userPosts(me), '+inf', t - 7 * DAY],
          ['ZCARD', K.userPosts(me)],
        ])) as [unknown, string[], number];
        const likes = weekIds.length ? await store.exec(weekIds.map((id) => ['SCARD', K.likes(id)])) : [];
        return {
          status: 200,
          body: {
            ok: true,
            authorId: me,
            profile: parse<Profile>(rawProfile) ?? defaultProfile(me),
            stats: { weekPosts: weekIds.length, weekLikes: likes.reduce<number>((n, x) => n + Number(x ?? 0), 0), totalPosts: Number(total ?? 0) },
          },
        };
      }
      case 'profile': {
        const p = (b.profile ?? {}) as Record<string, unknown>;
        const avatar = typeof p.avatar === 'string' && (AVATARS as readonly string[]).includes(p.avatar) ? p.avatar : undefined;
        if (!avatar) throw new Fail('bad-request');
        const profile: Profile = { nick: str(p.nick, LIMITS.nick, 1), avatar, area: str(p.area ?? '', LIMITS.area) };
        await store.exec([['SET', K.user(me), JSON.stringify(profile)]]);
        return { status: 200, body: { ok: true, done: true } };
      }
      default:
        throw new Fail('bad-request');
    }
  } catch (e) {
    if (e instanceof Fail) {
      const status = { 'bad-request': 400, forbidden: 403, 'not-found': 404, 'too-many': 429 }[e.code as string] ?? 500;
      return { status, body: { ok: false, error: e.code } };
    }
    console.error('커뮤니티 처리 실패:', e);
    return { status: 500, body: { ok: false, error: 'server' } };
  }
}

/** 사진: data URL → 바이트 */
export async function handleImage(id: string | null, store: Store | undefined): Promise<Response> {
  if (!store) return new Response('not configured', { status: 503 });
  if (!id || !/^[a-z0-9]{4,32}$/.test(id)) return new Response('bad request', { status: 400 });
  const [raw] = await store.exec([['GET', K.img(id)]]);
  const m = typeof raw === 'string' ? /^data:(image\/[a-z]+);base64,(.+)$/.exec(raw) : null;
  if (!m) return new Response('not found', { status: 404 });
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  return new Response(bytes, { headers: { 'Content-Type': m[1], 'Cache-Control': 'public, max-age=86400, immutable' } });
}

// 개발 서버(vite)에서 저장소 환경 변수가 없으면 메모리 저장소를 쓴다 (껐다 켜면 사라짐)
let devMemory: Store | undefined;
export function devStore(): Store {
  devMemory ??= memoryStore();
  return devMemory;
}

const pickStore = () => storeFromEnv(process.env, fetch) ?? (process.env.COMMUNITY_DEV_MEMORY === '1' ? devStore() : undefined);

/** Vercel 진입점 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const { status, body: out } = await handleCommunity(body, { store: pickStore(), now: Date.now });
  return Response.json(out, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: Request): Promise<Response> {
  return handleImage(new URL(request.url).searchParams.get('img'), pickStore());
}
