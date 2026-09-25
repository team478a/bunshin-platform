import type { SocialPreferredFormat } from '@bunshin/capability-social';
import type { SocialProfileView } from './social-profile-section';

export const platformLabels: Record<SocialProfileView['platform'], string> = {
  INSTAGRAM: 'インスタグラム',
  TIKTOK: 'ティックトック',
  X: 'X（旧ツイッター）',
  THREADS: 'スレッズ',
  YOUTUBE_SHORTS: 'ユーチューブ ショート',
  OTHER: 'その他',
};

export interface WeeklyPlanItemView {
  id: string;
  scheduledDate: string;
  contentPillarId: string;
  goal: string;
  angle: string;
  recommendedFormat: SocialPreferredFormat;
  notes: string | null;
  campaignId?: string | null;
  classification?: 'ORGANIC' | 'PRODUCT_RELATED' | 'ADVERTISEMENT';
}

export interface WeeklyPlanView {
  id: string;
  weekStartDate: string;
  timezone: string;
  strategySummary: string | null;
  status: 'DRAFT' | 'CONFIRMED' | 'EXPIRED';
  items: WeeklyPlanItemView[];
}

export type WeeklyPlanItemFormValue = Omit<WeeklyPlanItemView, 'id'>;
export type WeeklyPlanMutation = (
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
) => Promise<void>;

export const planStatusLabels: Record<WeeklyPlanView['status'], string> = {
  DRAFT: '作成中',
  CONFIRMED: '決定済み',
  EXPIRED: '終了',
};

export const formatLabels: Record<SocialPreferredFormat, string> = {
  TEXT: '文章',
  SLIDE: 'スライド',
  LIVE_ACTION: '自分で撮る動画',
  AI_VIDEO_PROMPT: 'AI動画の作り方',
  IMAGE: '画像',
};

export function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function monday(value = new Date()) {
  const date = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  return date.toISOString().slice(0, 10);
}
