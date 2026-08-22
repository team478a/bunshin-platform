import 'server-only';
import type { LineOperationalAlertPort, LineOperationalAssessment } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

export interface LineAlertWebhookOptions {
  url: string;
  allowedHosts: string[];
  token?: string;
  timeoutMilliseconds?: number;
  fetch?: typeof fetch;
}

function validatedWebhookUrl(value: string, allowedHosts: string[]): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApplicationError('CONFIGURATION_ERROR', 'invalid LINE alert webhook URL');
  }
  const normalizedHosts = allowedHosts.map((host) => host.trim().toLowerCase()).filter(Boolean);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !normalizedHosts.includes(url.hostname.toLowerCase())
  )
    throw new ApplicationError('CONFIGURATION_ERROR', 'unsafe LINE alert webhook URL');
  return url;
}

export class LineOperationalAlertWebhook implements LineOperationalAlertPort {
  private readonly url: URL;
  private readonly request: typeof fetch;
  private readonly timeoutMilliseconds: number;

  constructor(private readonly options: LineAlertWebhookOptions) {
    this.url = validatedWebhookUrl(options.url, options.allowedHosts);
    this.request = options.fetch ?? fetch;
    this.timeoutMilliseconds = options.timeoutMilliseconds ?? 5_000;
    if (this.timeoutMilliseconds < 1_000 || this.timeoutMilliseconds > 10_000)
      throw new ApplicationError('CONFIGURATION_ERROR', 'invalid LINE alert webhook timeout');
  }

  async notify(assessment: LineOperationalAssessment): Promise<void> {
    const response = await this.request(this.url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(this.timeoutMilliseconds),
      headers: {
        'content-type': 'application/json',
        'user-agent': 'bunshin-line-operations/1.0',
        'x-bunshin-alert-key': assessment.fingerprint,
        ...(this.options.token ? { authorization: `Bearer ${this.options.token}` } : {}),
      },
      body: JSON.stringify({
        source: 'BUNSHIN_LINE',
        environment: assessment.environment,
        ready: assessment.ready,
        checkedAt: assessment.checkedAt.toISOString(),
        fingerprint: assessment.fingerprint,
        alerts: assessment.alerts,
      }),
    });
    if (!response.ok)
      throw new ApplicationError('INTERNAL_ERROR', 'LINE alert webhook unavailable');
  }
}
