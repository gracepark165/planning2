// 브라우저에서 AI 읽기 서버 함수(/api/read)를 부른다.
// 실패해도 앱은 멈추지 않는다: 부른 쪽이 reason을 보고 예시 결과·직접 입력으로 넘어간다.

import type {
  IngredientsAiResult,
  MenuAiResult,
  MenuRequest,
  OrderAiResult,
  ReadErrorCode,
  ReadResponse,
  TextAiResult,
  VideoAiResult,
} from '../../api/read';
import { CATALOG } from '../data';
import { kindListOf, vocabularyOf } from './convert';

export type AiFailure = ReadErrorCode | 'offline';
export type AiResult<T> = { ok: true; data: T } | { ok: false; reason: AiFailure };

const ENDPOINT = '/api/read';
const TIMEOUT_MS = 60_000;

/**
 * extraNames: 재료 사전 말고도 AI가 맞춰 줬으면 하는 이름 (지난번에 넣은 내 재료)
 * 주문 화면·글 입력은 종류 목록도 보내서, 사전에 없는 재료를 종류로 분류하게 한다.
 */
async function post<T>(body: object, kind: string, extraNames: string[] = []): Promise<AiResult<T>> {
  return postTo<T>(ENDPOINT, {
    ...body,
    kind,
    vocabulary: [...vocabularyOf(CATALOG), ...extraNames].slice(0, 400),
    ...(kind === 'video' ? {} : { kinds: kindListOf() }),
  });
}

async function postTo<T>(endpoint: string, payload: { kind: string } & Record<string, unknown>): Promise<AiResult<T>> {
  const { kind } = payload;
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    let json: ReadResponse;
    try {
      json = (await res.json()) as ReadResponse;
    } catch {
      // 서버 함수가 없는 곳(예: 서버 없이 띄운 개발 화면)은 AI 연결 전과 같게 본다
      return { ok: false, reason: res.status === 404 || res.ok ? 'no-key' : 'ai-failed' };
    }
    if (!json.ok) return { ok: false, reason: json.error };
    if (json.kind !== kind) return { ok: false, reason: 'ai-failed' };
    return { ok: true, data: json.data as T };
  } catch {
    return { ok: false, reason: navigator.onLine === false ? 'offline' : 'ai-failed' };
  } finally {
    window.clearTimeout(timer);
  }
}

// ───────────────────────── 사진 줄이기 ─────────────────────────

/** 보낼 사진 크기: 폭은 이 정도면 글자를 읽기에 충분 */
const MAX_WIDTH = 1000;
/** 긴 캡처는 높이가 폭의 이 배를 넘지 않게 잘라서 여러 장으로 보낸다 (AI가 한 장을 작게 줄여 글자를 놓치지 않게) */
const MAX_RATIO = 2;
const MAX_PIECES = 4;
const OVERLAP = 0.06;

async function loadImage(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // 아래 방식으로
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 긴 캡처를 몇 조각으로, 조각 높이를 얼마로 자를지 (폭 = 1 기준 비율).
 * 조각 높이는 폭의 MAX_RATIO배까지, 조각은 MAX_PIECES개까지. 아주 긴 캡처는 조각을 조금 더 길게 한다.
 */
export function slicePlan(ratio: number): { pieces: number; pieceRatio: number; stepRatio: number } {
  if (ratio <= MAX_RATIO) return { pieces: 1, pieceRatio: ratio, stepRatio: 0 };
  const pieces = Math.min(MAX_PIECES, Math.ceil((ratio - MAX_RATIO) / (MAX_RATIO * (1 - OVERLAP))) + 1);
  const pieceRatio = Math.max(MAX_RATIO, ratio / (1 + (pieces - 1) * (1 - OVERLAP)));
  return { pieces, pieceRatio, stepRatio: (ratio - pieceRatio) / (pieces - 1) };
}

/** 사진을 줄이고(긴 캡처는 조각내서) JPEG base64로 */
export async function prepareImage(file: File): Promise<string[]> {
  const img = await loadImage(file);
  const w = Math.min(MAX_WIDTH, img.width);
  const h = (img.height * w) / img.width;
  const { pieces, pieceRatio, stepRatio } = slicePlan(h / w);
  const out: string[] = [];
  for (let i = 0; i < pieces; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w);
    canvas.height = Math.round(w * pieceRatio);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, -i * stepRatio * w, w, h);
    out.push(canvas.toDataURL('image/jpeg', 0.82).split(',')[1]);
  }
  return out;
}

// ───────────────────────── 읽기 ─────────────────────────

export async function readOrderImage(file: File, today: string, extraNames: string[] = []): Promise<AiResult<OrderAiResult>> {
  let images: string[];
  try {
    images = await prepareImage(file);
  } catch {
    return { ok: false, reason: 'bad-request' };
  }
  return post<OrderAiResult>({ images, mediaType: 'image/jpeg', today }, 'order', extraNames);
}

export const readVideo = (url: string) => post<VideoAiResult>({ url }, 'video');

export const readTextLines = (lines: string[], extraNames: string[] = []) => post<TextAiResult>({ lines }, 'text', extraNames);

/** 메뉴 제안 (V4-1b): 규칙 메뉴로 못 채운 칸만. 재료 이름·수량·상태·남은 일수만 보낸다 */
export const suggestMenus = (req: MenuRequest) => postTo<MenuAiResult>('/api/menu', { ...(req as unknown as Record<string, unknown>), kind: 'menu' });

/** 메뉴 이름 → 흔한 재료 (V4-5) */
export const fetchIngredients = (menu: string, basicSeasonings: readonly string[]) =>
  postTo<IngredientsAiResult>('/api/ingredients', { kind: 'ingredients', menu, basicSeasonings: [...basicSeasonings] });

/** 실패 이유 → 화면 문구 */
export const AI_FAILURE_TEXT: Record<AiFailure, string> = {
  'no-key': 'AI 연결 전이라 아직 읽을 수 없어요',
  offline: '인터넷에 연결되어 있지 않아요',
  'too-many': '잠깐 너무 많이 불렀어요. 조금 뒤에 다시 해 주세요',
  'too-large': '사진이 너무 커요. 잘라서 다시 올려 주세요',
  'bad-request': '이 파일은 읽을 수 없어요',
  'not-youtube': '유튜브 영상 링크가 아니에요',
  'video-not-found': '영상을 찾지 못했어요. 비공개거나 지워진 영상일 수 있어요',
  'ai-key': 'AI 키가 맞지 않아요. 관리자에게 키 설정을 확인해 달라고 해 주세요',
  'ai-credit': 'AI 사용 크레딧이 부족해요. 관리자에게 알려 주세요',
  'ai-model': '이 AI 키로는 쓸 수 없는 모델이에요. 관리자에게 알려 주세요',
  'ai-failed': 'AI가 읽지 못했어요. 다시 해 보거나 직접 입력해 주세요',
};
