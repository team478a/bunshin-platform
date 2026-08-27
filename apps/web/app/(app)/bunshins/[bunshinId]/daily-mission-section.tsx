'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  progressStatusLabel,
  weeklyCalendar,
  type MissionProgressView,
} from '../../../../src/activity-progress';

export type DailyMissionView = {
  id: string;
  missionDate: string;
  status: 'GENERATED' | 'VIEWED' | 'STARTED' | 'COMPLETED' | 'SKIPPED' | 'EXPIRED';
  format: 'TEXT' | 'SLIDE' | 'IMAGE' | 'LIVE_ACTION' | 'AI_VIDEO_PROMPT';
  assistanceLevel: ContentAssistanceLevel;
  estimatedMinutes: number;
  topic: string;
  angle: string;
  reason: string;
  campaignId: string | null;
  classification: 'ORGANIC' | 'PRODUCT_RELATED' | 'ADVERTISEMENT';
  qualityScore: number | null;
  content: Record<string, unknown>;
  decision: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  rejectionReason: string | null;
  platform: 'INSTAGRAM' | 'TIKTOK' | 'X' | 'THREADS' | 'YOUTUBE_SHORTS' | 'OTHER' | null;
  postedAt: string | null;
  feedback: 'GOOD' | 'NEUTRAL' | 'BAD' | null;
  trendContext: {
    whyNow: string;
    fitReason: string;
    researchedAt: string;
    evidence: Array<{
      sourceUrl: string;
      sourceTitle: string;
      publishedAt: string | null;
      retrievedAt: string;
    }>;
  } | null;
  externalLinkUsage?: {
    linkName: string;
    insertedUrl: string;
    expiresAt: string | null;
    productName: string;
    campaignName: string | null;
    advertisingClassification: 'ORGANIC' | 'PRODUCT_RELATED' | 'ADVERTISEMENT';
  } | null;
};

export type ContentAssistanceLevel = 'IDEA_ONLY' | 'GUIDED' | 'READY_TO_USE';

export const missionAssistanceOptions = [
  { value: 'IDEA_ONLY', label: '企画を見る', help: 'テーマと、伝えるポイントを確認します。' },
  { value: 'GUIDED', label: '作り方を見る', help: '作る順番や進め方も確認します。' },
  { value: 'READY_TO_USE', label: '完成版を見る', help: 'そのまま使える文章や台本を確認します。' },
] as const satisfies ReadonlyArray<{
  value: ContentAssistanceLevel;
  label: string;
  help: string;
}>;

const platformLabels: Record<NonNullable<DailyMissionView['platform']>, string> = {
  INSTAGRAM: 'インスタグラム',
  TIKTOK: 'ティックトック',
  X: 'X（旧ツイッター）',
  THREADS: 'スレッズ',
  YOUTUBE_SHORTS: 'ユーチューブ ショート',
  OTHER: 'その他',
};

function text(value: unknown) {
  return typeof value === 'string' ? value : null;
}
function records(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === 'object' && !Array.isArray(item),
      )
    : [];
}
function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function missionGuide(mission: DailyMissionView) {
  const content = mission.content;
  if (mission.format === 'TEXT') {
    const parts = strings(content['threadParts']);
    return [
      '最初に、読む人が気になるひと言を書きます。',
      parts.length > 0
        ? `次に、話を${parts.length + 1}つに分けて順番に伝えます。`
        : '次に、いちばん伝えたいことを分かりやすく説明します。',
      text(content['cta'])
        ? '最後に、読んだ人にしてほしいことを伝えます。'
        : '最後に、短いまとめを書きます。',
    ];
  }
  if (mission.format === 'SLIDE') {
    return records(content['slides']).map((slide, index) => {
      const headline = text(slide['headline']);
      return `${index + 1}枚目${headline ? `「${headline}」` : ''}を作ります。`;
    });
  }
  if (mission.format === 'LIVE_ACTION') {
    const instruction = text(content['shootingInstruction']);
    const scenes = records(content['script']);
    return [
      ...(instruction ? [instruction] : []),
      scenes.length > 0
        ? `${scenes.length}つの場面に分けて、上から順番に撮ります。`
        : '最初・説明・まとめの順番で撮ります。',
    ];
  }
  if (mission.format === 'AI_VIDEO_PROMPT') {
    return [
      '最初に、動画で伝えたいことを1つに決めます。',
      '次に、場面の順番と動画の雰囲気を決めます。',
      '最後に、完成版の指示文を動画を作るAIへ入れます。',
    ];
  }
  return [
    '最初に、画像でいちばん伝えたいことを決めます。',
    '次に、色・配置・画像の中に入れる文字を決めます。',
    '最後に、完成版の指示文を画像を作るAIや制作サービスへ入れます。',
  ];
}

function MissionIdea({ mission }: { mission: DailyMissionView }) {
  return (
    <div className="mission-assistance-content">
      <h4>今日の企画</h4>
      <p>
        <strong>テーマ：</strong>
        {mission.topic}
      </p>
      <p>
        <strong>伝え方：</strong>
        {mission.angle}
      </p>
      <p>
        <strong>この企画にした理由：</strong>
        {mission.reason}
      </p>
    </div>
  );
}

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium' }).format(date);
}

function MissionTrendContext({ mission }: { mission: DailyMissionView }) {
  const context = mission.trendContext;
  if (!context) return null;
  return (
    <aside className="mission-trend-context" aria-label="この企画で参考にした新しい情報">
      <h4>新しい情報も参考にしました</h4>
      <p>調べた情報をそのまま写さず、あなたに合う企画にしています。</p>
      <dl>
        <div>
          <dt>今おすすめする理由</dt>
          <dd>{context.whyNow}</dd>
        </div>
        <div>
          <dt>あなたに合う理由</dt>
          <dd>{context.fitReason}</dd>
        </div>
      </dl>
      <details>
        <summary>参考にした情報を見る</summary>
        <ul>
          {context.evidence.map((item) => (
            <li key={item.sourceUrl}>
              <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                {item.sourceTitle}
              </a>
              <small>
                {item.publishedAt && `公開：${displayDate(item.publishedAt)} / `}
                確認：{displayDate(item.retrievedAt)}
              </small>
            </li>
          ))}
        </ul>
        <p>情報を確認した日：{displayDate(context.researchedAt)}</p>
      </details>
    </aside>
  );
}

function MissionGuide({ mission }: { mission: DailyMissionView }) {
  return (
    <div className="mission-assistance-content">
      <h4>作り方</h4>
      <ol>
        {missionGuide(mission).map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

function MissionContent({ mission }: { mission: DailyMissionView }) {
  const content = mission.content;
  if (mission.format === 'TEXT') {
    return (
      <div>
        <p>{text(content['body'])}</p>
        {strings(content['threadParts']).map((part, index) => (
          <p key={index}>{part}</p>
        ))}
        {text(content['cta']) && <p>CTA: {text(content['cta'])}</p>}
      </div>
    );
  }
  if (mission.format === 'SLIDE') {
    return (
      <ol>
        {records(content['slides']).map((slide, index) => (
          <li key={index}>
            <strong>{text(slide['headline'])}</strong>
            <p>{text(slide['body'])}</p>
          </li>
        ))}
      </ol>
    );
  }
  if (mission.format === 'LIVE_ACTION') {
    return (
      <div>
        <p>撮影指示: {text(content['shootingInstruction'])}</p>
        <ol>
          {records(content['script']).map((part, index) => (
            <li key={index}>
              {text(part['seconds'])}: {text(part['text'])}
            </li>
          ))}
        </ol>
      </div>
    );
  }
  if (mission.format === 'AI_VIDEO_PROMPT') {
    return (
      <div>
        <p>AI動画を作るための説明：</p>
        <p>{text(content['prompt'])}</p>
        {text(content['caption']) && <p>投稿文: {text(content['caption'])}</p>}
      </div>
    );
  }
  return (
    <div>
      <p>画像制作指示: {text(content['imageInstruction'])}</p>
      {text(content['overlayText']) && <p>画像内テキスト: {text(content['overlayText'])}</p>}
      <p>投稿文: {text(content['caption'])}</p>
    </div>
  );
}

const rejectionReasons = [
  ['NOT_MY_STYLE', '自分らしくない'],
  ['WRONG_TOPIC', '話題が違う'],
  ['TOO_DIFFICULT', '難しすぎる'],
  ['TOO_MUCH_WORK', '作業が多すぎる'],
  ['SIMILAR_TO_PAST', '過去と似ている'],
  ['TOO_SALESY', '売り込み感が強い'],
  ['NOT_TODAY', '今日は違う'],
] as const;

export function copyOptions(mission: DailyMissionView) {
  const content = mission.content;
  const caption = text(content['caption']);
  if (mission.format === 'TEXT') {
    const value = [text(content['body']), ...strings(content['threadParts']), text(content['cta'])]
      .filter(Boolean)
      .join('\n\n');
    return value ? [{ label: '投稿文をコピー', value, type: 'COPIED_TEXT' as const }] : [];
  }
  if (mission.format === 'SLIDE') {
    const slides = records(content['slides']).map((slide, index) => ({
      label: `${index + 1}枚目をコピー`,
      value: [text(slide['headline']), text(slide['body'])].filter(Boolean).join('\n'),
      type: 'COPIED_SLIDE' as const,
      metadata: { slideIndex: index + 1 },
    }));
    const all = slides
      .map(({ value }) => value)
      .filter(Boolean)
      .join('\n\n---\n\n');
    return [
      ...(all ? [{ label: '全部コピー', value: all, type: 'COPIED_SLIDE' as const }] : []),
      ...slides,
    ];
  }
  if (mission.format === 'AI_VIDEO_PROMPT') {
    return [
      {
        label: 'AI動画を作るための説明をコピー',
        value: text(content['prompt']),
        type: 'COPIED_VIDEO_PROMPT' as const,
      },
      { label: '投稿文をコピー', value: caption, type: 'COPIED_TEXT' as const },
    ].filter((item): item is typeof item & { value: string } => item.value !== null);
  }
  if (mission.format === 'LIVE_ACTION') {
    const script = records(content['script'])
      .map((part) => `${text(part['seconds']) ?? ''}: ${text(part['text']) ?? ''}`)
      .join('\n');
    return [
      { label: '撮影台本をコピー', value: script || null, type: 'COPIED_SCRIPT' as const },
      { label: '投稿文をコピー', value: caption, type: 'COPIED_TEXT' as const },
    ].filter((item): item is typeof item & { value: string } => item.value !== null);
  }
  return [
    {
      label: '画像を作るための説明をコピー',
      value: text(content['imageInstruction']),
      type: 'COPIED_IMAGE_INSTRUCTION' as const,
    },
    { label: '投稿文をコピー', value: caption, type: 'COPIED_TEXT' as const },
  ].filter((item): item is typeof item & { value: string } => item.value !== null);
}

export function DailyMissionSection({
  workspaceId,
  bunshinId,
  capabilityStatus,
  profiles,
  missions,
  progress,
  localDate,
}: {
  workspaceId: string;
  bunshinId: string;
  capabilityStatus: 'ACTIVE' | 'SUSPENDED' | 'LOCKED' | null;
  profiles: Array<{
    id: string;
    platform: 'INSTAGRAM' | 'TIKTOK' | 'X' | 'THREADS' | 'YOUTUBE_SHORTS' | 'OTHER';
    status: 'ACTIVE' | 'INACTIVE';
  }>;
  missions: DailyMissionView[];
  progress: MissionProgressView;
  localDate: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [assistanceSelections, setAssistanceSelections] = useState<
    Record<string, ContentAssistanceLevel>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [otherDetail, setOtherDetail] = useState('');
  const [generating, setGenerating] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [missionDate, setMissionDate] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const activeProfiles = profiles.filter(({ status }) => status === 'ACTIVE');
  const [socialProfileId, setSocialProfileId] = useState(activeProfiles[0]?.id ?? '');
  const active = capabilityStatus === 'ACTIVE';
  const busy = generating || pendingAction !== null;
  const calendar = weeklyCalendar(progress);
  const endpoint = `/api/workspaces/${encodeURIComponent(workspaceId)}/bunshins/${encodeURIComponent(bunshinId)}/daily-missions`;

  async function generate() {
    setError(null);
    setGenerating(true);
    try {
      const response = await fetch(`${endpoint}/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          missionDate,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          socialProfileId,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { code?: string };
        } | null;
        const code = payload?.error?.code;
        setError(
          code === 'CONFIGURATION_ERROR'
            ? 'AI生成の設定が完了していません。管理者へお問い合わせください。'
            : code === 'CONTENT_REJECTED'
              ? '内容を安全に作れませんでした。時間をおいて再度お試しください。'
              : code === 'AI_PROVIDER_UNAVAILABLE'
                ? '生成サービスへ接続できませんでした。時間をおいて再度お試しください。'
                : response.status === 409
                  ? 'この日の投稿案は、すでに作成中か作成済みです。'
                  : '投稿案を作れませんでした。SNSの進め方と1週間の予定を確認してください。',
        );
        return;
      }
      router.refresh();
    } finally {
      setGenerating(false);
    }
  }

  async function transition(id: string, action: string) {
    if (pendingAction !== null) return false;
    setError(null);
    setPendingAction(`${id}:${action}`);
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) {
        setError('今日やることを更新できませんでした。もう一度お試しください。');
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setPendingAction(null);
    }
  }

  async function view(mission: DailyMissionView) {
    if (expanded === mission.id) {
      setExpanded(null);
      return;
    }
    if (mission.status === 'GENERATED' && active) {
      if (!(await transition(mission.id, 'viewed'))) return;
    }
    setExpanded(mission.id);
    if (active) void activity(mission.id, 'VIEWED');
  }

  function key() {
    return crypto.randomUUID();
  }
  async function engagementPost(id: string, resource: string, body: Record<string, unknown>) {
    if (pendingAction !== null) return false;
    setPendingAction(`${id}:${resource}`);
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(id)}/${resource}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setError('操作を記録できませんでした。再度お試しください。');
        return false;
      }
      return true;
    } finally {
      setPendingAction(null);
    }
  }
  async function activity(id: string, type: string, metadata?: { slideIndex: number }) {
    setError(null);
    return engagementPost(id, 'activities', {
      type,
      idempotencyKey: key(),
      ...(metadata ? { metadata } : {}),
    });
  }
  async function continuity(id: string, type: 'CONFIRMED' | 'RESTED') {
    const ok = await activity(id, type);
    if (ok) router.refresh();
  }
  async function decide(id: string, decision: 'ACCEPTED' | 'REJECTED', rejectionReason?: string) {
    setError(null);
    const ok = await engagementPost(id, 'decision', {
      decision,
      idempotencyKey: key(),
      ...(rejectionReason ? { rejectionReason } : {}),
      ...(rejectionReason === 'OTHER' && otherDetail.trim()
        ? { rejectionDetail: otherDetail.trim() }
        : {}),
    });
    if (ok) {
      setRejecting(null);
      setOtherDetail('');
      router.refresh();
    }
  }
  async function copy(id: string, value: string, type: string, metadata?: { slideIndex: number }) {
    if (pendingAction !== null) return;
    setError(null);
    setPendingAction(`${id}:copy`);
    const authorization = await fetch(`${endpoint}/${encodeURIComponent(id)}/copy-authorization`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!authorization.ok) {
      setError('専用URLを確認できませんでした。少し待ってから、もう一度お試しください。');
      setPendingAction(null);
      return;
    }
    const result = (await authorization.json()) as {
      data?: { allowed?: boolean; reason?: string };
    };
    if (!result.data?.allowed) {
      setError(
        result.data?.reason === 'LINK_CHANGED'
          ? 'あなた専用の紹介URLが新しくなりました。この投稿案を作り直してください。'
          : 'この紹介URLは今は使えません。管理者へお問い合わせください。',
      );
      setPendingAction(null);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError('クリップボードへコピーできませんでした。ブラウザの権限を確認してください。');
      setPendingAction(null);
      return;
    }
    setPendingAction(null);
    await activity(id, type, metadata);
  }
  async function markPosted(mission: DailyMissionView) {
    if (!mission.platform) {
      setError('どのSNSに投稿するか決まっていません。');
      return;
    }
    setError(null);
    const ok = await engagementPost(mission.id, 'post-record', {
      platform: mission.platform,
      idempotencyKey: key(),
    });
    if (ok) router.refresh();
  }
  async function feedback(id: string, rating: 'GOOD' | 'NEUTRAL' | 'BAD') {
    setError(null);
    const ok = await engagementPost(id, 'feedback', { rating, idempotencyKey: key() });
    if (ok) router.refresh();
  }

  return (
    <section className="mission-experience">
      <header className="mission-experience__header">
        <p className="eyebrow">今日のおすすめ</p>
        <h2>今日やること</h2>
        <p>投稿案を確認して、使いたいものを選びましょう。</p>
      </header>
      <section className="activity-progress" aria-labelledby="activity-progress-title">
        <div className="activity-progress__summary">
          <div>
            <p className="eyebrow">今週の活動</p>
            <h3 id="activity-progress-title">
              {progress.remainingConfirmations === 0
                ? '今週の目標を達成しました'
                : `あと${progress.remainingConfirmations}回、内容を確認しましょう`}
            </h3>
          </div>
          <strong>
            {progress.weekly.confirmedDays} / {progress.weeklyGoal}回
          </strong>
        </div>
        <div className="activity-calendar" aria-label="今週の活動カレンダー">
          {calendar.map((day) => (
            <div
              className={`activity-calendar__day activity-calendar__day--${day.status.toLowerCase()}`}
              key={day.missionDate}
            >
              <time dateTime={day.missionDate}>
                {new Intl.DateTimeFormat('ja-JP', { weekday: 'short' }).format(
                  new Date(`${day.missionDate}T00:00:00.000Z`),
                )}
              </time>
              <span>{progressStatusLabel[day.status]}</span>
            </div>
          ))}
        </div>
        <p>これまでに活動した日：{progress.cumulative.activeDays}日</p>
      </section>
      {active && (
        <div className="mission-generator">
          <h3>今日の案を準備する</h3>
          <label>
            日付
            <input
              type="date"
              value={missionDate}
              onChange={(event) => setMissionDate(event.target.value)}
            />
          </label>{' '}
          <label>
            SNS
            <select
              value={socialProfileId}
              onChange={(event) => setSocialProfileId(event.target.value)}
            >
              {activeProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {platformLabels[profile.platform]}
                </option>
              ))}
            </select>
          </label>{' '}
          <button
            type="button"
            disabled={
              busy ||
              !missionDate ||
              !socialProfileId ||
              missions.some((mission) => mission.missionDate === missionDate)
            }
            onClick={() => void generate()}
          >
            {generating ? '考えています…' : '今日の投稿案を作る'}
          </button>
          {activeProfiles.length === 0 && <p>先に、使いたいSNSを登録してください。</p>}
        </div>
      )}
      {pendingAction && (
        <div className="notice" role="status">
          操作を保存しています…
        </div>
      )}
      {error && (
        <div className="notice notice--danger" role="alert">
          {error}
        </div>
      )}
      {missions.length === 0 ? (
        <div className="mission-empty">
          <strong>今日の投稿案はまだありません</strong>
          <p>SNS設定と週間計画を準備すると、投稿案を作成できます。</p>
        </div>
      ) : (
        <ul className="mission-list">
          {missions.map((mission) => (
            <li className="mission-card" key={mission.id}>
              <h3>
                {mission.missionDate} — {mission.topic}
              </h3>
              <div className="mission-meta">
                <span>{mission.platform ? platformLabels[mission.platform] : 'SNS'}</span>
                <span>
                  {mission.format === 'TEXT'
                    ? '文章'
                    : mission.format === 'SLIDE'
                      ? 'スライド'
                      : mission.format === 'IMAGE'
                        ? '画像'
                        : mission.format === 'LIVE_ACTION'
                          ? '自分で撮る動画'
                          : 'AI動画の作り方'}
                </span>
                <span>約{mission.estimatedMinutes}分</span>
                {mission.classification !== 'ORGANIC' && (
                  <span>
                    {mission.classification === 'ADVERTISEMENT'
                      ? '商品を紹介する企画（PR）'
                      : '商品に関係する企画'}
                  </span>
                )}
              </div>
              <p className="mission-reason">{mission.reason}</p>
              {active &&
                mission.missionDate === localDate &&
                !progress.weekly.days.some(
                  (day) => day.dailyMissionId === mission.id && day.status !== 'UNSEEN',
                ) && (
                  <div className="mission-continuity-actions">
                    <button
                      className="button button--primary"
                      type="button"
                      disabled={busy}
                      onClick={() => void continuity(mission.id, 'CONFIRMED')}
                    >
                      確認しました
                    </button>
                    <button
                      className="button button--secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => void continuity(mission.id, 'RESTED')}
                    >
                      今日は休む
                    </button>
                  </div>
                )}
              {mission.missionDate === localDate &&
                progress.weekly.days.some(
                  (day) => day.dailyMissionId === mission.id && day.status !== 'UNSEEN',
                ) && (
                  <p className="mission-continuity-saved" role="status">
                    今日の活動を保存しました
                  </p>
                )}
              <button type="button" disabled={busy} onClick={() => void view(mission)}>
                {expanded === mission.id ? '閉じる' : '内容を見る'}
              </button>{' '}
              {active && ['GENERATED', 'VIEWED'].includes(mission.status) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void transition(mission.id, 'started')}
                >
                  開始する
                </button>
              )}{' '}
              {active && ['GENERATED', 'VIEWED', 'STARTED'].includes(mission.status) && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void transition(mission.id, 'completed')}
                  >
                    完了
                  </button>{' '}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void transition(mission.id, 'skipped')}
                  >
                    今日は見送る
                  </button>
                </>
              )}
              {expanded === mission.id && (
                <div className="mission-detail">
                  {(() => {
                    const selected = assistanceSelections[mission.id] ?? mission.assistanceLevel;
                    return (
                      <>
                        <fieldset className="mission-assistance-picker">
                          <legend>今日はどこまで見ますか？</legend>
                          <p>今日だけ変えられます。SNSのいつもの設定は変わりません。</p>
                          <div>
                            {missionAssistanceOptions.map((option) => (
                              <label key={option.value}>
                                <input
                                  type="radio"
                                  name={`assistance-${mission.id}`}
                                  value={option.value}
                                  checked={selected === option.value}
                                  onChange={() =>
                                    setAssistanceSelections((current) => ({
                                      ...current,
                                      [mission.id]: option.value,
                                    }))
                                  }
                                />
                                <span>
                                  <strong>{option.label}</strong>
                                  <small>{option.help}</small>
                                </span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <MissionIdea mission={mission} />
                        <MissionTrendContext mission={mission} />
                        {(selected === 'GUIDED' || selected === 'READY_TO_USE') && (
                          <MissionGuide mission={mission} />
                        )}
                        {selected === 'READY_TO_USE' && (
                          <div className="mission-assistance-content">
                            <h4>完成版</h4>
                            <MissionContent mission={mission} />
                          </div>
                        )}
                        {mission.externalLinkUsage && (
                          <aside className="mission-link-summary">
                            <h4>あなた専用の紹介URLを入れました</h4>
                            <p>
                              <strong>紹介するもの：</strong>
                              {mission.externalLinkUsage.productName}
                            </p>
                            {mission.externalLinkUsage.campaignName && (
                              <p>
                                <strong>参加する企画：</strong>
                                {mission.externalLinkUsage.campaignName}
                              </p>
                            )}
                            <p className="mission-link-summary__url">
                              {mission.externalLinkUsage.insertedUrl}
                            </p>
                            <p>
                              {mission.externalLinkUsage.expiresAt
                                ? `使える期限：${displayDate(mission.externalLinkUsage.expiresAt)}`
                                : '使える期限：期限なし'}
                            </p>
                            <p>コピーする直前に、今も使えるURLか自動で確認します。</p>
                          </aside>
                        )}
                      </>
                    );
                  })()}
                  {active && mission.decision !== 'ACCEPTED' && (
                    <div className="mission-decision-actions">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void decide(mission.id, 'ACCEPTED')}
                      >
                        採用する
                      </button>{' '}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setRejecting(mission.id)}
                      >
                        今回は使わない
                      </button>
                    </div>
                  )}
                  {active && rejecting === mission.id && (
                    <div className="mission-rejection">
                      <p>理由を1つ選んでください。</p>
                      {rejectionReasons.map(([value, label]) => (
                        <span key={value}>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void decide(mission.id, 'REJECTED', value)}
                          >
                            {label}
                          </button>{' '}
                        </span>
                      ))}
                      <label>
                        その他（任意）
                        <textarea
                          value={otherDetail}
                          onChange={(event) => setOtherDetail(event.target.value)}
                          maxLength={1000}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void decide(mission.id, 'REJECTED', 'OTHER')}
                      >
                        その他で決定
                      </button>
                    </div>
                  )}
                  {mission.decision === 'REJECTED' && <p>今回は使わないと記録しました。</p>}
                  {active && mission.decision === 'ACCEPTED' && (
                    <div className="mission-accepted">
                      <p className="mission-step-complete">✓ 採用しました</p>
                      {(assistanceSelections[mission.id] ?? mission.assistanceLevel) !==
                        'READY_TO_USE' && <p>完成版を見ると、文章や台本をコピーできます。</p>}
                      {(assistanceSelections[mission.id] ?? mission.assistanceLevel) ===
                        'READY_TO_USE' &&
                        copyOptions(mission).map((option, index) => (
                          <span key={`${option.type}-${index}`}>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void copy(
                                  mission.id,
                                  option.value,
                                  option.type,
                                  'metadata' in option ? option.metadata : undefined,
                                )
                              }
                            >
                              {option.label}
                            </button>{' '}
                          </span>
                        ))}
                      {mission.postedAt === null ? (
                        <div className="mission-post-action">
                          <button
                            type="button"
                            disabled={busy || mission.platform === null}
                            onClick={() => void markPosted(mission)}
                          >
                            投稿しました
                          </button>
                          {mission.platform === null && (
                            <p>投稿したことを記録するには、使うSNSを先に決めてください。</p>
                          )}
                        </div>
                      ) : (
                        <div className="mission-feedback">
                          <p className="mission-step-complete">✓ 投稿済み</p>
                          <p>この投稿はあなたらしかったですか？</p>
                          {(
                            [
                              ['GOOD', '👍 自分らしい'],
                              ['NEUTRAL', '😐 普通'],
                              ['BAD', '👎 違う'],
                            ] as const
                          ).map(([rating, label]) => (
                            <button
                              key={rating}
                              type="button"
                              aria-pressed={mission.feedback === rating}
                              disabled={busy || mission.feedback === rating}
                              onClick={() => void feedback(mission.id, rating)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
