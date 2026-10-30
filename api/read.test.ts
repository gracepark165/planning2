import { beforeEach, describe, expect, it } from 'vitest';
import { AI_MODEL, LIMITS, anthropicErrorOf, handleRead, kindIdsOf, parseRequest, resetRateLimit, youtubeIdOf } from './read';

describe('유튜브 주소 → 영상 번호 (쇼츠·롱폼 모두)', () => {
  const id = 'dQw4w9WgXcQ';
  it.each([
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=42s`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/shorts/${id}`,
    `https://youtube.com/shorts/${id}?feature=share`,
    `youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/live/${id}`,
  ])('%s', (url) => expect(youtubeIdOf(url)).toBe(id));

  it.each(['https://vimeo.com/123', 'https://youtube.com/@channel', 'https://youtube.com/watch?v=짧음', '아무 글', ''])(
    '아니면 null: %s',
    (url) => expect(youtubeIdOf(url)).toBeNull(),
  );
});

describe('요청 검사', () => {
  it('종류별 필수 값', () => {
    expect(parseRequest(null)).toBe('bad-request');
    expect(parseRequest({ kind: 'nope' })).toBe('bad-request');
    expect(parseRequest({ kind: 'video', url: '' })).toBe('bad-request');
    expect(parseRequest({ kind: 'text', lines: [] })).toBe('bad-request');
    expect(parseRequest({ kind: 'order', images: ['x'], mediaType: 'text/html', today: '2026-10-28' })).toBe('bad-request');
    expect(parseRequest({ kind: 'text', lines: ['계란 한판'], vocabulary: ['계란'] })).toEqual({
      kind: 'text',
      lines: ['계란 한판'],
      vocabulary: ['계란'],
      kinds: [],
    });
    expect(parseRequest({ kind: 'text', lines: ['x'], kinds: 'dairy' })).toBe('bad-request');
  });

  it('너무 크면 too-large', () => {
    const big = 'a'.repeat(LIMITS.imageChars + 1);
    expect(parseRequest({ kind: 'order', images: [big], mediaType: 'image/jpeg', today: '2026-10-28' })).toBe('too-large');
    const five = Array(LIMITS.images + 1).fill('a');
    expect(parseRequest({ kind: 'order', images: five, mediaType: 'image/jpeg', today: '2026-10-28' })).toBe('too-large');
  });
});

// ───────── 가짜 fetch로 서버 함수 흐름 검사 (실제 AI·유튜브는 부르지 않음) ─────────

interface Call {
  url: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

function fakeFetch(routes: Record<string, (call: Call) => Response>) {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const call: Call = {
      url,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: init?.headers as Record<string, string>,
    };
    calls.push(call);
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) throw new Error(`예상 못 한 호출: ${url}`);
    return routes[key](call);
  }) as typeof fetch;
  return { fn, calls };
}

const claudeSays = (name: string, input: unknown) => () =>
  Response.json({ content: [{ type: 'tool_use', name, input }] });

const deps = (fetch: typeof globalThis.fetch, env: Record<string, string> = { ANTHROPIC_API_KEY: 'test-key' }) => ({
  fetch,
  env,
  ip: '1.2.3.4',
  now: 1_000_000,
});

const ANTHROPIC = 'https://api.anthropic.com/v1/messages';

describe('서버 함수', () => {
  beforeEach(resetRateLimit);

  it('키가 없으면 no-key (AI 연결 전)', async () => {
    const { fn, calls } = fakeFetch({});
    const r = await handleRead({ kind: 'text', lines: ['계란 한판'] }, deps(fn, {}));
    expect(r).toEqual({ status: 503, body: { ok: false, error: 'no-key' } });
    expect(calls).toEqual([]);
  });

  it('주문 화면: 사진 조각을 모두 보내고, 도구 결과를 돌려준다', async () => {
    const data = { retailer: '컬리', orderDate: '2026-10-27', items: [{ name: '닭다리살', count: 1, weight: '400g' }] };
    const { fn, calls } = fakeFetch({ [ANTHROPIC]: claudeSays('report_order', data) });
    const r = await handleRead(
      { kind: 'order', images: ['AAA', 'BBB'], mediaType: 'image/jpeg', today: '2026-10-28', vocabulary: ['닭다리살'] },
      deps(fn),
    );
    expect(r).toEqual({ status: 200, body: { ok: true, kind: 'order', data } });
    const sent = calls[0];
    expect(sent.headers?.['x-api-key']).toBe('test-key');
    expect(sent.body?.model).toBe(AI_MODEL);
    expect(sent.body?.tool_choice).toEqual({ type: 'auto' });
    expect(JSON.stringify(sent.body?.messages)).toContain('report_order 도구');
    const content = (sent.body?.messages as { content: { type: string; text?: string }[] }[])[0].content;
    expect(content.filter((c) => c.type === 'image')).toHaveLength(2);
    expect(content.at(-2)?.text).toContain('닭다리살');
  });

  it('주문 화면: 종류 목록을 보내면 사전에 없는 재료의 종류·보관 방법도 묻는다', async () => {
    const { fn, calls } = fakeFetch({ [ANTHROPIC]: claudeSays('report_order', { items: [] }) });
    await handleRead(
      { kind: 'order', images: ['A'], mediaType: 'image/jpeg', today: '2026-10-28', kinds: ['dairy: 우유·요거트 (예: 요거트)', 'tofu: 두부·묵'] },
      deps(fn),
    );
    const body = calls[0].body as { tools: { input_schema: { properties: { items: { items: { properties: Record<string, { enum?: string[] }> } } } } }[] };
    const props = body.tools[0].input_schema.properties.items.items.properties;
    expect(props.kind.enum).toEqual(['dairy', 'tofu', '']);
    expect(props.storage.enum).toEqual(['냉장', '냉동', '실온', '']);
    expect(JSON.stringify(calls[0].body)).toContain('dairy: 우유·요거트');
    expect(kindIdsOf(['rawMeat: 생고기', '이상한 줄'])).toEqual(['rawMeat']);
  });

  it('영상: 유튜브 키가 있으면 설명란까지 읽는다', async () => {
    const { fn, calls } = fakeFetch({
      'https://www.googleapis.com/youtube/v3/videos': () =>
        Response.json({ items: [{ snippet: { title: '초간단 제육볶음', description: '재료: 앞다리살 300g, 양파 1/2개' } }] }),
      [ANTHROPIC]: claudeSays('report_recipe', { basis: 'description', menus: [{ title: '제육볶음', ingredients: ['돼지고기 앞다리살', '양파'] }] }),
    });
    const r = await handleRead(
      { kind: 'video', url: 'https://youtu.be/dQw4w9WgXcQ' },
      deps(fn, { ANTHROPIC_API_KEY: 'k', YOUTUBE_API_KEY: 'yt' }),
    );
    expect(r.body).toEqual({
      ok: true,
      kind: 'video',
      data: { videoTitle: '초간단 제육볶음', basis: 'description', menus: [{ title: '제육볶음', ingredients: ['돼지고기 앞다리살', '양파'] }] },
    });
    const prompt = JSON.stringify(calls[1].body);
    expect(prompt).toContain('앞다리살 300g');
  });

  it('영상: 유튜브 키가 없으면 제목만 (oEmbed)', async () => {
    const { fn, calls } = fakeFetch({
      'https://www.youtube.com/oembed': () => Response.json({ title: '버터치킨카레 만들기' }),
      [ANTHROPIC]: claudeSays('report_recipe', { basis: 'title', menus: [{ title: '버터치킨카레', ingredients: ['닭다리살'] }] }),
    });
    const r = await handleRead({ kind: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }, deps(fn));
    expect(r.status).toBe(200);
    expect(calls.map((c) => new URL(c.url).hostname)).toEqual(['www.youtube.com', 'api.anthropic.com']);
    expect(JSON.stringify(calls[1].body)).toContain('(없음)');
  });

  it('영상: 유튜브 링크가 아니거나 영상이 없으면', async () => {
    const { fn } = fakeFetch({ 'https://www.youtube.com/oembed': () => new Response('', { status: 404 }) });
    expect((await handleRead({ kind: 'video', url: 'https://vimeo.com/1' }, deps(fn))).body).toEqual({ ok: false, error: 'not-youtube' });
    expect((await handleRead({ kind: 'video', url: 'https://youtu.be/dQw4w9WgXcQ' }, deps(fn))).body).toEqual({
      ok: false,
      error: 'video-not-found',
    });
  });

  it('AI 오류는 ai-failed, AI 쪽 429는 too-many', async () => {
    const down = fakeFetch({ [ANTHROPIC]: () => new Response('err', { status: 500 }) });
    expect((await handleRead({ kind: 'text', lines: ['x'] }, deps(down.fn))).body).toEqual({ ok: false, error: 'ai-failed', detail: '500' });
    const busy = fakeFetch({ [ANTHROPIC]: () => new Response('err', { status: 429 }) });
    expect((await handleRead({ kind: 'text', lines: ['x'] }, deps(busy.fn))).body).toMatchObject({ ok: false, error: 'too-many' });
    const odd = fakeFetch({ [ANTHROPIC]: () => Response.json({ content: [{ type: 'text', text: '음…' }] }) });
    expect((await handleRead({ kind: 'text', lines: ['x'] }, deps(odd.fn))).body).toMatchObject({ ok: false, error: 'ai-failed' });
  });

  it('Anthropic이 거절한 이유를 알려 준다 (키 값은 넣지 않음)', async () => {
    const say = (status: number, type: string, message: string) =>
      fakeFetch({ [ANTHROPIC]: () => Response.json({ type: 'error', error: { type, message } }, { status }) });
    const bad = say(401, 'authentication_error', 'invalid x-api-key');
    expect((await handleRead({ kind: 'text', lines: ['x'] }, deps(bad.fn))).body).toEqual({
      ok: false,
      error: 'ai-key',
      detail: '401 authentication_error invalid x-api-key',
    });
    expect(anthropicErrorOf(400, { error: { type: 'invalid_request_error', message: 'Your credit balance is too low' } }).code).toBe('ai-credit');
    expect(anthropicErrorOf(404, { error: { type: 'not_found_error', message: 'model: claude-x' } }).code).toBe('ai-model');
    expect(anthropicErrorOf(403, { error: { type: 'permission_error', message: 'no access' } }).code).toBe('ai-failed');
    expect(anthropicErrorOf(500, null).detail).toBe('500');
  });

  it('한 사람이 너무 자주 부르면 잠깐 막는다', async () => {
    const { fn } = fakeFetch({ [ANTHROPIC]: claudeSays('report_lines', { lines: [] }) });
    for (let i = 0; i < LIMITS.ratePerWindow; i++) {
      expect((await handleRead({ kind: 'text', lines: ['x'] }, deps(fn))).status).toBe(200);
    }
    expect((await handleRead({ kind: 'text', lines: ['x'] }, deps(fn))).body).toEqual({ ok: false, error: 'too-many' });
    // 시간이 지나면 다시
    const later = { ...deps(fn), now: 1_000_000 + LIMITS.rateWindowMs + 1 };
    expect((await handleRead({ kind: 'text', lines: ['x'] }, later)).status).toBe(200);
  });
});

describe('메뉴 제안 /api/menu (V4-1b)', () => {
  beforeEach(resetRateLimit);
  const menuReq = {
    kind: 'menu',
    today: '2026-10-30',
    slots: [{ index: 3, date: '2026-11-04' }],
    stock: [
      { name: '두부', qty: '1모', daysLeft: 7, state: 'ok', portion: 'whole' },
      { name: '계란', qty: '10구', daysLeft: 14, state: 'ok', portion: 'level', level: '넉넉해요' },
    ],
    mustUseFirst: ['두부'],
    excludeMenus: ['닭가슴살 샐러드'],
    basicSeasonings: ['소금', '간장'],
  };
  const menus = { menus: [{ slotIndex: 3, name: '두부 애호박 볶음', uses: ['두부'], keeps: ['계란'], buy: [], howto: '두부를 볶아요' }] };

  it('요청 JSON을 그대로 보내고(재료 이름·수량·상태·남은 일수뿐), 온도는 낮게, 프롬프트는 메뉴용', async () => {
    const { fn, calls } = fakeFetch({ [ANTHROPIC]: claudeSays('suggest_menus', menus) });
    const r = await handleRead(menuReq, deps(fn));
    expect(r).toEqual({ status: 200, body: { ok: true, kind: 'menu', data: menus } });
    expect(calls).toHaveLength(1);
    const body = calls[0].body as { temperature: number; system: string; messages: { content: { text: string }[] }[] };
    expect(body.temperature).toBe(0.3);
    expect(body.system).toContain('1인 가구의 집밥 메뉴');
    const sent = JSON.parse(body.messages[0].content[0].text);
    expect(sent).toEqual({ ...menuReq, kind: undefined });
  });

  it('형식이 다르면 한 번만 다시 부르고, 두 번 틀리면 실패(앱이 폴백)', async () => {
    let n = 0;
    const { fn, calls } = fakeFetch({
      [ANTHROPIC]: () => (n++ === 0 ? claudeSays('suggest_menus', { menus: '아무거나' })() : claudeSays('suggest_menus', menus)()),
    });
    expect((await handleRead(menuReq, deps(fn))).body).toEqual({ ok: true, kind: 'menu', data: menus });
    expect(calls).toHaveLength(2);
    const bad = fakeFetch({ [ANTHROPIC]: claudeSays('suggest_menus', { nope: 1 }) });
    const r = await handleRead(menuReq, deps(bad.fn));
    expect(r.body).toMatchObject({ ok: false, error: 'ai-failed' });
    expect(bad.calls).toHaveLength(2);
  });

  it('요청 검사: 칸·재료가 없거나 너무 많으면 거절', () => {
    expect(parseRequest({ ...menuReq, slots: [] })).toBe('bad-request');
    expect(parseRequest({ ...menuReq, stock: 'x' })).toBe('bad-request');
    expect(parseRequest({ ...menuReq, stock: Array.from({ length: 200 }, (_, i) => ({ ...menuReq.stock[0], name: `재료${i}` })) })).toBe('too-large');
  });
});

describe('메뉴 이름 → 재료 /api/ingredients (V4-5)', () => {
  beforeEach(resetRateLimit);
  it('메뉴 이름만 보내고 재료 목록을 돌려준다', async () => {
    const data = { ingredients: ['두부', '김치', '돼지고기'] };
    const { fn, calls } = fakeFetch({ [ANTHROPIC]: claudeSays('list_ingredients', data) });
    const r = await handleRead({ kind: 'ingredients', menu: '두부김치', basicSeasonings: ['소금'] }, deps(fn));
    expect(r).toEqual({ status: 200, body: { ok: true, kind: 'ingredients', data } });
    expect(JSON.stringify(calls[0].body)).toContain('두부김치');
  });
  it('메뉴 이름이 없으면 거절', () => {
    expect(parseRequest({ kind: 'ingredients', menu: '' })).toBe('bad-request');
  });
});
