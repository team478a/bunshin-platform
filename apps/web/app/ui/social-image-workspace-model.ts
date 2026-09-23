import type { SocialImageLayout } from '@bunshin/application';

export type SocialImageMission = {
  id: string;
  bunshinId: string;
  bunshinName: string;
  topic: string;
  angle: string;
  format: 'IMAGE' | 'SLIDE';
  layout: SocialImageLayout;
  campaignId: string | null;
  productPackVersionId: string | null;
  request: { id: string; status: string } | null;
};

export type SocialImageSavedPhoto = {
  id: string;
  bunshinId: string;
  label: string;
  width: number | null;
  height: number | null;
  createdAt: string;
};

export type SocialImageRequestView = {
  id: string;
  status: string;
  layout: SocialImageLayout;
  revision: number;
  errorCode: string | null;
  media: {
    id: string;
    status: 'READY' | 'ADOPTED' | 'REJECTED';
    reviewReason: string | null;
    reviewNote: string | null;
    width: number;
    height: number;
    downloadPath: string;
    savePath: string;
  } | null;
  mediaPages: Array<{
    id: string;
    pageIndex: number;
    status: 'READY' | 'ADOPTED' | 'REJECTED';
    reviewReason: string | null;
    reviewNote: string | null;
    width: number;
    height: number;
    downloadPath: string;
    savePath: string;
  }>;
};

export const socialImageStatusText: Record<string, string> = {
  DRAFT: '準備しています',
  QUEUED: '順番を待っています',
  GENERATING_ASSET: '画像を作っています',
  COMPOSING: '文字とレイアウトを整えています',
  READY_FOR_REVIEW: '画像ができました',
  FAILED: '画像を作れませんでした',
  CANCELLED: '作成を中止しました',
};
