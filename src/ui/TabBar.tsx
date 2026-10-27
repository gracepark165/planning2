import type { ReactNode } from 'react';

export type TabKey = 'home' | 'video' | 'order' | 'plan';

const TABS: { key: TabKey; label: string; icon: ReactNode }[] = [
  {
    key: 'home',
    label: '냉장고',
    icon: (
      <svg viewBox="0 0 24 24">
        <rect x="6" y="2.5" width="12" height="19" rx="3" />
        <path d="M6 10h12M9.5 6v1.5M9.5 13v3" />
      </svg>
    ),
  },
  {
    key: 'video',
    label: '영상 확인',
    icon: (
      <svg viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="14" rx="4" />
        <path d="M10 9.5v5l4.2-2.5z" />
      </svg>
    ),
  },
  {
    key: 'order',
    label: '장보기 올리기',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
      </svg>
    ),
  },
  {
    key: 'plan',
    label: '이번 주',
    icon: (
      <svg viewBox="0 0 24 24">
        <rect x="3.5" y="5" width="17" height="15" rx="3" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </svg>
    ),
  },
];

export function TabBar({ active, onChange }: { active: TabKey; onChange: (t: TabKey) => void }) {
  return (
    <nav className="tabbar">
      <div>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab ${active === t.key ? 'on' : ''}`}
            aria-current={active === t.key ? 'page' : undefined}
            onClick={() => onChange(t.key)}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
