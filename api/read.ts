// AI 읽기 서버 함수 (Vercel Functions, POST /api/read)
//
// 앱은 AI를 직접 부르지 않고 이 함수만 부른다. API 키는 Vercel 환경 변수에만 있다.
//   ANTHROPIC_API_KEY  (필수)  Claude 호출
//   YOUTUBE_API_KEY    (선택)  영상 설명란 읽기. 없으면 영상 제목만 읽는다.
//
// AI는 "읽기"만 한다: 주문 화면 사진 → 재료 목록, 영상 → 메뉴·재료, 규칙으로 못 읽은 글 줄 → 재료.
// 상태 판정·소비기한·플랜·대체 제안은 앱의 규칙 코드가 한다.
//
// 배포 때 다른 파일을 불러오다 깨지지 않도록 이 파일은 다른 소스 파일을 import하지 않는다.
// 재료 사전 이름 목록은 앱이 요청에 담아 보낸다(vocabulary).

export const AI_MODEL = 'claude-sonnet-5-5';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/** 요청 크기 제한 */
export const LIMITS = {
  imageChars: 3_500_000, // 사진 전체 base64 글자 수 (약 2.6MB). 앱이 미리 줄여서 보낸다.
  images: 4, // 긴 캡처는 앱이 여러 조각으로 잘라 보낸다
  vocabulary: 400,
  wordChars: 40,
  lines: 20,
  lineChars: 120,
  urlChars: 300,
  /** 한 사람(IP)이 RATE_WINDOW_MS 동안 부를 수 있는 횟수. 서버 인스턴스마다 따로 세는 대략적인 제한. */
  ratePerWindow: 20,
  rateWindowMs: 10 * 60 * 1000,
};

export type ReadErrorCode =
  | 'no-key' // ANTHROPIC_API_KEY가 없음 (AI 연결 전)
  | 'bad-request'
  | 'too-large'
  | 'too-many'
  | 'not-youtube'
  | 'video-not-found'
  | 'ai-key' // Anthropic이 키를 거절 (틀린 키·지운 키)
  | 'ai-credit' // 크레딧·결제 문제
  | 'ai-model' // 이 키로 쓸 수 없는 모델
  | 'ai-failed';

export type ReadRequest =
  | { kind: 'order'; images: string[]; mediaType: string; vocabulary: string[]; today: string }
  | { kind: 'video'; url: string; vocabulary: string[] }
  | { kind: 'text'; lines: string[]; vocabulary: string[] };

export interface OrderAiItem {
  name: string;
  /** 화면에 적힌 상품명 그대로 (확인 화면에 "주문 화면: …"으로 보여줌) */
  product?: string;
  count?: number;
  unit?: string;
  /** 무게·부피 (400g, 900ml) */
  weight?: string;
  /** 사진에 소비기한이 적혀 있으면 YYYY-MM-DD */
  expiresOn?: string;
}
export interface OrderAiResult {
  retailer?: '컬리' | 'B마트' | '쿠팡';
  /** 주문일 YYYY-MM-DD */
  orderDate?: string;
  items: OrderAiItem[];
}

export interface VideoAiResult {
  videoTitle: string;
  /** description = 설명란에서 읽음, title = 설명란이 없어 메뉴 이름으로 짐작함, none = 못 찾음 */
  basis: 'description' | 'title' | 'none';
  menus: { title: string; ingredients: string[] }[];
}

export interface TextAiLine {
  index: number;
  name: string;
  count?: number;
  unit?: string;
  portioned?: boolean;
}
export interface TextAiResult {
  lines: TextAiLine[];
}

export type ReadResponse =
  | { ok: true; kind: 'order'; data: OrderAiResult }
  | { ok: true; kind: 'video'; data: VideoAiResult }
  | { ok: true; kind: 'text'; data: TextAiResult }
  | { ok: false; error: ReadErrorCode; detail?: string };

// ───────────────────────── 유튜브 ─────────────────────────

/** 유튜브 주소에서 영상 번호(11글자)를 꺼낸다. 쇼츠·롱폼·youtu.be·모바일 주소 모두. */
export function youtubeIdOf(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
  const ok = (id: string | null | undefined) => (id && /^[\w-]{11}$/.test(id) ? id : null);
  if (host === 'youtu.be') return ok(u.pathname.split('/')[1]);
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null;
  if (u.pathname === '/watch') return ok(u.searchParams.get('v'));
  const m = /^\/(shorts|embed|live|v)\/([^/?#]+)/.exec(u.pathname);
  return m ? ok(m[2]) : null;
}

interface Deps {
  fetch: typeof fetch;
  env: { ANTHROPIC_API_KEY?: string; YOUTUBE_API_KEY?: string };
  ip: string;
  now: number;
}

async function fetchVideoText(id: string, deps: Deps): Promise<{ title: string; description: string } | null> {
  const key = deps.env.YOUTUBE_API_KEY;
  if (key) {
    const res = await deps.fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${id}&key=${encodeURIComponent(key)}`,
    );
    if (res.ok) {
      const data = (await res.json()) as { items?: { snippet?: { title?: string; description?: string } }[] };
      const s = data.items?.[0]?.snippet;
      return s ? { title: s.title ?? '', description: s.description ?? '' } : null;
    }
  }
  // 키가 없거나 실패하면 제목만 (oEmbed는 키가 필요 없다)
  const res = await deps.fetch(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { title?: string };
  return { title: data.title ?? '', description: '' };
}

// ───────────────────────── Claude 호출 ─────────────────────────

class ReadError extends Error {
  constructor(
    readonly code: ReadErrorCode,
    readonly detail?: string,
  ) {
    super(code);
  }
}

/** Anthropic이 거절한 이유 → 오류 코드. 이유 문구(키 값은 들어 있지 않음)는 원인을 찾을 수 있게 같이 돌려준다. */
export function anthropicErrorOf(status: number, body: unknown): ReadError {
  const err = (body as { error?: { type?: unknown; message?: unknown } } | null)?.error;
  const type = typeof err?.type === 'string' ? err.type : '';
  const message = typeof err?.message === 'string' ? err.message : '';
  const detail = `${status} ${type} ${message}`.replace(/\s+/g, ' ').trim().slice(0, 300);
  if (status === 429) return new ReadError('too-many', detail);
  if (status === 401 || type === 'authentication_error') return new ReadError('ai-key', detail);
  if (/credit|billing|balance/i.test(message)) return new ReadError('ai-credit', detail);
  if (status === 404 || type === 'not_found_error' || /model/i.test(message)) return new ReadError('ai-model', detail);
  return new ReadError('ai-failed', detail);
}

interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

type Content =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

async function callClaude(deps: Deps, system: string, content: Content[], tool: Tool): Promise<unknown> {
  const res = await deps.fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': deps.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 2000,
      system,
      tools: [tool],
      // 이 모델은 도구 강제 지정(type 'tool'·'any')을 지원하지 않아서, auto로 두고 지시문으로 도구를 쓰게 한다
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: [...content, { type: 'text', text: `답은 글로 쓰지 말고 ${tool.name} 도구를 한 번 불러서 주세요.` }] }],
    }),
  });
  if (!res.ok) {
    const error = anthropicErrorOf(res.status, await res.json().catch(() => null));
    console.error('Anthropic 거절:', error.detail);
    throw error;
  }
  const data = (await res.json()) as { content?: { type: string; name?: string; input?: unknown }[] };
  const block = data.content?.find((b) => b.type === 'tool_use' && b.name === tool.name);
  if (!block) throw new ReadError('ai-failed', `도구 답 없음 (stop: ${String((data as { stop_reason?: unknown }).stop_reason ?? '')})`);
  return block.input;
}

const vocabText = (vocabulary: string[]) =>
  `재료 사전 이름 목록: ${vocabulary.join(', ')}\n` +
  '재료 이름은 가능하면 이 목록의 이름 하나로 그대로 맞춰 주세요 (예: "국산 무항생제 닭다리살 400g" → "닭다리살", "달걀" → "계란"). ' +
  '목록에 없으면 브랜드·수식어·용량을 뺀 짧은 일반 이름으로 적어 주세요 (예: "노르웨이 생연어 필렛" → "연어").';

const UNIT_HINT = '단위는 봉, 덩이, 개, 팩, 통, 구, 단, 모 중 하나로 맞춰 주세요.';

const ORDER_TOOL: Tool = {
  name: 'report_order',
  description: '주문 화면에서 읽은 식재료 목록을 보고한다.',
  input_schema: {
    type: 'object',
    properties: {
      retailer: { type: 'string', enum: ['컬리', 'B마트', '쿠팡', '모름'] },
      orderDate: { type: 'string', description: '주문일 YYYY-MM-DD. 안 보이면 빈 문자열.' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '재료 이름 (사전 이름으로 맞춤)' },
            product: { type: 'string', description: '화면에 적힌 상품명 그대로' },
            count: { type: 'integer', description: '주문 수량 (상품 개수)' },
            unit: { type: 'string' },
            weight: { type: 'string', description: '무게·부피 (예: 400g, 900ml). 없으면 빈 문자열.' },
            expiresOn: { type: 'string', description: '화면에 소비기한이 적혀 있으면 YYYY-MM-DD, 없으면 빈 문자열' },
          },
          required: ['name'],
        },
      },
    },
    required: ['items'],
  },
};

const VIDEO_TOOL: Tool = {
  name: 'report_recipe',
  description: '영상 제목·설명란에서 읽은 메뉴와 재료를 보고한다.',
  input_schema: {
    type: 'object',
    properties: {
      basis: {
        type: 'string',
        enum: ['description', 'title', 'none'],
        description:
          'description = 설명란에 재료가 적혀 있어서 읽음, title = 설명란에 재료가 없어 메뉴 이름으로 흔한 재료를 짐작함, none = 요리 영상이 아니거나 메뉴를 모름',
      },
      menus: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '메뉴 이름 (짧게, 예: 제육볶음)' },
            ingredients: { type: 'array', items: { type: 'string' }, description: '재료 이름 (양은 빼고)' },
          },
          required: ['title', 'ingredients'],
        },
      },
    },
    required: ['basis', 'menus'],
  },
};

const TEXT_TOOL: Tool = {
  name: 'report_lines',
  description: '사용자가 적은 장보기 줄을 재료로 읽은 결과를 보고한다.',
  input_schema: {
    type: 'object',
    properties: {
      lines: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer', description: '입력 줄 번호 (0부터)' },
            name: { type: 'string' },
            count: { type: 'integer', description: '개수. 모르면 빼 주세요.' },
            unit: { type: 'string' },
            portioned: { type: 'boolean', description: '"소분"처럼 나눠 담았다는 뜻이 있으면 true' },
          },
          required: ['index', 'name'],
        },
      },
    },
    required: ['lines'],
  },
};

const SYSTEM =
  '당신은 1인 가구 냉장고 정리 앱의 "읽기" 도우미예요. 보이는 것만 정확히 읽고, 없는 정보는 지어내지 말고 비워 두세요. ' +
  '반드시 주어진 도구로만 답하세요.';

// ───────────────────────── 요청 처리 ─────────────────────────

const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const strList = (v: unknown, maxItems: number, maxChars: number): string[] | null =>
  Array.isArray(v) && v.length <= maxItems && v.every((x) => isStr(x, maxChars)) ? (v as string[]) : null;

/** 요청 모양 검사. 틀리면 에러 코드 */
export function parseRequest(body: unknown): ReadRequest | ReadErrorCode {
  if (!body || typeof body !== 'object') return 'bad-request';
  const b = body as Record<string, unknown>;
  const vocabulary = b.vocabulary === undefined ? [] : strList(b.vocabulary, LIMITS.vocabulary, LIMITS.wordChars);
  if (!vocabulary) return 'bad-request';
  switch (b.kind) {
    case 'order':
      if (!Array.isArray(b.images) || !b.images.length || !b.images.every((x) => typeof x === 'string' && x)) {
        return 'bad-request';
      }
      if (b.images.length > LIMITS.images) return 'too-large';
      if ((b.images as string[]).reduce((a, x) => a + x.length, 0) > LIMITS.imageChars) return 'too-large';
      if (!isStr(b.mediaType, 40) || !/^image\/(jpeg|png|webp|gif)$/.test(b.mediaType)) return 'bad-request';
      if (!isStr(b.today, 10)) return 'bad-request';
      return { kind: 'order', images: b.images as string[], mediaType: b.mediaType, vocabulary, today: b.today };
    case 'video':
      if (!isStr(b.url, LIMITS.urlChars)) return 'bad-request';
      return { kind: 'video', url: b.url, vocabulary };
    case 'text': {
      const lines = strList(b.lines, LIMITS.lines, LIMITS.lineChars);
      if (!lines || !lines.length) return 'bad-request';
      return { kind: 'text', lines, vocabulary };
    }
    default:
      return 'bad-request';
  }
}

/** 한 사람이 너무 자주 부르지 않게 (서버 인스턴스 메모리. 정확한 하루 제한은 아님) */
const hits = new Map<string, number[]>();
export function rateLimited(ip: string, now: number): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < LIMITS.rateWindowMs);
  if (recent.length >= LIMITS.ratePerWindow) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // 메모리 보호
  return false;
}
export const resetRateLimit = () => hits.clear();

const text = (t: string): Content => ({ type: 'text', text: t });

export async function handleRead(body: unknown, deps: Deps): Promise<{ status: number; body: ReadResponse }> {
  const fail = (status: number, error: ReadErrorCode) => ({ status, body: { ok: false as const, error } });
  if (!deps.env.ANTHROPIC_API_KEY) return fail(503, 'no-key');
  const req = parseRequest(body);
  if (typeof req === 'string') return fail(req === 'too-large' ? 413 : 400, req);
  if (rateLimited(deps.ip, deps.now)) return fail(429, 'too-many');

  try {
    if (req.kind === 'order') {
      const input = await callClaude(
        deps,
        SYSTEM,
        [
          ...req.images.map(
            (data): Content => ({ type: 'image', source: { type: 'base64', media_type: req.mediaType, data } }),
          ),
          text(
            `장보기 앱(컬리·B마트·쿠팡 등) 주문 내역 화면이에요. 오늘은 ${req.today}예요.\n` +
              (req.images.length > 1 ? '긴 화면을 위에서부터 차례로 자른 조각들이라, 경계에서 겹친 상품은 한 번만 세요.\n' : '') +
              '식재료만 골라 주세요 (휴지·세제 같은 생활용품, 배송비·할인 줄은 빼요). 같은 상품이 여러 줄이면 한 줄로 합쳐 수량을 더해요.\n' +
              `${UNIT_HINT}\n${vocabText(req.vocabulary)}`,
          ),
        ],
        ORDER_TOOL,
      );
      return { status: 200, body: { ok: true, kind: 'order', data: input as OrderAiResult } };
    }

    if (req.kind === 'video') {
      const id = youtubeIdOf(req.url);
      if (!id) return fail(400, 'not-youtube');
      const video = await fetchVideoText(id, deps);
      if (!video || !video.title) return fail(404, 'video-not-found');
      const input = (await callClaude(
        deps,
        SYSTEM,
        [
          text(
            `유튜브 요리 영상이에요.\n제목: ${video.title}\n설명란:\n${video.description.slice(0, 6000) || '(없음)'}\n\n` +
              '이 영상에서 만드는 메뉴와 재료를 알려 주세요. 메뉴가 여러 개면 각각 나눠 주세요. 소금·후추 같은 기본 양념도 적혀 있으면 넣어요.\n' +
              '설명란에 재료가 없으면 basis를 "title"로 하고, 메뉴 이름으로 흔히 쓰는 주재료만 짧게 짐작해 주세요.\n' +
              vocabText(req.vocabulary),
          ),
        ],
        VIDEO_TOOL,
      )) as Omit<VideoAiResult, 'videoTitle'>;
      return { status: 200, body: { ok: true, kind: 'video', data: { ...input, videoTitle: video.title } } };
    }

    const input = await callClaude(
      deps,
      SYSTEM,
      [
        text(
          '사용자가 장 본 재료를 한 줄씩 적었는데, 규칙으로 읽지 못한 줄이에요. 줄마다 재료 이름과 개수를 읽어 주세요.\n' +
            '"한판"은 계란 30구, "두세봉"처럼 애매하면 개수를 빼 주세요.\n' +
            `${UNIT_HINT}\n${vocabText(req.vocabulary)}\n\n` +
            req.lines.map((l, i) => `${i}: ${l}`).join('\n'),
        ),
      ],
      TEXT_TOOL,
    );
    return { status: 200, body: { ok: true, kind: 'text', data: input as TextAiResult } };
  } catch (e) {
    if (e instanceof ReadError) return { status: 502, body: { ok: false, error: e.code, ...(e.detail ? { detail: e.detail } : {}) } };
    console.error('AI 읽기 실패:', e);
    return fail(502, 'ai-failed');
  }
}

/** Vercel 진입점 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const { status, body: out } = await handleRead(body, {
    fetch,
    env: process.env,
    ip: request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local',
    now: Date.now(),
  });
  return Response.json(out, { status, headers: { 'cache-control': 'no-store' } });
}
