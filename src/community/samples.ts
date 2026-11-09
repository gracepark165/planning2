// 커뮤니티 서버를 연결하기 전에 보여줄 예시 글 (화면에 "예시"라고 알린다)

import type { PostView } from './client';

const H = 3_600_000;

export function samplePosts(now: number): PostView[] {
  const author = (id: string, nick: string, avatar: string, area: string) => ({ id, nick, avatar, area });
  const base = { hasPhoto: false, liked: false, mine: false };
  return [
    {
      ...base,
      id: 'sample1',
      author: author('s1', '두부요정', '🍳', '망원동'),
      topic: 'meal',
      menu: '닭안심 간장덮밥',
      items: ['닭안심', '대파'],
      text: '내일까지인 닭안심 드디어 해치웠어요! 대파 듬뿍 넣고 간장 졸여서 덮밥으로 🙌',
      createdAt: now - 2 * H,
      likes: 24,
      comments: 5,
    },
    {
      ...base,
      id: 'sample2',
      author: author('s2', '자취10년차', '🐻', '연남동'),
      topic: 'tip',
      text: '대파는 씻어서 송송 썬 다음 키친타월 깔고 냉동하면 한 달은 거뜬해요. 지퍼백 말고 밀폐용기가 덜 뭉쳐요.',
      createdAt: now - 20 * H,
      likes: 18,
      comments: 3,
    },
    {
      ...base,
      id: 'sample3',
      author: author('s3', '양파부자', '🧅', '합정동'),
      topic: 'share',
      items: ['양파'],
      status: '나눔 중',
      text: '양파 한 망 샀는데 혼자 다 못 먹어요. 3개 나눠요! 망원역 근처에서 저녁에 받아 가실 분',
      createdAt: now - 5 * H,
      likes: 9,
      comments: 4,
    },
    {
      ...base,
      id: 'sample4',
      author: author('s4', '냉털장인', '🥦', '서교동'),
      topic: 'meal',
      menu: '두부 애호박 된장찌개',
      items: ['두부', '애호박'],
      text: '잊혀지던 애호박 반 개랑 두부로 된장찌개. 냉장고가 가벼워지니 마음도 가벼워요',
      createdAt: now - 30 * H,
      likes: 12,
      comments: 1,
    },
  ];
}

export const sampleRanking = (now: number) =>
  samplePosts(now)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 3);
