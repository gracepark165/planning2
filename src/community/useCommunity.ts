// 커뮤니티 공용 상태: 서버 연결 여부, 카카오 로그인 여부, 내 프로필·통계.
// 로그인하지 않은 방문자는 읽기만 한다 (2026-11-16). 프로필은 서버에만 둔다 (로그인한 회원만 있음).

import { useEffect, useState } from 'react';
import { community, fetchAuth, logout as doLogout, type AuthState, type MyStats, type Profile } from './client';

export type Conn = 'loading' | 'on' | 'off' | 'error';

export interface MeState {
  /** 커뮤니티 저장소 연결 (off = 아직 연결 전: 예시 글) */
  conn: Conn;
  /** 카카오 로그인 (undefined = 아직 모름) */
  auth?: AuthState;
  /** 로그인한 회원의 커뮤니티 프로필 */
  profile?: Profile;
  stats?: MyStats;
  /** 내 작성자 id (프로필 사진 주소에 씀) */
  authorId?: string;
}

let state: MeState = { conn: 'loading' };
const listeners = new Set<(s: MeState) => void>();
const set = (next: MeState) => {
  state = next;
  for (const l of listeners) l(state);
};

let loading: Promise<void> | undefined;
/** 서버에서 로그인·프로필·통계를 다시 읽는다 */
export function refreshMe(): Promise<void> {
  loading ??= (async () => {
    const [auth, r] = await Promise.all([fetchAuth(), community.me()]);
    const authState = auth ?? { loggedIn: false, configured: false };
    if (r.ok) {
      set({ conn: 'on', auth: authState, profile: r.data.profile, stats: r.data.stats, authorId: r.data.authorId });
      return;
    }
    const conn: Conn = r.reason === 'not-configured' ? 'off' : r.reason === 'login-required' ? 'on' : 'error';
    // 로그인 쿠키가 있어도 저장소가 연결 전이면 프로필은 없다
    set({ conn, auth: authState });
  })().finally(() => {
    loading = undefined;
  });
  return loading;
}

/** 프로필 저장 (로그인한 회원만). photo: 새 사진 data URL / null = 지우기 / 없음 = 그대로 */
export async function saveProfile(p: Profile, photo?: string | null): Promise<boolean> {
  const r = await community.saveProfile(p, photo);
  if (r.ok) await refreshMe(); // 사진 시각(photoV)은 서버가 정한다
  return r.ok;
}

export async function logout(): Promise<void> {
  await doLogout();
  set({ conn: state.conn, auth: { loggedIn: false, configured: state.auth?.configured ?? false } });
  await refreshMe();
}

/** 로그인해서 쓸 수 있는지: 저장소 연결 + 카카오 로그인 */
export const canWrite = (s: MeState) => s.conn === 'on' && !!s.auth?.loggedIn;

export function useMe(): MeState {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    setS(state);
    if (state.conn === 'loading' || state.conn === 'error') void refreshMe();
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}
