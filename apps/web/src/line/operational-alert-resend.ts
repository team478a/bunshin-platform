import 'server-only';
import type { LineOperationalAlertPort, LineOperationalAssessment } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

export interface ResendOperationalAlertOptions {
  apiKey: string;
  from: string;
  to: string[];
  timeoutMilliseconds?: number;
  fetch?: typeof fetch;
}

const alertLabels: Readonly<Record<string, string>> = {
  ACTIVE_CONFIGURATION_MISSING: '利用中のLINE設定がありません',
  ACTIVE_CONFIGURATION_UNVERIFIED: 'LINE設定の接続確認が完了していません',
  DELIVERY_GLOBALLY_PAUSED: 'LINE配信が全体停止中です',
  DEAD_DELIVERY_JOBS: '送信できず停止した通知があります',
  RETRY_SCHEDULED_DELIVERY_JOBS: '再送待ちの通知があります',
};

export class LineOperationalAlertResend implements LineOperationalAlertPort {
  private readonly request: typeof fetch;
  private readonly timeoutMilliseconds: number;

  constructor(private readonly options: ResendOperationalAlertOptions) {
    this.request = options.fetch ?? fetch;
    this.timeoutMilliseconds = options.timeoutMilliseconds ?? 5_000;
    if (!options.apiKey || !options.from || options.to.length === 0)
      throw new ApplicationError('CONFIGURATION_ERROR', 'incomplete Resend alert configuration');
    if (this.timeoutMilliseconds < 1_000 || this.timeoutMilliseconds > 10_000)
      throw new ApplicationError('CONFIGURATION_ERROR', 'invalid Resend alert timeout');
  }

  async notify(assessment: LineOperationalAssessment): Promise<void> {
    const lines = assessment.alerts.map((alert) => {
      const label = alertLabels[alert.code] ?? `障害分類: ${alert.code}`;
      return `・${label}${alert.count === null ? '' : `（${alert.count}件）`}`;
    });
    const response = await this.request('https://api.resend.com/emails', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(this.timeoutMilliseconds),
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
        'user-agent': 'bunshin-line-operations/1.0',
        'idempotency-key': `line-${assessment.environment}-${assessment.fingerprint}`,
      },
      body: JSON.stringify({
        from: this.options.from,
        to: this.options.to,
        subject: `【ワタシワークス】LINE運用の確認が必要です（${assessment.environment}）`,
        text: [
          'ワタシワークスのLINE運用で確認が必要な状態を検知しました。',
          '',
          ...lines,
          '',
          `確認日時: ${assessment.checkedAt.toISOString()}`,
          `確認番号: ${assessment.fingerprint}`,
          '管理画面の「運用アラート」で詳細を確認してください。',
        ].join('\n'),
      }),
    });
    if (!response.ok) throw new ApplicationError('INTERNAL_ERROR', 'Resend alert unavailable');
  }
}
