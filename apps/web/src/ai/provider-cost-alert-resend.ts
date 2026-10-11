import 'server-only';
import type {
  AiProviderStaleAdmissionAlertPort,
  StaleAiProviderAdmissionAssessment,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

export interface ProviderCostAlertResendOptions {
  apiKey: string;
  from: string;
  to: string[];
  timeoutMilliseconds?: number;
  fetch?: typeof fetch;
}

const usd = (micros: number) => `$${(micros / 1_000_000).toFixed(6)}`;

export class ProviderCostAlertResend implements AiProviderStaleAdmissionAlertPort {
  private readonly request: typeof fetch;
  private readonly timeoutMilliseconds: number;

  constructor(private readonly options: ProviderCostAlertResendOptions) {
    this.request = options.fetch ?? fetch;
    this.timeoutMilliseconds = options.timeoutMilliseconds ?? 5_000;
    if (!options.apiKey || !options.from || options.to.length === 0)
      throw new ApplicationError('CONFIGURATION_ERROR', 'incomplete Resend alert configuration');
    if (this.timeoutMilliseconds < 1_000 || this.timeoutMilliseconds > 10_000)
      throw new ApplicationError('CONFIGURATION_ERROR', 'invalid Resend alert timeout');
  }

  async notify(assessment: StaleAiProviderAdmissionAssessment): Promise<void> {
    const lines = assessment.summaries.map(
      ({ provider, openCount, reservedCostUsdMicros, oldestAdmittedAt }) =>
        `・${provider}: ${openCount}件 / 予約額 ${usd(reservedCostUsdMicros)} / 最古 ${oldestAdmittedAt.toISOString()}`,
    );
    const response = await this.request('https://api.resend.com/emails', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(this.timeoutMilliseconds),
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
        'user-agent': 'bunshin-ai-cost-operations/1.0',
        'idempotency-key': `ai-cost-${assessment.environment}-${assessment.fingerprint}`,
      },
      body: JSON.stringify({
        from: this.options.from,
        to: this.options.to,
        subject: `【ワタシワークス】AI費用予約の確認が必要です（${assessment.environment}）`,
        text: [
          'AI Providerの費用予約が15分を超えて未精算のままです。',
          '自動解放は行っていません。Provider実行と利用実績を確認してください。',
          '',
          ...lines,
          ...(assessment.truncated
            ? ['', '対象が1,000件を超えたため、今回の通知は先頭1,000件の集計です。']
            : []),
          '',
          `確認日時: ${assessment.checkedAt.toISOString()}`,
          `確認番号: ${assessment.fingerprint}`,
          '管理画面の「AI Provider設定」で詳細を確認してください。',
        ].join('\n'),
      }),
    });
    if (!response.ok) throw new ApplicationError('INTERNAL_ERROR', 'Resend alert unavailable');
  }
}
