# 커뮤니티 서버 연결하기 (Upstash Redis)

커뮤니티 글·공감·댓글·랭킹은 모든 사용자가 같이 보도록 서버에 저장해요. 저장소를 연결하기 전에는 앱이 **예시 글**을 보여주고 글쓰기·공감은 막아요.

## 연결 순서 (Vercel 화면에서 한 번만)

1. Vercel 대시보드에서 이 프로젝트(planning2)를 열어요.
2. 위쪽 **Storage** 탭 → **Create Database** → **Upstash for Redis**(Marketplace)를 골라요. 무료 요금제로 충분해요.
3. 지역은 한국과 가까운 곳(예: Tokyo `ap-northeast-1`)을 골라요.
4. 만든 저장소를 이 프로젝트에 **Connect**해요. 그러면 환경 변수 `KV_REST_API_URL`, `KV_REST_API_TOKEN`이 자동으로 들어가요.
   - Upstash에서 직접 만들었다면 `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`을 직접 넣어도 돼요 (둘 중 하나만 있으면 됨).
5. **Deployments**에서 최신 배포를 **Redeploy** 해요. 환경 변수는 다시 배포해야 적용돼요.
6. 앱에서 커뮤니티를 열어 "예시 글이에요" 안내가 사라졌는지 확인해요.

## 구조

- 서버 함수: `api/community.ts` (POST `/api/community` 글·공감·댓글·프로필·랭킹, GET `/api/community?img=ID` 사진)
- 앱: `src/community/` (서버 호출·예시 글·사진 줄이기), 화면 `src/ui/CommunityView.tsx`
- 로그인 없음: 기기마다 비밀값(`fridge-community-secret`)을 만들어 두고, 서버는 그 해시로 작성자를 구분해요. 앱 데이터를 지우면 예전 글을 더는 지울 수 없어요.
- 제한: 글 500자, 댓글 200자, 사진은 640px JPEG로 줄여서 올림, 하루 글 20개·댓글 100개.
- 랭킹: 최근 7일 글 중 공감 많은 순 3개 (공감 0개는 빼요).

## 내 컴퓨터에서

`npm run dev`는 저장소 키가 없으면 **메모리 저장소**를 써요(개발 서버를 끄면 글이 사라짐). 실제 저장소로 시험하려면 `.env.local`에 위 환경 변수를 넣어요.

## 아직 없는 것

신고·차단, 글 고치기, 댓글 지우기, 알림. 공개 서비스로 열기 전에는 신고 기능과 운영 방침이 필요해요.
