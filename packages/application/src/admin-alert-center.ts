import { ApplicationError } from '@bunshin/shared';
import type { AiProviderKey, LineConfigurationEnvironment } from './index';

export type AdminAlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
export interface AdminAlert {
  code: string;
  severity: AdminAlertSeverity;
  title: string;
  guidance: string;
  count: number | null;
  href: '/admin/ai' | '/admin/line' | '/admin/support' | '/admin/deletions' | '/admin/guide';
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
    recentFailures: number;
  }>;
  line: {
    active: boolean;
    verified: boolean;
    globallyPaused: boolean;
    failedDeliveries: number;
    retryScheduledJobs: number;
    deadJobs: number;
  };
  otherDeadJobs: number;
  blockedDeletions: number;
  openSupportCases: number;
  urgentSupportCases: number;
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
    if (item.recentFailures >= 3)
      alerts.push({
        code: `AI_${item.provider}_FAILURES`,
        severity: 'WARNING',
        title: `${label}の処理が繰り返し失敗しています`,
        guidance: '直近24時間の接続、モデル、利用上限を確認してください。',
        count: item.recentFailures,
        href: '/admin/ai',
      });
  }
  if (!snapshot.line.active || !snapshot.line.verified)
    alerts.push({
      code: 'LINE_CONFIGURATION_UNAVAILABLE',
      severity: 'CRITICAL',
      title: 'LINE通知を送れません',
      guidance: 'LINEの設定画面を開き、表示される「次にすること」を行ってください。',
      count: null,
      href: '/admin/line',
    });
  if (snapshot.line.globallyPaused)
    alerts.push({
      code: 'LINE_GLOBALLY_PAUSED',
      severity: 'WARNING',
      title: 'LINE通知が全体停止中です',
      guidance: '意図した停止か確認してください。',
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
  if (snapshot.otherDeadJobs > 0)
    alerts.push({
      code: 'DEAD_BACKGROUND_JOBS',
      severity: 'CRITICAL',
      title: '自動復旧できない定期処理があります',
      guidance: '復旧手順を確認し、原因を解消してから再実行してください。',
      count: snapshot.otherDeadJobs,
      href: '/admin/guide',
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
