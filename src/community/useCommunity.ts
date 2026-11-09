// 커뮤니티 공용 상태: 내 프로필·통계, 서버 연결 여부.
// 프로필은 기기에도 저장해서, 서버를 연결하기 전에도 이번 주 화면의 프로필 칸이 보이게 한다.

import { useEffect, useState } from 'react';
import { AVATARS, community, type MyStats, type Profile } from './client';

const PROFILE_KEY = 'fridge-community-profile';

export type Conn = 'loading' | 'on' | 'off' | 'error';

export interface MeState {
  conn: Conn;
  profile: Profile;
  stats?: MyStats;
}

const FALLBACK: Profile = { nick: '나', avatar: AVATARS[0], area: '' };

function localProfile(): Profile | undefined {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    const p = raw ? (JSON.parse(raw) as Profile) : undefined;
    return p && typeof p.nick === 'string' && typeof p.avatar === 'string' ? { ...p, area: p.area ?? '' } : undefined;
  } catch {
    return undefined;
  }
}

function storeLocal(p: Profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    // 저장 못 해도 이번에 연 동안은 보인다
  }
}

let state: MeState = { conn: 'loading', profile: localProfile() ?? FALLBACK };
const listeners = new Set<(s: MeState) => void>();
const set = (next: MeState) => {
  state = next;
  for (const l of listeners) l(state);
};

let loading: Promise<void> | undefined;
/** 서버에서 내 프로필·통계를 다시 읽는다. 기기에 저장한 프로필이 서버와 다르면 서버로 올린다. */
export function refreshMe(): Promise<void> {
  loading ??= (async () => {
    const r = await community.me();
    if (!r.ok) {
      set({ ...state, conn: r.reason === 'not-configured' ? 'off' : 'error' });
      return;
    }
    const local = localProfile();
    // 이 기기에서 먼저 정해 둔 프로필이 있으면 서버에도 올린다 (서버 연결 전에 만든 프로필)
    if (local && (local.nick !== r.data.profile.nick || local.avatar !== r.data.profile.avatar || local.area !== r.data.profile.area)) {
      const saved = await community.saveProfile(local);
      set({ conn: 'on', profile: saved.ok ? local : r.data.profile, stats: r.data.stats });
      return;
    }
    storeLocal(r.data.profile);
    set({ conn: 'on', profile: r.data.profile, stats: r.data.stats });
  })().finally(() => {
    loading = undefined;
  });
  return loading;
}

/** 프로필 저장: 기기에 먼저, 서버가 연결돼 있으면 서버에도 */
export async function saveProfile(p: Profile): Promise<boolean> {
  storeLocal(p);
  set({ ...state, profile: p });
  if (state.conn !== 'on') return true;
  const r = await community.saveProfile(p);
  return r.ok;
}

export function useMe(): MeState {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    if (state.conn === 'loading' || state.conn === 'error') void refreshMe();
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}
