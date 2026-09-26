import { ApplicationError } from '@bunshin/shared';

import type { SocialActivityBarrierCase } from './activity-barrier-persistence';
import type { SocialActivityBarrierCategory, SocialActivityBarrierScope } from './activity-barrier';

export const SOCIAL_ACTIVITY_SUPPORT_RULE_VERSION = 'social-activity-support-v1' as const;
export const SOCIAL_ACTIVITY_BARRIER_DISMISSAL_DAYS = 30;

export const SOCIAL_ACTIVITY_SUPPORT_KEYS = [
  'PROFILE_REVIEW',
  'STEP_BY_STEP_GUIDE',
  'FIVE_MINUTE_ACTION',
  'CONTENT_REVIEW',
  'MEDIA_PREPARATION',
  'LOW_RISK_PUBLISHING',
  'PERFORMANCE_REVIEW',
  'RESPONSE_GUIDE',
  'LEAD_FOLLOW_UP',
  'MEASUREMENT_SETUP',
] as const;
export type SocialActivitySupportKey = (typeof SOCIAL_ACTIVITY_SUPPORT_KEYS)[number];

export type SocialActivityBarrierQuestion = {
  caseIds: string[];
  title: string;
  description: string;
  options: Array<{ caseId: string; category: SocialActivityBarrierCategory; label: string }>;
  noneLabel: string;
};

export type SocialActivitySupport = {
  key: SocialActivitySupportKey;
  title: string;
  reason: string;
  steps: readonly string[];
};

export const SOCIAL_ACTIVITY_SUPPORT_ACTIONS = ['ACCEPT', 'COMPLETE', 'SKIP'] as const;
export type SocialActivitySupportAction = (typeof SOCIAL_ACTIVITY_SUPPORT_ACTIONS)[number];
export type SocialActivitySupportProgress = {
  id: string;
  status: 'OFFERED' | 'ACCEPTED' | 'COMPLETED' | 'SKIPPED';
  support: SocialActivitySupport;
};

export interface SocialActivityBarrierConfirmationRepository {
  getPendingQuestion(input: {
    scope: SocialActivityBarrierScope;
  }): Promise<SocialActivityBarrierQuestion | null>;
  answer(input: {
    scope: SocialActivityBarrierScope;
    caseIds: string[];
    selectedCaseId: string | null;
    idempotencyKey: string;
    answeredAt: Date;
  }): Promise<{
    response: 'CONFIRMED' | 'NONE_OF_THESE';
    support: SocialActivitySupport | null;
  } | null>;
  getActiveSupport(input: {
    scope: SocialActivityBarrierScope;
  }): Promise<SocialActivitySupportProgress | null>;
  transitionSupport(input: {
    scope: SocialActivityBarrierScope;
    supportId: string;
    action: SocialActivitySupportAction;
    occurredAt: Date;
  }): Promise<SocialActivitySupportProgress | null>;
}

const labels: Record<SocialActivityBarrierCategory, string> = {
  SETUP: '最初の設定で迷っている',
  HOW_TO: '操作や進め方が分からない',
  TIME: '取り組む時間がない',
  EFFORT: '作業の負担が大きい',
  CONTENT: '投稿内容が自分に合わない',
  MEDIA: '写真や動画を用意できない',
  CONFIDENCE: '投稿することに不安がある',
  EFFECT: '続けても効果を感じない',
  RESPONSE: '反応への対応方法が分からない',
  LEAD: '反応を予約や購入につなげられない',
  UNKNOWN: '結果や数字の確認方法が分からない',
};

const supportByCategory: Record<SocialActivityBarrierCategory, SocialActivitySupport> = {
  SETUP: {
    key: 'PROFILE_REVIEW',
    title: '最初の設定を一緒に確認する',
    reason: '投稿を始める前に、迷っている設定を一つずつ整えます。',
    steps: [
      '事業名と商品・サービスを確認する',
      '届けたい相手を一つ選ぶ',
      '不足項目を一つだけ追加する',
    ],
  },
  HOW_TO: {
    key: 'STEP_BY_STEP_GUIDE',
    title: '次の操作を一つずつ進める',
    reason: '一度に全部覚えず、今日必要な操作だけ確認します。',
    steps: ['今日の投稿を開く', '採用するを押す', '文章をコピーする'],
  },
  TIME: {
    key: 'FIVE_MINUTE_ACTION',
    title: '5分で終わる内容にする',
    reason: '忙しい日でも続けられる作業量へ小さくします。',
    steps: ['今日の内容を開く', '使える一文だけ選ぶ', '下書きへ保存して終える'],
  },
  EFFORT: {
    key: 'FIVE_MINUTE_ACTION',
    title: '今日の作業を一つに絞る',
    reason: '負担を減らし、再開しやすい一歩だけにします。',
    steps: ['投稿候補を一つ開く', '直したい箇所を一つだけ決める', '下書きへ保存する'],
  },
  CONTENT: {
    key: 'CONTENT_REVIEW',
    title: '合わない内容を見直す',
    reason: '本人の目的やお客様に合う内容へ改善するための確認をします。',
    steps: ['合わない理由を一つ選ぶ', '届けたい相手を確認する', '次回生成へ反映する'],
  },
  MEDIA: {
    key: 'MEDIA_PREPARATION',
    title: '使える写真を1枚だけ準備する',
    reason: '投稿作業と素材準備を分けて、負担を減らします。',
    steps: [
      '商品・店内・作業中の手元から一つ選ぶ',
      '明るい場所で1枚撮る',
      'スマートフォンへ保存する',
    ],
  },
  CONFIDENCE: {
    key: 'LOW_RISK_PUBLISHING',
    title: '公開前に下書きだけ作る',
    reason: 'すぐ公開せず、安心して確認できる段階まで進めます。',
    steps: ['投稿文をコピーする', 'SNSの下書きへ貼る', '今日は公開せず内容を確認する'],
  },
  EFFECT: {
    key: 'PERFORMANCE_REVIEW',
    title: '反応があった点を一つ確認する',
    reason: '数字の良し悪しではなく、次に残す要素を見つけます。',
    steps: ['最近の投稿を一つ開く', '見える数字を一つ確認する', '次も使いたい内容を一つ残す'],
  },
  RESPONSE: {
    key: 'RESPONSE_GUIDE',
    title: 'コメントやメッセージへ1件返信する',
    reason: '届いた反応へ無理なく対応する形を作ります。',
    steps: ['未返信の反応を一つ選ぶ', 'お礼を一文書く', '必要なら次の案内を一つ添える'],
  },
  LEAD: {
    key: 'LEAD_FOLLOW_UP',
    title: '次の案内を一つだけ決める',
    reason: '反応した方が迷わないよう、次の行動を明確にします。',
    steps: ['予約・問い合わせ・購入から一つ選ぶ', '案内先を確認する', '投稿の案内を一つに絞る'],
  },
  UNKNOWN: {
    key: 'MEASUREMENT_SETUP',
    title: '投稿結果を確認できる状態にする',
    reason: '効果を判断する前に、見える数字を一つ記録します。',
    steps: [
      '最近の投稿を一つ開く',
      'いいね・閲覧・コメントから一つ確認する',
      '見えた数字を記録する',
    ],
  },
};

export function buildSocialActivityBarrierQuestion(
  cases: readonly SocialActivityBarrierCase[],
): SocialActivityBarrierQuestion {
  if (cases.length === 0 || cases.some((value) => value.status !== 'SUSPECTED')) {
    throw new ApplicationError('VALIDATION_ERROR', 'suspected barrier cases are required');
  }
  const scope = cases[0]!.scope;
  const evidence = cases[0]!.evidence;
  if (
    cases.some(
      (value) =>
        value.scope.workspaceId !== scope.workspaceId ||
        value.scope.serviceId !== scope.serviceId ||
        value.scope.groupMembershipId !== scope.groupMembershipId ||
        value.scope.userId !== scope.userId ||
        value.scope.bunshinId !== scope.bunshinId ||
        value.evidence.evidenceCode !== evidence.evidenceCode ||
        value.evidence.observationWindow.from !== evidence.observationWindow.from ||
        value.evidence.observationWindow.to !== evidence.observationWindow.to,
    )
  ) {
    throw new ApplicationError('VALIDATION_ERROR', 'barrier cases must share one evidence scope');
  }

  return {
    caseIds: cases.map((value) => value.id),
    title: 'いま、SNSの取り組みで困っていることはありますか？',
    description: '当てはまるものを一つ選んでください。次に進みやすい方法をご案内します。',
    options: cases.map((value) => ({
      caseId: value.id,
      category: value.category,
      label: labels[value.category],
    })),
    noneLabel: '今はどれにも当てはまらない',
  };
}

export function socialActivitySupportFor(category: SocialActivityBarrierCategory) {
  return supportByCategory[category];
}
