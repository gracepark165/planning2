import { describe, expect, it } from 'vitest';
import { authorIdOf, defaultProfile, handleCommunity, handleImage, LIMITS, memoryStore, type CommunityResponse, type Store } from './community';

const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
const DAY = 86_400_000;

function setup(start = Date.UTC(2026, 10, 9, 3)) {
  const store = memoryStore();
  let t = start;
  let n = 0;
  const deps = { store, now: () => t, newId: () => `p${(++n).toString().padStart(4, '0')}` };
  const call = async (body: object) => (await handleCommunity(body, deps)).body as CommunityResponse & Record<string, unknown>;
  return { store, call, tick: (ms: number) => (t += ms) };
}

const post = (call: ReturnType<typeof setup>['call'], secret: string, extra: object = {}) =>
  call({ action: 'create', secret, topic: 'meal', text: '닭안심 덮밥 먹었어요', menu: '닭안심 덮밥', ...extra }) as Promise<{
    ok: true;
    post: { id: string };
  }>;

describe('커뮤니티 서버', () => {
  it('저장소가 없으면 not-configured', async () => {
    const r = await handleCommunity({ action: 'feed', secret: A }, { store: undefined, now: Date.now });
    expect(r).toEqual({ status: 503, body: { ok: false, error: 'not-configured' } });
  });

  it('비밀값이 짧거나 없으면 bad-request', async () => {
    const { call } = setup();
    expect(await call({ action: 'feed', secret: 'short' })).toEqual({ ok: false, error: 'bad-request' });
    expect(await call({ action: 'feed' })).toEqual({ ok: false, error: 'bad-request' });
  });

  it('글을 쓰면 다른 사람 피드에도 최신순으로 보인다', async () => {
    const { call, tick } = setup();
    await post(call, A);
    tick(1000);
    await post(call, B, { topic: 'share', text: '대파 반 단 나눠요', items: ['대파'] });
    const feed = (await call({ action: 'feed', secret: B })) as { posts: { text: string; mine: boolean; status?: string }[] };
    expect(feed.posts.map((p) => p.text)).toEqual(['대파 반 단 나눠요', '닭안심 덮밥 먹었어요']);
    expect(feed.posts.map((p) => p.mine)).toEqual([true, false]);
    expect(feed.posts[0].status).toBe('나눔 중');
    const meals = (await call({ action: 'feed', secret: B, topic: 'meal' })) as { posts: unknown[] };
    expect(meals.posts).toHaveLength(1);
  });

  it('피드는 20개씩 나눠서 준다', async () => {
    const { call, tick } = setup();
    for (let i = 0; i < 25; i++) {
      await post(call, i % 2 ? A : B, { text: `글 ${i}` });
      tick(1000);
    }
    const first = (await call({ action: 'feed', secret: A })) as { posts: { text: string }[]; next?: number };
    expect(first.posts).toHaveLength(LIMITS.pageSize);
    expect(first.posts[0].text).toBe('글 24');
    const second = (await call({ action: 'feed', secret: A, before: first.next })) as { posts: { text: string }[]; next?: number };
    expect(second.posts.map((p) => p.text)).toEqual(['글 4', '글 3', '글 2', '글 1', '글 0']);
    expect(second.next).toBeUndefined();
  });

  it('공감은 누를 때마다 켜고 끈다', async () => {
    const { call } = setup();
    const { post: p } = await post(call, A);
    const on = (await call({ action: 'like', secret: B, id: p.id })) as { posts: { likes: number; liked: boolean }[] };
    expect(on.posts[0]).toMatchObject({ likes: 1, liked: true });
    const off = (await call({ action: 'like', secret: B, id: p.id })) as { posts: { likes: number; liked: boolean }[] };
    expect(off.posts[0]).toMatchObject({ likes: 0, liked: false });
  });

  it('랭킹: 최근 7일 글 중 공감 많은 순 3개, 공감 0개·오래된 글은 빠진다', async () => {
    const { call, tick } = setup();
    const old = (await post(call, A, { text: '오래된 글' })).post.id;
    await call({ action: 'like', secret: B, id: old });
    tick(8 * DAY);
    const ids: string[] = [];
    for (const text of ['하나', '둘', '셋', '넷', '다섯']) ids.push((await post(call, A, { text })).post.id);
    const secrets = Array.from({ length: 4 }, (_, i) => String(i).repeat(32));
    // 둘: 4 · 넷: 3 · 하나: 2 · 셋: 1 · 다섯: 0
    const likes: Record<string, number> = { 하나: 2, 둘: 4, 셋: 1, 넷: 3 };
    for (const [i, text] of ['하나', '둘', '셋', '넷', '다섯'].entries()) {
      for (const s of secrets.slice(0, likes[text] ?? 0)) await call({ action: 'like', secret: s, id: ids[i] });
    }
    const r = (await call({ action: 'ranking', secret: A })) as { posts: { text: string; likes: number }[] };
    expect(r.posts.map((p) => [p.text, p.likes])).toEqual([
      ['둘', 4],
      ['넷', 3],
      ['하나', 2],
    ]);
  });

  it('댓글은 글 화면에서 순서대로, 글 수에 반영', async () => {
    const { call } = setup();
    const { post: p } = await post(call, A);
    await call({ action: 'comment', secret: B, id: p.id, text: '맛있겠어요' });
    await call({ action: 'comment', secret: A, id: p.id, text: '고마워요' });
    const d = (await call({ action: 'post', secret: A, id: p.id })) as {
      post: { comments: number };
      comments: { text: string; mine: boolean }[];
    };
    expect(d.post.comments).toBe(2);
    expect(d.comments.map((c) => [c.text, c.mine])).toEqual([
      ['맛있겠어요', false],
      ['고마워요', true],
    ]);
  });

  it('지우기·나눔 상태는 쓴 사람만', async () => {
    const { call } = setup();
    const { post: p } = await post(call, A, { topic: 'share', text: '양파 2개 나눠요' });
    expect(await call({ action: 'status', secret: B, id: p.id, status: '예약 중' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await call({ action: 'status', secret: A, id: p.id, status: '예약 중' })).toEqual({ ok: true, done: true });
    expect(await call({ action: 'status', secret: A, id: p.id, status: '팔았어요' })).toEqual({ ok: false, error: 'bad-request' });
    expect(await call({ action: 'delete', secret: B, id: p.id })).toEqual({ ok: false, error: 'forbidden' });
    expect(await call({ action: 'delete', secret: A, id: p.id })).toEqual({ ok: true, done: true });
    expect(((await call({ action: 'feed', secret: A })) as { posts: unknown[] }).posts).toHaveLength(0);
    expect(await call({ action: 'post', secret: A, id: p.id })).toEqual({ ok: false, error: 'not-found' });
  });

  it('글 길이·사진 형식·하루 글 수를 막는다', async () => {
    const { call } = setup();
    expect(await call({ action: 'create', secret: A, topic: 'meal', text: '' })).toEqual({ ok: false, error: 'bad-request' });
    expect(await call({ action: 'create', secret: A, topic: 'meal', text: 'x'.repeat(501) })).toEqual({ ok: false, error: 'bad-request' });
    expect(await call({ action: 'create', secret: A, topic: 'ad', text: '광고' })).toEqual({ ok: false, error: 'bad-request' });
    expect(await call({ action: 'create', secret: A, topic: 'meal', text: '사진', photo: 'javascript:alert(1)' })).toEqual({
      ok: false,
      error: 'bad-request',
    });
    for (let i = 0; i < LIMITS.postsPerDay; i++) await post(call, B);
    expect(await post(call, B)).toEqual({ ok: false, error: 'too-many' });
  });

  it('프로필: 처음엔 기본 이름, 바꾸면 내 글에 새 이름이 보인다', async () => {
    const { call } = setup();
    const id = await authorIdOf(A);
    const me = (await call({ action: 'me', secret: A })) as { profile: object; stats: object; authorId: string };
    expect(me.profile).toEqual(defaultProfile(id));
    expect(me.authorId).toBe(id);
    expect(await call({ action: 'profile', secret: A, profile: { nick: '냉집사', avatar: '🥕', area: '망원동' } })).toEqual({ ok: true, done: true });
    expect(await call({ action: 'profile', secret: A, profile: { nick: '냉집사', avatar: '💀', area: '' } })).toEqual({ ok: false, error: 'bad-request' });
    const { post: p } = await post(call, A);
    await call({ action: 'like', secret: B, id: p.id });
    const after = (await call({ action: 'me', secret: A })) as { profile: object; stats: object };
    expect(after.profile).toEqual({ nick: '냉집사', avatar: '🥕', area: '망원동' });
    expect(after.stats).toEqual({ weekPosts: 1, weekLikes: 1, totalPosts: 1 });
    const feed = (await call({ action: 'feed', secret: B })) as { posts: { author: { nick: string } }[] };
    expect(feed.posts[0].author.nick).toBe('냉집사');
  });

  it('사진은 따로 저장해서 GET으로 준다', async () => {
    const { store, call } = setup();
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const { post: p } = await post(call, A, { photo: png });
    const res = await handleImage(p.id, store as Store);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect((await handleImage('nope', store)).status).toBe(404);
  });
});
