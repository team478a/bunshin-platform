import type {
  SocialInsightMetrics,
  SocialInsightSnapshotView,
} from '../../../../../src/services/social-insights';
import type {
  PostPerformanceMetrics,
  PostPerformanceView,
} from '../../../../../src/services/post-performance';

export type SocialProfileOption = { id: string; platform: string };
export type PostedMissionOption = { id: string; topic: string; postedAt: string };
export type SocialInsightRecorderMode = 'POST' | 'ACCOUNT';
export type SocialInsightRecorderBusy = 'PREPARING' | 'READING' | 'SAVING' | null;

export type SocialInsightDraft = SocialInsightMetrics &
  PostPerformanceMetrics & {
    detectedPlatform: string;
    observedOn: string;
    periodStart: string;
    periodEnd: string;
    confidence: number | null;
    note: string;
    source: 'SCREENSHOT' | 'MANUAL';
  };

export type SocialInsightRecorderProps = {
  endpoint: string;
  profiles: SocialProfileOption[];
  initialSnapshots: SocialInsightSnapshotView[];
  postedMissions: PostedMissionOption[];
  initialPostPerformances: PostPerformanceView[];
};

export const platformLabels: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  X: 'X',
  THREADS: 'Threads',
  YOUTUBE_SHORTS: 'YouTube Shorts',
  OTHER: 'その他',
};

export const localDate = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

export const blankSocialInsightDraft = (): SocialInsightDraft => ({
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

export const socialInsightApiError = (body: unknown) => {
  if (!body || typeof body !== 'object') return '処理できませんでした。もう一度お試しください。';
  const value = body as { error?: { message?: unknown } };
  return typeof value.error?.message === 'string'
    ? value.error.message
    : '処理できませんでした。もう一度お試しください。';
};

export const numberText = (value: number | null) =>
  value === null ? '—' : value.toLocaleString('ja-JP');

export const changeText = (value: number | null | undefined) =>
  value === null || value === undefined
    ? ''
    : `（前回比 ${value >= 0 ? '+' : ''}${value.toLocaleString('ja-JP')}）`;
