import 'server-only';
import type { OpsMorningDigestEnvironment } from '@bunshin/database';

export type OpsMorningDigestSendFailure = 'EMAIL_PROVIDER_FAILED' | 'EMAIL_DELIVERY_UNCONFIRMED';

export class OpsMorningDigestSendError extends Error {
  constructor(readonly category: OpsMorningDigestSendFailure) {
    super(category);
    this.name = 'OpsMorningDigestSendError';
  }
}

export interface OpsMorningDigestEmail {
  apiKey: string;
  from: string;
  to: string[];
  environment: OpsMorningDigestEnvironment;
  targetDate: string;
  subject: string;
  text: string;
  timeoutMilliseconds?: number;
  fetch?: typeof fetch;
}

export class OpsMorningDigestResend {
  async send(email: OpsMorningDigestEmail): Promise<void> {
    const request = email.fetch ?? fetch;
    let response: Response;
    try {
      response = await request('https://api.resend.com/emails', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(email.timeoutMilliseconds ?? 8_000),
        headers: {
          authorization: `Bearer ${email.apiKey}`,
          'content-type': 'application/json',
          'user-agent': 'bunshin-ops-morning-digest/1.0',
          'idempotency-key': `ops-morning-digest-${email.environment}-${email.targetDate}`,
        },
        body: JSON.stringify({
          from: email.from,
          to: email.to,
          subject: email.subject,
          text: email.text,
        }),
      });
    } catch {
      throw new OpsMorningDigestSendError('EMAIL_DELIVERY_UNCONFIRMED');
    }
    if (!response.ok) throw new OpsMorningDigestSendError('EMAIL_PROVIDER_FAILED');
  }
}
