'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type DailyMissionView = {
  id: string;
  missionDate: string;
  status: 'GENERATED' | 'VIEWED' | 'STARTED' | 'COMPLETED' | 'SKIPPED' | 'EXPIRED';
  format: 'TEXT' | 'SLIDE' | 'IMAGE' | 'LIVE_ACTION' | 'AI_VIDEO_PROMPT';
  estimatedMinutes: number;
  topic: string;
  angle: string;
  reason: string;
  qualityScore: number | null;
  content: Record<string, unknown>;
  decision: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  rejectionReason: string | null;
  platform: 'INSTAGRAM' | 'TIKTOK' | 'X' | 'THREADS' | 'YOUTUBE_SHORTS' | 'OTHER' | null;
  postedAt: string | null;
  feedback: 'GOOD' | 'NEUTRAL' | 'BAD' | null;
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
        <p>動画生成Prompt:</p>
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

function copyOptions(mission: DailyMissionView) {
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
        label: '動画生成Promptをコピー',
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
  return caption ? [{ label: '投稿文をコピー', value: caption, type: 'COPIED_TEXT' as const }] : [];
}

export function DailyMissionSection({
  workspaceId,
  bunshinId,
  capabilityStatus,
  profiles,
  missions,
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
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [otherDetail, setOtherDetail] = useState('');
  const [generating, setGenerating] = useState(false);
  const [missionDate, setMissionDate] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const activeProfiles = profiles.filter(({ status }) => status === 'ACTIVE');
  const [socialProfileId, setSocialProfileId] = useState(activeProfiles[0]?.id ?? '');
  const active = capabilityStatus === 'ACTIVE';
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
                  ? 'この日付のMissionは既に作成中、または作成済みです。'
                  : 'Missionを生成できませんでした。承認済み戦略と確定済み週間計画を確認してください。',
        );
        return;
      }
      router.refresh();
    } finally {
      setGenerating(false);
    }
  }

  async function transition(id: string, action: string) {
    setError(null);
    const response = await fetch(`${endpoint}/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) {
      setError('Missionを更新できませんでした。状態を確認して再度お試しください。');
      return false;
    }
    router.refresh();
    return true;
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
  }
  async function activity(id: string, type: string, metadata?: { slideIndex: number }) {
    setError(null);
    return engagementPost(id, 'activities', {
      type,
      idempotencyKey: key(),
      ...(metadata ? { metadata } : {}),
    });
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
    setError(null);
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError('クリップボードへコピーできませんでした。ブラウザの権限を確認してください。');
      return;
    }
    await activity(id, type, metadata);
  }
  async function markPosted(mission: DailyMissionView) {
    if (!mission.platform) {
      setError('投稿先SNSがMissionに設定されていません。');
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
    <section>
      <h2>Daily Mission</h2>
      <p>今日やることを確認し、採用する投稿案だけをコピーできます。</p>
      {active && (
        <div>
          <h3>AIでMissionを作成</h3>
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
                  {profile.platform}
                </option>
              ))}
            </select>
          </label>{' '}
          <button
            type="button"
            disabled={
              generating ||
              !missionDate ||
              !socialProfileId ||
              missions.some((mission) => mission.missionDate === missionDate)
            }
            onClick={() => void generate()}
          >
            {generating ? '生成中…' : '今日のMissionをAIで作成'}
          </button>
          {activeProfiles.length === 0 && <p>有効なSNS Profileが必要です。</p>}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {missions.length === 0 ? (
        <p>Missionはまだありません。</p>
      ) : (
        <ul>
          {missions.map((mission) => (
            <li key={mission.id}>
              <h3>
                {mission.missionDate} — {mission.topic}
              </h3>
              <p>
                {mission.format} / 目安{mission.estimatedMinutes}分 / {mission.status}
              </p>
              <p>{mission.reason}</p>
              <button type="button" onClick={() => void view(mission)}>
                {expanded === mission.id ? '閉じる' : '内容を見る'}
              </button>{' '}
              {active && ['GENERATED', 'VIEWED'].includes(mission.status) && (
                <button type="button" onClick={() => void transition(mission.id, 'started')}>
                  開始する
                </button>
              )}{' '}
              {active && ['GENERATED', 'VIEWED', 'STARTED'].includes(mission.status) && (
                <>
                  <button type="button" onClick={() => void transition(mission.id, 'completed')}>
                    完了
                  </button>{' '}
                  <button type="button" onClick={() => void transition(mission.id, 'skipped')}>
                    今日は見送る
                  </button>
                </>
              )}
              {expanded === mission.id && (
                <div>
                  <p>狙い: {mission.angle}</p>
                  <MissionContent mission={mission} />
                  {active && mission.decision !== 'ACCEPTED' && (
                    <div>
                      <button type="button" onClick={() => void decide(mission.id, 'ACCEPTED')}>
                        採用する
                      </button>{' '}
                      <button type="button" onClick={() => setRejecting(mission.id)}>
                        今回は使わない
                      </button>
                    </div>
                  )}
                  {active && rejecting === mission.id && (
                    <div>
                      <p>理由を1つ選んでください。</p>
                      {rejectionReasons.map(([value, label]) => (
                        <span key={value}>
                          <button
                            type="button"
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
                        onClick={() => void decide(mission.id, 'REJECTED', 'OTHER')}
                      >
                        その他で決定
                      </button>
                    </div>
                  )}
                  {mission.decision === 'REJECTED' && <p>今回は使わないと記録しました。</p>}
                  {active && mission.decision === 'ACCEPTED' && (
                    <div>
                      <p>採用済み</p>
                      {copyOptions(mission).map((option, index) => (
                        <span key={`${option.type}-${index}`}>
                          <button
                            type="button"
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
                        <div>
                          <button
                            type="button"
                            disabled={mission.platform === null}
                            onClick={() => void markPosted(mission)}
                          >
                            投稿しました
                          </button>
                          {mission.platform === null && (
                            <p>投稿完了を記録するにはSNS Profileの関連付けが必要です。</p>
                          )}
                        </div>
                      ) : (
                        <div>
                          <p>投稿済み</p>
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
                              disabled={mission.feedback === rating}
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
