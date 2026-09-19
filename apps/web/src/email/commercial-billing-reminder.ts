import 'server-only';
import { ApplicationError } from '@bunshin/shared';

export interface CommercialBillingReminderInput {
  apiKey: string;
  from: string;
  to: string;
  invoiceNumber: string;
  billingName: string;
  amountYen: number;
  dueAt: Date;
  checkoutUrl: string | null;
  overdue: boolean;
  idempotencyKey: string;
}

export class CommercialBillingReminderResend {
  constructor(private readonly request: typeof fetch = fetch) {}

  async send(input: CommercialBillingReminderInput): Promise<void> {
    const dueDate = input.dueAt.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
    const subject = input.overdue
      ? `【ワタシワークス】お支払期限を過ぎています（${input.invoiceNumber}）`
      : `【ワタシワークス】月額利用料のお支払い案内（${input.invoiceNumber}）`;
    const payment = input.checkoutUrl
      ? ['', '以下のページからお支払いください。', input.checkoutUrl]
      : ['', 'お支払い方法は、別途ご案内している請求書をご確認ください。'];
    const response = await this.request('https://api.resend.com/emails', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': input.idempotencyKey,
        'user-agent': 'bunshin-commercial-billing/1.0',
      },
      body: JSON.stringify({
        from: input.from,
        to: [input.to],
        subject,
        text: [
          `${input.billingName} ご担当者様`,
          '',
          input.overdue
            ? 'ワタシワークス月額利用料のお支払期限を過ぎています。行き違いでお支払い済みの場合はご容赦ください。'
            : 'ワタシワークス月額利用料のお支払いをご案内します。',
          '',
          `請求番号: ${input.invoiceNumber}`,
          `請求金額: ${input.amountYen.toLocaleString('ja-JP')}円`,
          `支払期限: ${dueDate}`,
          ...payment,
          '',
          'ご不明な点は、ワタシワークス運営までお問い合わせください。',
        ].join('\n'),
      }),
    });
    if (!response.ok)
      throw new ApplicationError('INTERNAL_ERROR', 'commercial billing reminder unavailable');
  }
}
