// 커뮤니티 (2026-11-09, 사용자 요청): 인아웃처럼 끼니 인증에 공감·댓글, 당근 동네생활처럼 주제별 글·나눔 상태.
// 글은 모든 사용자가 같이 본다(서버: api/community.ts). 서버를 연결하기 전에는 예시 글을 보여주고 글쓰기는 막는다.
// 한 화면 안에서 목록 → 글 보기 → 글쓰기 → 프로필을 오간다.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AVATARS,
  LIMITS,
  SHARE_STATUSES,
  TOPICS,
  community,
  failureText,
  imageUrl,
  type CommentView,
  type PostView,
  type Profile,
  type ShareStatus,
  type Topic,
} from '../community/client';
import { shrinkPhoto } from '../community/photo';
import { samplePosts } from '../community/samples';
import { STATUS_CLASS, TOPIC_META, timeAgo } from '../community/text';
import { refreshMe, saveProfile, useMe } from '../community/useCommunity';
import { stateOf, daysLeft } from '../rules/status';
import type { DateKey, Item } from '../rules/types';
import { BackButton } from './parts';

export type CommunityPage = { view: 'feed' } | { view: 'post'; id: string } | { view: 'write'; topic?: Topic } | { view: 'profile' };

interface Props {
  start: CommunityPage;
  items: Item[];
  today: DateKey;
  onBack: () => void;
  onToast: (msg: string) => void;
}

function Avatar({ emoji, size = 36 }: { emoji: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.58 }} aria-hidden="true">
      {emoji}
    </span>
  );
}

function PostCard({
  p,
  now,
  full = false,
  preview,
  onOpen,
  onLike,
}: {
  p: PostView;
  now: number;
  full?: boolean;
  preview: boolean;
  onOpen?: () => void;
  onLike: () => void;
}) {
  const meta = TOPIC_META[p.topic];
  return (
    <article className={`post ${full ? 'full' : ''}`}>
      <button className="post-body" onClick={onOpen} disabled={!onOpen} aria-label={onOpen ? `${p.author.nick}의 글 보기` : undefined}>
        <div className="post-head">
          <Avatar emoji={p.author.avatar} />
          <div className="who">
            <b>{p.author.nick}</b>
            <span>
              {p.author.area ? `${p.author.area} · ` : ''}
              {timeAgo(p.createdAt, now)}
            </span>
          </div>
          <span className={`tag topic t-${p.topic}`}>
            {meta.emoji} {meta.label}
          </span>
        </div>
        {p.status && <span className={`share-status ${STATUS_CLASS[p.status]}`}>{p.status}</span>}
        {p.menu && <h3 className="post-menu">{p.menu}</h3>}
        <p className={`post-text ${full ? '' : 'clamp'}`}>{p.text}</p>
        {p.hasPhoto && <img className="post-photo" src={imageUrl(p.id)} alt={p.menu ? `${p.menu} 사진` : '올린 사진'} loading="lazy" />}
        {p.items && (
          <div className="post-items">
            {p.items.map((n) => (
              <span key={n} className="tag">
                #{n}
              </span>
            ))}
          </div>
        )}
      </button>
      <div className="post-foot">
        <button className={`like ${p.liked ? 'on' : ''}`} aria-pressed={p.liked} onClick={onLike}>
          {p.liked ? '♥' : '♡'} 공감 {p.likes}
        </button>
        <span className="cmt">💬 댓글 {p.comments}</span>
        {preview && <span className="tag sample">예시</span>}
      </div>
    </article>
  );
}

export function CommunityView({ start, items, today, onBack, onToast }: Props) {
  const me = useMe();
  const preview = me.conn === 'off';
  const [page, setPage] = useState<CommunityPage>(start);
  const [now, setNow] = useState(Date.now());
  useEffect(() => setPage(start), [start]);
  useEffect(() => {
    window.scrollTo(0, 0);
    setNow(Date.now());
  }, [page]);

  const offline = useCallback(() => onToast('지금은 예시 글이에요. 커뮤니티 서버를 연결하면 쓸 수 있어요'), [onToast]);

  // ── 목록 ──
  const [topic, setTopic] = useState<Topic | undefined>(undefined);
  const [posts, setPosts] = useState<PostView[] | null>(null);
  const [next, setNext] = useState<number | undefined>();
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadFeed = useCallback(
    async (more = false) => {
      if (me.conn === 'loading') return;
      if (me.conn === 'off') {
        setPosts(samplePosts(Date.now()).filter((p) => !topic || p.topic === topic));
        setNext(undefined);
        return;
      }
      const r = await community.feed(topic, more ? next : undefined);
      if (!r.ok) {
        setLoadError(failureText(r.reason));
        if (!more) setPosts([]);
        return;
      }
      setLoadError(null);
      setPosts((old) => (more && old ? [...old, ...r.data.posts] : r.data.posts));
      setNext(r.data.next);
    },
    [me.conn, topic, next],
  );
  useEffect(() => {
    if (page.view === 'feed') void loadFeed(false);
    // 주제·연결 상태가 바뀔 때만 처음부터 다시
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.view, topic, me.conn]);

  const replace = (p: PostView) => {
    setPosts((old) => old?.map((x) => (x.id === p.id ? p : x)) ?? old);
    setDetail((d) => (d && d.post.id === p.id ? { ...d, post: p } : d));
  };
  const like = async (p: PostView) => {
    if (preview) return offline();
    // 먼저 화면을 바꾸고, 서버 결과로 맞춘다
    replace({ ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) });
    const r = await community.like(p.id);
    if (r.ok) replace(r.data);
    else {
      replace(p);
      onToast(failureText(r.reason));
    }
  };

  // ── 글 보기 ──
  const [detail, setDetail] = useState<{ post: PostView; comments: CommentView[] } | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const loadDetail = useCallback(
    async (id: string) => {
      setDetail(null);
      if (me.conn === 'loading') return;
      if (me.conn === 'off') {
        const p = samplePosts(Date.now()).find((x) => x.id === id);
        setDetail(p ? { post: p, comments: [] } : null);
        return;
      }
      const r = await community.post(id);
      if (r.ok) setDetail(r.data);
      else {
        onToast(failureText(r.reason));
        setPage({ view: 'feed' });
      }
    },
    [me.conn, onToast],
  );
  useEffect(() => {
    if (page.view === 'post') void loadDetail(page.id);
  }, [page, loadDetail]);

  const sendComment = async () => {
    if (!detail || !comment.trim()) return;
    if (preview) return offline();
    setSending(true);
    const r = await community.comment(detail.post.id, comment.trim());
    setSending(false);
    if (!r.ok) return onToast(failureText(r.reason));
    setComment('');
    await loadDetail(detail.post.id);
  };

  const setStatus = async (status: ShareStatus) => {
    if (!detail) return;
    const r = await community.status(detail.post.id, status);
    if (!r.ok) return onToast(failureText(r.reason));
    replace({ ...detail.post, status });
    onToast(`${status}으로 바꿨어요`);
  };
  const remove = async () => {
    if (!detail || !window.confirm('이 글을 지울까요? 공감과 댓글도 같이 지워져요.')) return;
    const r = await community.remove(detail.post.id);
    if (!r.ok) return onToast(failureText(r.reason));
    setPosts((old) => old?.filter((x) => x.id !== detail.post.id) ?? old);
    onToast('글을 지웠어요');
    setPage({ view: 'feed' });
    void refreshMe();
  };

  // ── 글쓰기 ──
  const [wTopic, setWTopic] = useState<Topic>('meal');
  const [wText, setWText] = useState('');
  const [wMenu, setWMenu] = useState('');
  const [wItems, setWItems] = useState<string[]>([]);
  const [wPhoto, setWPhoto] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (page.view !== 'write') return;
    setWTopic(page.topic ?? 'meal');
    setWText('');
    setWMenu('');
    setWItems([]);
    setWPhoto(undefined);
  }, [page]);
  // 나눔·인증에 고를 재료: 얼른 먹어야 할 것 먼저, 이름이 같은 건 하나만
  const pickable = [...new Map(items.map((i) => [i.name, i])).values()].sort((a, b) => daysLeft(a, today) - daysLeft(b, today));
  const toggleItem = (n: string) =>
    setWItems((xs) => (xs.includes(n) ? xs.filter((x) => x !== n) : xs.length >= LIMITS.items ? xs : [...xs, n]));
  const onPhoto = async (f: File | undefined) => {
    if (!f) return;
    try {
      const data = await shrinkPhoto(f);
      if (data.length > LIMITS.photo) return onToast('사진이 너무 커요. 다른 사진을 골라 주세요');
      setWPhoto(data);
    } catch {
      onToast('사진을 읽지 못했어요');
    }
  };
  const submit = async () => {
    if (preview) return offline();
    if (!wText.trim()) return onToast('내용을 적어 주세요');
    setSending(true);
    const r = await community.create({
      topic: wTopic,
      text: wText.trim(),
      ...(wTopic === 'meal' && wMenu.trim() ? { menu: wMenu.trim() } : {}),
      ...(wItems.length && wTopic !== 'tip' ? { items: wItems } : {}),
      ...(wPhoto ? { photo: wPhoto } : {}),
    });
    setSending(false);
    if (!r.ok) return onToast(failureText(r.reason));
    onToast('글을 올렸어요');
    setTopic(undefined);
    setPage({ view: 'post', id: r.data.id });
    void refreshMe();
  };

  // ── 프로필 ──
  const [pNick, setPNick] = useState(me.profile.nick);
  const [pAvatar, setPAvatar] = useState(me.profile.avatar);
  const [pArea, setPArea] = useState(me.profile.area);
  useEffect(() => {
    if (page.view !== 'profile') return;
    setPNick(me.profile.nick);
    setPAvatar(me.profile.avatar);
    setPArea(me.profile.area);
  }, [page, me.profile]);
  const saveMine = async () => {
    const nick = pNick.trim();
    if (!nick) return onToast('닉네임을 적어 주세요');
    const ok = await saveProfile({ nick: nick.slice(0, LIMITS.nick), avatar: pAvatar, area: pArea.trim().slice(0, LIMITS.area) } as Profile);
    onToast(ok ? '프로필을 저장했어요' : '이 기기에 저장했어요. 서버에는 다음에 올릴게요');
    setPage({ view: 'feed' });
  };

  const back = () => (page.view === 'feed' || page.view === start.view ? onBack() : setPage({ view: 'feed' }));

  const previewNote = preview && (
    <div className="notice community-note">
      <span>지금 보이는 건 예시 글이에요. 커뮤니티 서버를 연결하면 이웃 글이 보이고 글을 쓸 수 있어요.</span>
    </div>
  );

  if (page.view === 'profile') {
    return (
      <>
        <BackButton onClick={back} />
        <h1>내 프로필</h1>
        <p className="lead">커뮤니티 글에 이 이름과 그림이 보여요.</p>
        <div className="profile-preview">
          <Avatar emoji={pAvatar} size={64} />
          <div>
            <b>{pNick.trim() || '닉네임'}</b>
            <span>{pArea.trim() || '동네를 적으면 나눔 글에 보여요'}</span>
          </div>
        </div>
        <div className="eyebrow">그림</div>
        <div className="avatar-grid" role="radiogroup" aria-label="프로필 그림">
          {AVATARS.map((a) => (
            <button key={a} className={a === pAvatar ? 'on' : ''} role="radio" aria-checked={a === pAvatar} onClick={() => setPAvatar(a)}>
              {a}
            </button>
          ))}
        </div>
        <div className="eyebrow">닉네임</div>
        <input type="text" value={pNick} maxLength={LIMITS.nick} onChange={(e) => setPNick(e.target.value)} aria-label="닉네임" />
        <div className="eyebrow">동네 (선택)</div>
        <input type="text" value={pArea} maxLength={LIMITS.area} placeholder="예: 망원동" onChange={(e) => setPArea(e.target.value)} aria-label="동네" />
        {me.stats && (
          <p className="note">
            최근 7일 글 {me.stats.weekPosts}개 · 받은 공감 {me.stats.weekLikes}개 · 지금까지 글 {me.stats.totalPosts}개
          </p>
        )}
        <div className="ctas">
          <button className="cta" onClick={saveMine}>
            저장할게요
          </button>
        </div>
      </>
    );
  }

  if (page.view === 'write') {
    return (
      <>
        <BackButton onClick={back} />
        <h1>어떤 이야기를 나눌까요?</h1>
        {previewNote}
        <div className="seg">
          {TOPICS.map((t) => (
            <button key={t} className={wTopic === t ? 'on' : ''} onClick={() => setWTopic(t)}>
              {TOPIC_META[t].emoji} {TOPIC_META[t].label}
            </button>
          ))}
        </div>
        <p className="note">{TOPIC_META[wTopic].hint}</p>

        {wTopic === 'meal' && (
          <>
            <div className="eyebrow">메뉴 (선택)</div>
            <input type="text" value={wMenu} maxLength={LIMITS.menu} placeholder="예: 닭안심 간장덮밥" onChange={(e) => setWMenu(e.target.value)} aria-label="메뉴 이름" />
          </>
        )}
        {wTopic !== 'tip' && pickable.length > 0 && (
          <>
            <div className="eyebrow">{wTopic === 'share' ? '나눌 재료' : '쓴 재료'} (선택, 내 냉장고)</div>
            <div className="chips" style={{ flexWrap: 'wrap', padding: 0 }}>
              {pickable.slice(0, 24).map((i) => (
                <button key={i.name} className={`chip ${wItems.includes(i.name) ? 'on' : ''}`} aria-pressed={wItems.includes(i.name)} onClick={() => toggleItem(i.name)}>
                  {stateOf(i, today) === 'soon' ? '😭 ' : ''}
                  {i.name}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="eyebrow">내용</div>
        <textarea
          className="post-input"
          value={wText}
          maxLength={LIMITS.text}
          rows={5}
          placeholder={
            wTopic === 'share'
              ? '나눌 양, 받을 수 있는 시간·장소를 적어 주세요'
              : wTopic === 'tip'
                ? '궁금한 것이나 알려 주고 싶은 꿀팁을 적어 주세요'
                : '어떤 재료로 어떻게 만들었는지 적어 주세요'
          }
          onChange={(e) => setWText(e.target.value)}
          aria-label="내용"
        />
        <p className="note" style={{ textAlign: 'right' }}>
          {wText.length}/{LIMITS.text}
        </p>

        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />
        {wPhoto ? (
          <div className="photo-pick">
            <img src={wPhoto} alt="고른 사진" />
            <button className="small-btn alt" onClick={() => setWPhoto(undefined)}>
              사진 빼기
            </button>
          </div>
        ) : (
          <button className="small-btn" onClick={() => fileRef.current?.click()}>
            📷 사진 넣기 (선택)
          </button>
        )}
        {wTopic === 'share' && <p className="note">나눔은 이웃끼리 직접 만나요. 상한 재료는 올리지 말아 주세요.</p>}

        <div className="ctas">
          <button className="cta" disabled={sending || !wText.trim()} onClick={submit}>
            {sending ? '올리는 중…' : '올릴게요'}
          </button>
        </div>
      </>
    );
  }

  if (page.view === 'post') {
    const p = detail?.post;
    return (
      <>
        <BackButton onClick={back} />
        {previewNote}
        {!p ? (
          <p className="lead" style={{ padding: '32px 0', textAlign: 'center' }}>
            글을 불러오는 중이에요
          </p>
        ) : (
          <>
            <PostCard p={p} now={now} full preview={preview} onLike={() => void like(p)} />
            {p.mine && (
              <div className="owner-acts">
                {p.topic === 'share' &&
                  SHARE_STATUSES.map((s) => (
                    <button key={s} className={`chip ${p.status === s ? 'on' : ''}`} onClick={() => void setStatus(s)}>
                      {s}
                    </button>
                  ))}
                <button className="note" style={{ textDecoration: 'underline', marginLeft: 'auto' }} onClick={() => void remove()}>
                  글 지우기
                </button>
              </div>
            )}
            <div className="eyebrow">댓글 {detail.comments.length}</div>
            {detail.comments.length === 0 && <p className="note">{preview ? '예시 글에는 댓글을 볼 수 없어요.' : '첫 댓글을 남겨 보세요.'}</p>}
            <ul className="comments">
              {detail.comments.map((c) => (
                <li key={c.id}>
                  <Avatar emoji={c.author.avatar} size={28} />
                  <div>
                    <b>
                      {c.author.nick}
                      {c.mine && <span className="tag">나</span>}
                    </b>
                    <span className="when">{timeAgo(c.createdAt, now)}</span>
                    <p>{c.text}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="name-input comment-input">
              <input type="text"
                value={comment}
                maxLength={LIMITS.comment}
                placeholder="따뜻한 댓글을 남겨 주세요"
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && void sendComment()}
                aria-label="댓글"
              />
              <button className="small-btn" disabled={sending || !comment.trim()} onClick={() => void sendComment()}>
                남기기
              </button>
            </div>
          </>
        )}
        <div className="fab-space" aria-hidden="true" />
      </>
    );
  }

  // 목록
  return (
    <>
      <BackButton onClick={back} />
      <h1>이웃 커뮤니티</h1>
      <p className="lead">냉장고 재료로 만든 한 끼, 나눔, 꿀팁을 나눠요.</p>
      <button className="me-row" onClick={() => setPage({ view: 'profile' })}>
        <Avatar emoji={me.profile.avatar} size={32} />
        <b>{me.profile.nick}</b>
        <span>{me.profile.area || '동네 미설정'}</span>
        <span className="go">프로필 고치기 ›</span>
      </button>
      {previewNote}
      <div className="chips">
        <button className={`chip ${!topic ? 'on' : ''}`} onClick={() => setTopic(undefined)}>
          전체
        </button>
        {TOPICS.map((t) => (
          <button key={t} className={`chip ${topic === t ? 'on' : ''}`} onClick={() => setTopic(t)}>
            {TOPIC_META[t].emoji} {TOPIC_META[t].label}
          </button>
        ))}
      </div>
      {loadError && <p className="note">{loadError}</p>}
      {posts === null ? (
        <p className="lead" style={{ padding: '32px 0', textAlign: 'center' }}>
          글을 불러오는 중이에요
        </p>
      ) : posts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <h3>아직 글이 없어요</h3>
          <p>첫 글을 올려 이웃에게 인사해 보세요.</p>
        </div>
      ) : (
        posts.map((p) => (
          <PostCard key={p.id} p={p} now={now} preview={preview} onOpen={() => setPage({ view: 'post', id: p.id })} onLike={() => void like(p)} />
        ))
      )}
      {next && (
        <button className="cta ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => void loadFeed(true)}>
          더 보기
        </button>
      )}
      <div className="fab-space" aria-hidden="true" />
      <button className="fab" onClick={() => (preview ? offline() : setPage({ view: 'write', topic }))}>
        ✏️ 글쓰기
      </button>
    </>
  );
}

/** 이번 주 화면 맨 위: 내 프로필 칸 + 커뮤니티 칸 (예전 "최근 7일 요약" 자리) */
export function ProfileCommunityCards({
  eaten,
  discarded,
  onProfile,
  onCommunity,
}: {
  /** 최근 7일 먹은·버린 재료 수 (냉장고 기록) */
  eaten: number;
  discarded: number;
  onProfile: () => void;
  onCommunity: () => void;
}) {
  const me = useMe();
  const [latest, setLatest] = useState<PostView | null | undefined>(undefined);
  useEffect(() => {
    if (me.conn === 'loading') return;
    if (me.conn !== 'on') {
      setLatest(samplePosts(Date.now())[0]);
      return;
    }
    let live = true;
    void community.feed().then((r) => live && setLatest(r.ok ? (r.data.posts[0] ?? null) : null));
    return () => {
      live = false;
    };
  }, [me.conn]);

  return (
    <div className="duo">
      <button className="card duo-card profile-card" onClick={onProfile}>
        <div className="eyebrow" style={{ marginTop: 0 }}>
          내 프로필
        </div>
        <div className="pc-head">
          <Avatar emoji={me.profile.avatar} size={40} />
          <div>
            <b>{me.profile.nick}</b>
            <span>{me.profile.area || '동네 미설정'}</span>
          </div>
        </div>
        <ul className="pc-stats">
          <li>
            최근 7일 먹은 재료 <b>{eaten}</b> · 버린 재료 <b>{discarded}</b>
          </li>
          {me.stats && (
            <li>
              이번 주 글 <b>{me.stats.weekPosts}</b> · 공감 <b>{me.stats.weekLikes}</b>
            </li>
          )}
        </ul>
      </button>
      <button className="card duo-card community-card" onClick={onCommunity}>
        <div className="eyebrow" style={{ marginTop: 0 }}>
          커뮤니티
        </div>
        {latest ? (
          <>
            <p className="cc-snip">
              {TOPIC_META[latest.topic].emoji} {latest.menu ?? latest.text}
            </p>
            <span className="cc-by">
              {latest.author.avatar} {latest.author.nick} · ♥ {latest.likes}
              {me.conn !== 'on' && <span className="tag sample">예시</span>}
            </span>
          </>
        ) : (
          <p className="cc-snip">{latest === null ? '첫 글을 올려 보세요' : '불러오는 중이에요'}</p>
        )}
        <span className="go">이웃 글 보기 ›</span>
      </button>
    </div>
  );
}

/** 냉장고 맨 위: 이번 주 공감 랭킹 (예전 "예시 재료" 안내 카드 자리) */
export function RankingCard({ onOpen, onAll }: { onOpen: (id: string) => void; onAll: () => void }) {
  const me = useMe();
  const [rank, setRank] = useState<PostView[] | undefined>(undefined);
  useEffect(() => {
    if (me.conn === 'loading') return;
    if (me.conn !== 'on') {
      setRank(
        samplePosts(Date.now())
          .sort((a, b) => b.likes - a.likes)
          .slice(0, 3),
      );
      return;
    }
    let live = true;
    void community.ranking().then((r) => live && setRank(r.ok ? r.data : []));
    return () => {
      live = false;
    };
  }, [me.conn]);
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <section className="card ranking" aria-label="이번 주 공감 랭킹">
      <div className="rk-head">
        <h3>🏆 이번 주 공감 랭킹</h3>
        <button className="go" onClick={onAll}>
          커뮤니티 ›
        </button>
      </div>
      {rank === undefined ? (
        <p className="note">불러오는 중이에요</p>
      ) : rank.length === 0 ? (
        <button className="rk-empty" onClick={onAll}>
          이번 주에 공감받은 글이 아직 없어요. 첫 글을 올려 볼까요?
        </button>
      ) : (
        <ol>
          {rank.map((p, i) => (
            <li key={p.id}>
              <button onClick={() => (me.conn === 'on' ? onOpen(p.id) : onAll())}>
                <span className="medal">{medals[i]}</span>
                <span className="rk-text">
                  <b>{p.menu ?? p.text}</b>
                  <span>
                    {p.author.avatar} {p.author.nick} · {TOPIC_META[p.topic].label}
                  </span>
                </span>
                <span className="rk-likes">♥ {p.likes}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {me.conn !== 'on' && rank && rank.length > 0 && <p className="note rk-note">예시 랭킹이에요. 커뮤니티 서버를 연결하면 진짜 순위가 보여요.</p>}
    </section>
  );
}

