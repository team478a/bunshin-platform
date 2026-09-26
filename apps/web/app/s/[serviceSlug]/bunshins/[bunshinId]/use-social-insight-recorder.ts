'use client';

import { useRef, useState } from 'react';
import {
  SOCIAL_INSIGHT_METRIC_KEYS,
  type SocialInsightMetricKey,
  type SocialInsightSnapshotView,
} from '../../../../../src/services/social-insights';
import {
  POST_PERFORMANCE_METRIC_KEYS,
  type PostPerformanceMetricKey,
  type PostPerformanceView,
} from '../../../../../src/services/post-performance';
import { prepareSocialInsightImage } from './social-insight-image';
import {
  blankSocialInsightDraft,
  localDate,
  socialInsightApiError,
  type SocialInsightDraft,
  type SocialInsightRecorderMode,
  type SocialInsightRecorderProps,
} from './social-insight-recorder-types';

export function useSocialInsightRecorder({
  endpoint,
  profiles,
  initialSnapshots,
  postedMissions,
  initialPostPerformances,
}: SocialInsightRecorderProps) {
  const file = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<SocialInsightDraft | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState(profiles[0]?.id ?? '');
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [mode, setMode] = useState<SocialInsightRecorderMode>(
    postedMissions.length ? 'POST' : 'ACCOUNT',
  );
  const [selectedMissionId, setSelectedMissionId] = useState(postedMissions[0]?.id ?? '');
  const [postPerformances, setPostPerformances] = useState(initialPostPerformances);
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'PREPARING' | 'READING' | 'SAVING' | null>(null);
  const [message, setMessage] = useState('');

  function selectMode(nextMode: SocialInsightRecorderMode) {
    setMode(nextMode);
    setDraft(null);
    setImage(null);
  }

  function startManualEntry() {
    setDraft(blankSocialInsightDraft());
    setImage(null);
    setMessage('分かる数字だけ入力してください。');
  }

  async function selectImage(selected: File | undefined) {
    if (!selected) return;
    setMessage('');
    setBusy('PREPARING');
    try {
      setImage(await prepareSocialInsightImage(selected));
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
      if (!response.ok || !body.data) throw new Error(socialInsightApiError(body));
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
      if (!response.ok || !body.data) throw new Error(socialInsightApiError(body));
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

  function updateMetric(key: SocialInsightMetricKey | PostPerformanceMetricKey, value: string) {
    setDraft((current) =>
      current
        ? { ...current, [key]: value === '' ? null : Math.max(0, Number.parseInt(value, 10) || 0) }
        : current,
    );
  }

  return {
    file,
    draft,
    selectedProfileId,
    snapshots,
    mode,
    selectedMissionId,
    postPerformances,
    image,
    busy,
    message,
    setDraft,
    setSelectedProfileId,
    setSelectedMissionId,
    selectMode,
    startManualEntry,
    selectImage,
    extract,
    save,
    updateMetric,
  };
}

export type SocialInsightRecorderController = ReturnType<typeof useSocialInsightRecorder>;
