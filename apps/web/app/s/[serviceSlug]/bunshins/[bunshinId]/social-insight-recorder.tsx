'use client';

import { useRef, useState } from 'react';
import {
  SOCIAL_INSIGHT_METRIC_KEYS,
  socialInsightChanges,
  socialInsightLabels,
  type SocialInsightMetricKey,
  type SocialInsightMetrics,
  type SocialInsightSnapshotView,
} from '../../../../../src/services/social-insights';
import {
  POST_PERFORMANCE_METRIC_KEYS,
  buildPostPerformanceInsight,
  postPerformanceLabels,
  type PostPerformanceMetricKey,
  type PostPerformanceMetrics,
  type PostPerformanceView,
} from '../../../../../src/services/post-performance';

type Profile = { id: string; platform: string };
type Draft = SocialInsightMetrics &
  PostPerformanceMetrics & {
    detectedPlatform: string;
    observedOn: string;
    periodStart: string;
    periodEnd: string;
    confidence: number | null;
    note: string;
    source: 'SCREENSHOT' | 'MANUAL';
  };

type PostedMission = { id: string; topic: string; postedAt: string };

const platformLabels: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  X: 'X',
  THREADS: 'Threads',
  YOUTUBE_SHORTS: 'YouTube Shorts',
  OTHER: 'その他',
};

const localDate = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

const blankDraft = (): Draft => ({
  detectedPlatform: 'UNKNOWN',
  observedOn: localDate(),
  periodStart: '',
  periodEnd: '',
  followers: null,
  reach: null,
  impressions: null,
  profileViews: null,
  interactions: null,
  likes: null,
  comments: null,
  saves: null,
  shares: null,
  follows: null,
  confidence: null,
  note: '',
  source: 'MANUAL',
});

const apiError = (body: unknown) => {
  if (!body || typeof body !== 'object') return '処理できませんでした。もう一度お試しください。';
  const value = body as { error?: { message?: unknown } };
  return typeof value.error?.message === 'string'
    ? value.error.message
    : '処理できませんでした。もう一度お試しください。';
};

async function prepareImage(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('PNGまたはJPEGのスクリーンショットを選んでください。');
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const value = new Image();
      value.onload = () => resolve(value);
      value.onerror = () => reject(new Error('画像を開けませんでした。'));
      value.src = objectUrl;
    });
    let width = image.naturalWidth;
    let height = image.naturalHeight;
    const maximum = 1800;
    if (Math.max(width, height) > maximum) {
      const ratio = maximum / Math.max(width, height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('画像を準備できませんでした。');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    let quality = 0.9;
    let result = canvas.toDataURL('image/jpeg', quality);
    while (result.length > 3_800_000 && quality > 0.55) {
      quality -= 0.1;
      result = canvas.toDataURL('image/jpeg', quality);
    }
    if (result.length > 3_800_000)
      throw new Error('画像が大きすぎます。画面を分けて撮影してください。');
    return result;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const numberText = (value: number | null) => (value === null ? '—' : value.toLocaleString('ja-JP'));
const changeText = (value: number | null | undefined) =>
  value === null || value === undefined
    ? ''
    : `（前回比 ${value >= 0 ? '+' : ''}${value.toLocaleString('ja-JP')}）`;

export function SocialInsightRecorder({
  endpoint,
  profiles,
  initialSnapshots,
  postedMissions,
  initialPostPerformances,
}: {
  endpoint: string;
  profiles: Profile[];
  initialSnapshots: SocialInsightSnapshotView[];
  postedMissions: PostedMission[];
  initialPostPerformances: PostPerformanceView[];
}) {
  const file = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState(profiles[0]?.id ?? '');
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [mode, setMode] = useState<'POST' | 'ACCOUNT'>(postedMissions.length ? 'POST' : 'ACCOUNT');
  const [selectedMissionId, setSelectedMissionId] = useState(postedMissions[0]?.id ?? '');
  const [postPerformances, setPostPerformances] = useState(initialPostPerformances);
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'PREPARING' | 'READING' | 'SAVING' | null>(null);
  const [message, setMessage] = useState('');

  async function selectImage(selected: File | undefined) {
    if (!selected) return;
    setMessage('');
    setBusy('PREPARING');
    try {
      setImage(await prepareImage(selected));
      setDraft(null);
      setMessage('画像を選びました。「数字を読み取る」を押してください。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '画像を準備できませんでした。');
    } finally {
      setBusy(null);
    }
  }

  async function extract() {
    if (!image) return;
    setBusy('READING');
    setMessage('画像の数字を読み取っています…');
    try {
      const response = await fetch(`${endpoint}/extract`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image, idempotencyKey: crypto.randomUUID(), mode }),
      });
      const body = (await response.json()) as { data?: Record<string, unknown> };
      if (!response.ok || !body.data) throw new Error(apiError(body));
      const value = body.data;
      const detected =
        typeof value['detectedPlatform'] === 'string' ? value['detectedPlatform'] : 'UNKNOWN';
      const matched = profiles.find(({ platform }) => platform === detected);
      if (matched) setSelectedProfileId(matched.id);
      setDraft({
        detectedPlatform: detected,
        observedOn: typeof value['observedOn'] === 'string' ? value['observedOn'] : localDate(),
        periodStart: typeof value['periodStart'] === 'string' ? value['periodStart'] : '',
        periodEnd: typeof value['periodEnd'] === 'string' ? value['periodEnd'] : '',
        followers: typeof value['followers'] === 'number' ? value['followers'] : null,
        reach: typeof value['reach'] === 'number' ? value['reach'] : null,
        impressions: typeof value['impressions'] === 'number' ? value['impressions'] : null,
        profileViews: typeof value['profileViews'] === 'number' ? value['profileViews'] : null,
        interactions: typeof value['interactions'] === 'number' ? value['interactions'] : null,
        likes: typeof value['likes'] === 'number' ? value['likes'] : null,
        comments: typeof value['comments'] === 'number' ? value['comments'] : null,
        saves: typeof value['saves'] === 'number' ? value['saves'] : null,
        shares: typeof value['shares'] === 'number' ? value['shares'] : null,
        follows: typeof value['follows'] === 'number' ? value['follows'] : null,
        confidence: typeof value['confidence'] === 'number' ? value['confidence'] : null,
        note: typeof value['note'] === 'string' ? value['note'] : '',
        source: 'SCREENSHOT',
      });
      setMessage('読み取りました。数字を確認してから保存してください。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '数字を読み取れませんでした。');
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!draft || !selectedProfileId) return;
    setBusy('SAVING');
    setMessage('保存しています…');
    try {
      const response = await fetch(mode === 'POST' ? `${endpoint}/post-performance` : endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          mode === 'POST'
            ? {
                dailyMissionId: selectedMissionId,
                observedOn: draft.observedOn,
                ...Object.fromEntries(POST_PERFORMANCE_METRIC_KEYS.map((key) => [key, draft[key]])),
                source: draft.source,
              }
            : {
                socialProfileId: selectedProfileId,
                observedOn: draft.observedOn,
                periodStart: draft.periodStart || null,
                periodEnd: draft.periodEnd || null,
                ...Object.fromEntries(SOCIAL_INSIGHT_METRIC_KEYS.map((key) => [key, draft[key]])),
                source: draft.source,
              },
        ),
      });
      const body = (await response.json()) as {
        data?: SocialInsightSnapshotView | PostPerformanceView;
      };
      if (!response.ok || !body.data) throw new Error(apiError(body));
      if (mode === 'POST') {
        const saved = body.data as PostPerformanceView;
        setPostPerformances((current) => [
          saved,
          ...current.filter(({ dailyMissionId }) => dailyMissionId !== saved.dailyMissionId),
        ]);
      } else {
        const saved = body.data as SocialInsightSnapshotView;
        setSnapshots((current) =>
          [
            saved,
            ...current.filter(
              ({ socialProfileId, observedOn }) =>
                socialProfileId !== saved.socialProfileId || observedOn !== saved.observedOn,
            ),
          ].slice(0, 12),
        );
      }
      setDraft(null);
      setImage(null);
      if (file.current) file.current.value = '';
      setMessage(mode === 'POST' ? 'この投稿の反応を保存しました。' : 'SNSの数字を保存しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存できませんでした。');
    } finally {
      setBusy(null);
    }
  }

  function updateMetric(key: SocialInsightMetricKey, value: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            [key]: value === '' ? null : Math.max(0, Number.parseInt(value, 10) || 0),
          }
        : current,
    );
  }

  function updatePostMetric(key: PostPerformanceMetricKey, value: string) {
    setDraft((current) =>
      current
        ? { ...current, [key]: value === '' ? null : Math.max(0, Number.parseInt(value, 10) || 0) }
        : current,
    );
  }

  const latest = snapshots[0] ?? null;
  const previous =
    snapshots.find(
      (item) => latest && item.socialProfileId === latest.socialProfileId && item.id !== latest.id,
    ) ?? null;
  const changes = latest ? socialInsightChanges(latest, previous) : null;
  const postInsight = buildPostPerformanceInsight(postPerformances);

  return (
    <section className="service-entry__card social-insight-recorder" id="sns-numbers">
      <p className="eyebrow">投稿後に1分で記録</p>
      <h2>投稿の反応を次に生かす</h2>
      <p>
        Instagramなどの「インサイト」画面をスクリーンショットしてください。数字を比較し、次の投稿内容を改善します。画像自体は保存しません。
      </p>
      <div className="social-insight-recorder__mode" role="group" aria-label="記録する数字">
        <button
          type="button"
          aria-pressed={mode === 'POST'}
          disabled={!postedMissions.length || busy !== null}
          onClick={() => {
            setMode('POST');
            setDraft(null);
            setImage(null);
          }}
        >
          投稿ごとの反応
        </button>
        <button
          type="button"
          aria-pressed={mode === 'ACCOUNT'}
          disabled={busy !== null}
          onClick={() => {
            setMode('ACCOUNT');
            setDraft(null);
            setImage(null);
          }}
        >
          フォロワーなど全体の数字
        </button>
      </div>
      {mode === 'POST' && postedMissions.length ? (
        <label className="social-insight-recorder__post-select">
          どの投稿の数字ですか？
          <select
            value={selectedMissionId}
            onChange={(event) => setSelectedMissionId(event.target.value)}
          >
            {postedMissions.map((mission) => (
              <option key={mission.id} value={mission.id}>
                {mission.postedAt.slice(0, 10).replaceAll('-', '/')}・{mission.topic}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {profiles.length === 0 ? (
        <p>先に「細かい設定」から、使うSNSを登録してください。</p>
      ) : (
        <>
          <label className="social-insight-recorder__file">
            スクリーンショットを選ぶ
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy !== null}
              onChange={(event) => void selectImage(event.target.files?.[0])}
            />
          </label>
          {image ? (
            <button
              className="button button--primary button--full"
              type="button"
              disabled={busy !== null}
              onClick={() => void extract()}
            >
              {busy === 'READING' ? '読み取り中…' : '画像の数字を読み取る'}
            </button>
          ) : null}
          <button
            className="social-insight-recorder__manual"
            type="button"
            disabled={busy !== null}
            onClick={() => {
              setDraft(blankDraft());
              setImage(null);
              setMessage('分かる数字だけ入力してください。');
            }}
          >
            画像がない場合は手で入力する
          </button>
        </>
      )}
      {message ? (
        <p className="social-insight-recorder__message" role="status">
          {message}
        </p>
      ) : null}

      {draft ? (
        <div className="social-insight-recorder__confirm">
          <h3>読み取った数字を確認</h3>
          <p>違う数字があれば、ここで直せます。空欄のままでも保存できます。</p>
          {draft.confidence !== null && draft.confidence < 75 ? (
            <p className="notice notice--warning">
              画像が少し読みにくかったため、数字をよく確認してください。
            </p>
          ) : null}
          {draft.note ? <p className="notice notice--warning">{draft.note}</p> : null}
          {mode === 'ACCOUNT' ? (
            <label>
              SNS
              <select
                value={selectedProfileId}
                onChange={(event) => setSelectedProfileId(event.target.value)}
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {platformLabels[profile.platform] ?? profile.platform}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            記録日
            <input
              type="date"
              value={draft.observedOn}
              onChange={(event) => setDraft({ ...draft, observedOn: event.target.value })}
            />
          </label>
          {mode === 'ACCOUNT' ? (
            <div className="social-insight-recorder__period">
              <label>
                集計の開始日（分かる場合）
                <input
                  type="date"
                  value={draft.periodStart}
                  onChange={(event) => setDraft({ ...draft, periodStart: event.target.value })}
                />
              </label>
              <label>
                集計の終了日（分かる場合）
                <input
                  type="date"
                  value={draft.periodEnd}
                  onChange={(event) => setDraft({ ...draft, periodEnd: event.target.value })}
                />
              </label>
            </div>
          ) : null}
          <div className="social-insight-recorder__metrics">
            {(mode === 'POST' ? POST_PERFORMANCE_METRIC_KEYS : SOCIAL_INSIGHT_METRIC_KEYS).map(
              (key) => (
                <label key={key}>
                  {mode === 'POST'
                    ? postPerformanceLabels[key as PostPerformanceMetricKey]
                    : socialInsightLabels[key as SocialInsightMetricKey]}
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={2_000_000_000}
                    value={draft[key] ?? ''}
                    placeholder="分からなければ空欄"
                    onChange={(event) =>
                      mode === 'POST'
                        ? updatePostMetric(key as PostPerformanceMetricKey, event.target.value)
                        : updateMetric(key as SocialInsightMetricKey, event.target.value)
                    }
                  />
                </label>
              ),
            )}
          </div>
          <button
            className="button button--primary button--full"
            type="button"
            disabled={
              busy !== null ||
              (mode === 'POST' ? !selectedMissionId : !selectedProfileId) ||
              !draft.observedOn ||
              (mode === 'POST' ? POST_PERFORMANCE_METRIC_KEYS : SOCIAL_INSIGHT_METRIC_KEYS).every(
                (key) => draft[key] === null,
              )
            }
            onClick={() => void save()}
          >
            {busy === 'SAVING' ? '保存中…' : 'この内容で記録する'}
          </button>
        </div>
      ) : null}

      {postPerformances.length ? (
        <div className="social-insight-recorder__latest social-insight-recorder__analysis">
          <p className="eyebrow">自動分析</p>
          <h3>{postInsight.title}</h3>
          {postInsight.bestTopic ? <p>反応を比べる基準：{postInsight.bestTopic}</p> : null}
          <p>{postInsight.guidance}</p>
          <div className="social-insight-recorder__post-history">
            {postPerformances.slice(0, 5).map((item) => (
              <article key={item.dailyMissionId}>
                <strong>{item.topic}</strong>
                <span>
                  {item.observedOn.replaceAll('-', '/')}・いいね {numberText(item.likes)}・保存{' '}
                  {numberText(item.saves)}・フォロー {numberText(item.follows)}
                </span>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {mode === 'ACCOUNT' && latest ? (
        <div className="social-insight-recorder__latest">
          <h3>最近の記録</h3>
          <p>
            {latest.observedOn.replaceAll('-', '/')}・
            {platformLabels[latest.platform] ?? latest.platform}
          </p>
          <div className="weekly-report__metrics">
            {SOCIAL_INSIGHT_METRIC_KEYS.map((key) =>
              latest[key] === null ? null : (
                <article key={key}>
                  <strong>{numberText(latest[key])}</strong>
                  <span>
                    {socialInsightLabels[key]}
                    {changeText(changes?.[key])}
                  </span>
                </article>
              ),
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
