import { ApplicationError } from '@bunshin/shared';
import type { AiProviderKey, LineConfigurationEnvironment } from './index';

export type AdminAlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
export interface AdminAlert {
  code: string;
  severity: AdminAlertSeverity;
  title: string;
  guidance: string;
  count: number | null;
  href:
    | '/admin/ai'
    | '/admin/line'
    | '/admin/rewards'
    | '/admin/support'
    | '/admin/deletions'
    | '/admin/guide'
    | '/admin/services'
    | '/admin/commercial-billing?status=REFUND_REVIEW'
    | `/s/${string}/manage/line`;
}

export interface AdminAlertSnapshot {
  ai: Array<{
    provider: AiProviderKey;
    globallyPaused: boolean;
    lastErrorCategory: string | null;
    dailyBudgetUsdMicros: number;
    monthlyBudgetUsdMicros: number;
    dailySpentUsdMicros: number;
    monthlySpentUsdMicros: number;
    recentProviderFailures: number;
    recentUnknownCostEvents: number;
    staleOpenAdmissions: number;
  }>;
  line: {
    required: boolean;
    active: boolean;
    verified: boolean;
    globallyPaused: boolean;
    failedDeliveries: number;
    retryScheduledJobs: number;
    deadJobs: number;
  };
  serviceLineBroadcasts: Array<{
    code:
      | 'SERVICE_BROADCAST_STALLED'
      | 'SERVICE_BROADCAST_HIGH_FAILURE'
      | 'SERVICE_BROADCAST_RECOVERY_EXHAUSTED'
      | 'SERVICE_BROADCAST_RECOVERED';
    serviceSlug: string | null;
    serviceDisplayName: string | null;
  }>;
  personalLearningLineQuotaNotices?: Array<{ thresholdPercent: number }>;
  otherDeadJobs: number;
  rewards: {
    failedPointProcessing: number;
    stalePointProcessing: number;
    failedBadgeProcessing: number;
    staleBadgeProcessing: number;
    stoppedServices: number;
  };
  blockedDeletions: number;
  personalLearningStaleOpenAdmissions: number;
  openSupportCases: number;
  urgentSupportCases: number;
  commercialBillingRefundReviews: number;
}

export interface AdminAlertRepository {
  snapshot(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    now: Date;
    dailyFrom: Date;
    monthlyFrom: Date;
    recentFrom: Date;
  }): Promise<AdminAlertSnapshot | null>;
}

const percent = (spent: number, budget: number) => (budget <= 0 ? 100 : (spent / budget) * 100);

export function buildAdminAlerts(snapshot: AdminAlertSnapshot): AdminAlert[] {
  const alerts: AdminAlert[] = [];
  if (!snapshot.ai.some((item) => item.provider === 'OPENAI'))
    alerts.push({
      code: 'OPENAI_ACTIVE_MISSING',
      severity: 'CRITICAL',
      title: '文章を作るAIが使用できません',
      guidance: 'OpenAIの接続確認後、使用する設定を有効にしてください。',
      count: null,
      href: '/admin/ai',
    });
  for (const item of snapshot.ai) {
    const label = item.provider === 'OPENAI' ? 'OpenAI' : item.provider;
    if (item.globallyPaused || item.lastErrorCategory)
      alerts.push({
        code: `AI_${item.provider}_UNAVAILABLE`,
        severity: item.provider === 'OPENAI' ? 'CRITICAL' : 'WARNING',
        title: `${label}を利用できない状態です`,
        guidance: item.globallyPaused
          ? '意図した停止か確認してください。'
          : 'APIキーと接続状態を確認してください。',
        count: null,
        href: '/admin/ai',
      });
    const dailyPercent = percent(item.dailySpentUsdMicros, item.dailyBudgetUsdMicros);
    const monthlyPercent = percent(item.monthlySpentUsdMicros, item.monthlyBudgetUsdMicros);
    const usage = Math.max(dailyPercent, monthlyPercent);
    if (usage >= 80)
      alerts.push({
        code: `AI_${item.provider}_BUDGET`,
        severity: usage >= 100 ? 'CRITICAL' : 'WARNING',
        title: `${label}の予算${usage >= 100 ? '上限に到達しました' : 'が80％を超えました'}`,
        guidance: '利用状況を確認し、必要な場合だけ予算または生成頻度を見直してください。',
        count: null,
        href: '/admin/ai',
      });
    if (item.recentProviderFailures >= 3)
      alerts.push({
        code: `AI_${item.provider}_FAILURES`,
        severity: 'WARNING',
        title: `${label}との通信・応答処理が繰り返し失敗しています`,
        guidance: '直近24時間の接続、モデル、認証情報、利用上限を確認してください。',
        count: item.recentProviderFailures,
        href: '/admin/ai',
      });
    if (item.recentUnknownCostEvents > 0)
      alerts.push({
        code: `AI_${item.provider}_UNKNOWN_COST`,
        severity: 'WARNING',
        title: `${label}の利用料を算定できない処理記録があります`,
        guidance:
          '直近24時間のトークン使用量と価格設定を確認してください。未算定分がある間は表示予算を上限保証として扱わないでください。',
        count: item.recentUnknownCostEvents,
        href: '/admin/ai',
      });
    if (item.staleOpenAdmissions > 0)
      alerts.push({
        code: `AI_${item.provider}_OPEN_ADMISSIONS`,
        severity: 'WARNING',
        title: `${label}の費用予約に未精算があります`,
        guidance:
          'AI設定画面で使用量記録と一致する予約だけを復旧してください。一致しない予約は調査が終わるまで解放しないでください。',
        count: item.staleOpenAdmissions,
        href: '/admin/ai',
      });
  }
  if (snapshot.personalLearningStaleOpenAdmissions > 0)
    alerts.push({
      code: 'AI_PERSONAL_LEARNING_OPEN_ADMISSIONS',
      severity: 'WARNING',
      title: 'AI研修の費用予約に未精算があります',
      guidance:
        'AI設定画面で利用実績と照合してください。予約は時間経過だけで解放せず、実行記録と照合できない場合は調査が終わるまで保持してください。',
      count: snapshot.personalLearningStaleOpenAdmissions,
      href: '/admin/ai',
    });
  if (snapshot.line.required && (!snapshot.line.active || !snapshot.line.verified))
    alerts.push({
      code: 'LINE_CONFIGURATION_UNAVAILABLE',
      severity: 'CRITICAL',
      title: '共通LINEを使う通知を送れません',
      guidance:
        '共通LINEを使う参加者がいます。共通LINEの設定画面を開き、表示される「次にすること」を行ってください。サービス専用LINEの通知には影響しません。',
      count: null,
      href: '/admin/line',
    });
  if (snapshot.line.required && snapshot.line.globallyPaused)
    alerts.push({
      code: 'LINE_GLOBALLY_PAUSED',
      severity: 'WARNING',
      title: '共通LINEの通知が停止中です',
      guidance:
        '共通LINEを意図して停止しているか確認してください。サービス専用LINEは別に管理されます。',
      count: null,
      href: '/admin/line',
    });
  if (snapshot.line.failedDeliveries > 0 || snapshot.line.deadJobs > 0)
    alerts.push({
      code: 'LINE_DELIVERY_FAILURES',
      severity: 'CRITICAL',
      title: '自動復旧できないLINE通知があります',
      guidance: '失敗理由を確認し、安全を確認してから再実行してください。',
      count: snapshot.line.failedDeliveries + snapshot.line.deadJobs,
      href: '/admin/line',
    });
  if (snapshot.line.retryScheduledJobs > 0)
    alerts.push({
      code: 'LINE_DELIVERY_RETRYING',
      severity: 'INFO',
      title: 'LINE通知を自動で再実行しています',
      guidance: '一時障害であれば自動復旧します。件数が減るか確認してください。',
      count: snapshot.line.retryScheduledJobs,
      href: '/admin/line',
    });
  const serviceBroadcastGroups = new Map<
    string,
    {
      code: AdminAlertSnapshot['serviceLineBroadcasts'][number]['code'];
      serviceSlug: string | null;
      serviceDisplayName: string | null;
      count: number;
    }
  >();
  for (const event of snapshot.serviceLineBroadcasts) {
    const key = `${event.code}:${event.serviceSlug ?? '-'}`;
    const current = serviceBroadcastGroups.get(key);
    if (current) current.count += 1;
    else serviceBroadcastGroups.set(key, { ...event, count: 1 });
  }
  const serviceBroadcastLabels = {
    SERVICE_BROADCAST_STALLED: {
      severity: 'WARNING',
      title: 'LINE一斉配信が予定時刻を過ぎても完了していません',
      guidance: '保留中の宛先と自動再試行の状態を確認してください。',
    },
    SERVICE_BROADCAST_HIGH_FAILURE: {
      severity: 'CRITICAL',
      title: 'LINE一斉配信の失敗が多く発生しています',
      guidance: '失敗理由と対象件数を確認し、安全を確認してから再実行してください。',
    },
    SERVICE_BROADCAST_RECOVERY_EXHAUSTED: {
      severity: 'CRITICAL',
      title: 'LINE一斉配信を自動復旧できませんでした',
      guidance: '接続設定と失敗理由を確認し、手動で再実行してください。',
    },
    SERVICE_BROADCAST_RECOVERED: {
      severity: 'INFO',
      title: 'LINE一斉配信が自動復旧しました',
      guidance: '配信履歴を開き、失敗した宛先が残っていないことを確認してください。',
    },
  } as const;
  for (const [key, event] of serviceBroadcastGroups) {
    const definition = serviceBroadcastLabels[event.code];
    const serviceLabel = event.serviceDisplayName ?? '対象サービス';
    alerts.push({
      code: key,
      severity: definition.severity,
      title: `${serviceLabel}：${definition.title}`,
      guidance: definition.guidance,
      count: event.count,
      href: event.serviceSlug
        ? `/s/${encodeURIComponent(event.serviceSlug)}/manage/line`
        : '/admin/services',
    });
  }
  const learningQuotaNotices = new Map<number, number>();
  for (const notice of snapshot.personalLearningLineQuotaNotices ?? [])
    learningQuotaNotices.set(
      notice.thresholdPercent,
      (learningQuotaNotices.get(notice.thresholdPercent) ?? 0) + 1,
    );
  for (const [thresholdPercent, count] of learningQuotaNotices) {
    alerts.push({
      code: `PERSONAL_LEARNING_LINE_QUOTA_${thresholdPercent}`,
      severity: thresholdPercent >= 90 ? 'CRITICAL' : 'WARNING',
      title:
        thresholdPercent >= 90
          ? '研修LINEの月間送信上限が近づきました'
          : '研修LINEの月間送信数が警告水準に達しました',
      guidance:
        thresholdPercent >= 90
          ? '研修のAI応答Pushは停止し、Web画面への案内に切り替えています。LINE設定と月間利用状況を確認してください。'
          : '研修LINEの月間利用状況を確認してください。上限停止水準に達するとAI応答PushをWeb画面への案内に切り替えます。',
      count,
      href: '/admin/line',
    });
  }
  if (snapshot.otherDeadJobs > 0)
    alerts.push({
      code: 'DEAD_BACKGROUND_JOBS',
      severity: 'CRITICAL',
      title: '自動復旧できない定期処理があります',
      guidance: '復旧手順を確認し、原因を解消してから再実行してください。',
      count: snapshot.otherDeadJobs,
      href: '/admin/guide',
    });
  const failedRewardsProcessing =
    snapshot.rewards.failedPointProcessing +
    snapshot.rewards.stalePointProcessing +
    snapshot.rewards.failedBadgeProcessing +
    snapshot.rewards.staleBadgeProcessing;
  if (failedRewardsProcessing > 0)
    alerts.push({
      code: 'REWARDS_PROCESSING_FAILURES',
      severity: 'WARNING',
      title: 'ポイント・バッジの自動反映を確認してください',
      guidance:
        '自動再試行されます。件数が減らない場合は、定期処理の稼働状況と失敗時刻を確認してください。',
      count: failedRewardsProcessing,
      href: '/admin/rewards',
    });
  if (snapshot.rewards.stoppedServices > 0)
    alerts.push({
      code: 'POINT_ISSUANCE_STOPPED_SERVICES',
      severity: 'INFO',
      title: 'ポイント付与を停止しているサービスがあります',
      guidance: '意図した停止か、サービス運営者へ確認してください。',
      count: snapshot.rewards.stoppedServices,
      href: '/admin/rewards',
    });
  if (snapshot.blockedDeletions > 0)
    alerts.push({
      code: 'BLOCKED_ACCOUNT_DELETIONS',
      severity: 'CRITICAL',
      title: '退会処理が停止しています',
      guidance: '停止理由を確認し、問題を解消してから再試行してください。',
      count: snapshot.blockedDeletions,
      href: '/admin/deletions',
    });
  if (snapshot.commercialBillingRefundReviews > 0)
    alerts.push({
      code: 'COMMERCIAL_BILLING_REFUND_REVIEWS',
      severity: 'WARNING',
      title: 'OEM請求に返金の要照合があります',
      guidance:
        'Stripeの返金記録、契約証跡、会計処理を照合してください。内部請求状態は自動変更されていません。',
      count: snapshot.commercialBillingRefundReviews,
      href: '/admin/commercial-billing?status=REFUND_REVIEW',
    });
  if (snapshot.openSupportCases > 0)
    alerts.push({
      code: 'OPEN_SUPPORT_CASES',
      severity: snapshot.urgentSupportCases > 0 ? 'WARNING' : 'INFO',
      title:
        snapshot.urgentSupportCases > 0
          ? '緊急の問い合わせがあります'
          : '未対応の問い合わせがあります',
      guidance: '担当者と対応状況を確認してください。',
      count: snapshot.openSupportCases,
      href: '/admin/support',
    });
  const severityOrder = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;
  return alerts.sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity]);
}

export class GetAdminAlerts {
  constructor(private readonly repository: AdminAlertRepository) {}
  async execute(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const value = await this.repository.snapshot({
      ...input,
      now,
      dailyFrom: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
      monthlyFrom: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      recentFrom: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'alert center not found');
    return { generatedAt: now, alerts: buildAdminAlerts(value) };
  }
}
