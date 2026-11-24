# 서버 연결하기: 커뮤니티 저장소 + 카카오 로그인

연결하기 전에도 앱은 동작해요. 커뮤니티는 예시 글만 보이고, `카카오로 시작하기`를 누르면 "카카오 로그인을 아직 연결하지 않았어요"가 떠요.
아래 1 → 2 → 3 → 4 순서로 한 번만 하면 돼요. 배포 주소는 `https://planning2-gold.vercel.app` 기준이에요.

## 1. 커뮤니티 저장소 (Upstash Redis) — Vercel에서

1. Vercel 대시보드 → planning2 프로젝트 → 위쪽 **Storage** 탭 → **Create Database** → **Upstash for Redis** (무료 요금제).
2. 지역은 한국과 가까운 곳(예: Tokyo `ap-northeast-1`).
3. 만든 저장소를 이 프로젝트에 **Connect**. 환경 변수 `KV_REST_API_URL`, `KV_REST_API_TOKEN`이 자동으로 들어가요.
   (Upstash에서 직접 만들었다면 `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`을 직접 넣어도 돼요.)

## 2. 카카오 앱 만들기 — developers.kakao.com

1. 카카오 계정으로 로그인 → **내 애플리케이션** → **애플리케이션 추가하기** (앱 이름 예: 냉집사).
2. **앱 → 플랫폼 키 → REST API 키**에서
   - **리다이렉트 URI**에 `https://planning2-gold.vercel.app/api/auth` 를 등록해요. 글자 하나라도 다르면 KOE006 오류가 나요.
   - 클라이언트 시크릿이 **사용함**으로 되어 있으면 그 값을 복사해 둬요(4단계의 `KAKAO_CLIENT_SECRET`). 사용 안 함이면 넣지 않아요.
   - **REST API 키** 값을 복사해 둬요(4단계의 `KAKAO_REST_API_KEY`).
3. **제품 설정 → 카카오 로그인**에서 **사용 설정 ON**.
4. **카카오 로그인 → 동의항목**에서 **닉네임**을 "필수 동의" 또는 "선택 동의"로 켜요. 이 앱은 회원번호와 닉네임만 받아요(사진·이메일은 받지 않음).
5. 앱 화면 이름이나 아이콘은 나중에 바꿔도 돼요. 처음에는 개발 중 상태라 **팀원으로 등록한 카카오 계정만** 로그인할 수 있을 수 있어요. 누구나 로그인하게 하려면 카카오디벨로퍼스 안내에 따라 앱을 운영 상태로 바꿔요(비즈 앱 전환이 필요할 수 있음).

## 3. 로그인 쿠키 서명 값 만들기

아무도 모르는 긴 글자를 하나 만들어요(32자 이상). 예를 들어 비밀번호 생성기로 48자를 만들거나, 터미널에서:

```bash
openssl rand -hex 32
```

이 값이 `AUTH_SECRET`이에요. 바꾸면 모두 다시 로그인해야 해요. 깃허브나 채팅에 올리지 마세요.

## 4. Vercel 환경 변수 넣고 다시 배포

Vercel → planning2 → **Settings → Environment Variables**에서 Production(필요하면 Preview도)에 넣어요.

| 이름 | 값 |
|---|---|
| `KAKAO_REST_API_KEY` | 2단계의 REST API 키 |
| `AUTH_SECRET` | 3단계에서 만든 값 |
| `KAKAO_CLIENT_SECRET` | (클라이언트 시크릿을 쓸 때만) |

### 오프닝 목소리 (선택, Fish Audio)

오프닝의 소개 글을 목소리로 읽어 주려면 [fish.audio](https://fish.audio)에서 API 키를 만들고, 마음에 드는 목소리(예: 아기 남자아이 목소리)를 골라 주소 끝의 긴 글자(모델 ID)를 복사해 `FISH_API_KEY`를 넣어요(목소리는 기본값이 정해져 있어요). 키가 없으면 목소리 버튼은 보이지 않아요.

| 이름 | 값 |
|---|---|
| `FISH_API_KEY` | Fish Audio → API Keys |
| `FISH_VOICE_ID` | (선택) 다른 목소리를 쓰고 싶을 때만. 기본은 `d58ebc8e84ee49ed96b08e3dc8051bbc` |
| `FISH_MODEL` | (선택) 기본 무료 모델 `s2.1-pro-free`. 계정에서 쓰는 모델 이름이 다르면 바꿔요 (`s1` 등) |

`/api/tts`는 코드에 적힌 소개 글만 읽고 결과를 오래 캐시해서, 한 번 만든 소리를 다시 쓰고 남이 마음대로 음성을 만들 수 없어요. 소개 글을 바꾸면 `api/tts.ts`와 `src/ui/OpeningView.tsx`의 글을 같이 고쳐요. 브라우저는 소리를 자동 재생하지 못하게 막을 때가 많아서, 그럴 땐 **🔈 목소리로 듣기** 버튼을 눌러 들어요.

오프닝은 서버에서 매번 만든 소리 대신 **다듬어 둔 파일 `public/intro-voice.mp3`**를 먼저 써요(끊김 없이 바로 나와요). 소개 글이나 목소리를 바꾸면 `/api/tts?line=intro`로 새 소리(`raw.mp3`)를 받아 아래처럼 다듬고 `public/intro-voice.mp3`를 바꿔요.

```bash
ffmpeg -i raw.mp3 -af "highpass=f=70,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.01,afade=t=in:d=0.03,loudnorm=I=-16:TP=-1.5:LRA=9,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,afade=t=in:d=0.12,areverse" -ar 44100 -ac 1 -c:a libmp3lame -q:a 2 public/intro-voice.mp3
```

그다음 **Deployments → 최신 배포 → Redeploy**. 환경 변수는 다시 배포해야 적용돼요.

## 5. 확인

1. 시크릿 창으로 사이트를 열어 오프닝에서 **카카오로 시작하기** → 카카오 동의 화면 → 앱으로 돌아와 "카카오로 로그인했어요".
2. 이번 주 → 커뮤니티 칸 → 글쓰기로 글을 올려 보고, 다른 폰(또는 다른 카카오 계정)에서 공감해 봐요.
3. **로그인 없이 둘러보기**로 들어가면 예시 냉장고가 보이고, 커뮤니티에서 글쓰기를 누르면 로그인 안내가 떠요.

## 구조 (개발자용)

- `api/auth.ts`: `GET /api/auth?start=1`(카카오로 보냄), `GET /api/auth?code=…`(돌아옴, 로그인 쿠키 `fs_session` 굽기, `state` 쿠키로 위조 방지), `POST {action:'me'|'logout'}`.
- 로그인 쿠키: 회원 uid(`kakao:회원번호`)·닉네임·만료(30일)를 `AUTH_SECRET`으로 HMAC 서명. HttpOnly·SameSite=Lax·Secure.
- `api/community.ts`: 같은 쿠키를 확인(`sessionFrom`). 읽기(목록·랭킹·글 보기)는 누구나, 쓰기·공감·댓글·지우기·프로필은 로그인한 회원만(`login-required`). 작성자 id는 uid의 해시라 카카오 회원번호가 글에 남지 않아요. 처음 프로필 이름은 카카오 닉네임.
- 냉장고 재료는 로그인과 상관없이 기기에만 저장해요.
- 내 컴퓨터(`npm run dev`): 저장소 키가 없으면 메모리 저장소, 카카오 키가 없으면 `카카오로 시작하기`가 **시험 로그인**("시험 사용자")으로 바로 돌아와요. 배포에서는 시험 로그인이 꺼져 있어요(`COMMUNITY_DEV_MEMORY`는 개발 서버만 켬). 실제 카카오로 시험하려면 리다이렉트 URI에 `http://localhost:5179/api/auth`도 등록하고 `.env.local`에 키를 넣어요.
