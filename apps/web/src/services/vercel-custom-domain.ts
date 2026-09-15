import { ApplicationError } from '@bunshin/shared';

type Fetch = typeof fetch;

type VerificationChallenge = {
  type?: string;
  domain?: string;
  value?: string;
  reason?: string;
};

type VercelProjectDomain = {
  name?: string;
  verified?: boolean;
  verification?: VerificationChallenge[];
};

type VercelDomainConfiguration = {
  misconfigured?: boolean;
  recommendedIPv4?: Array<{ value?: string }>;
  recommendedCNAME?: Array<{ value?: string }>;
};

export type CustomDomainConnection = {
  status: 'DRAFT' | 'VERIFIED' | 'ACTIVE';
  note: string;
};

export class VercelCustomDomainProvider {
  constructor(
    private readonly options: {
      token: string;
      projectId: string;
      teamId?: string;
      fetchImpl?: Fetch;
    },
  ) {}

  private url(path: string) {
    const url = new URL(`https://api.vercel.com${path}`);
    if (this.options.teamId) url.searchParams.set('teamId', this.options.teamId);
    return url;
  }

  private async request(path: string, init?: RequestInit) {
    const response = await (this.options.fetchImpl ?? fetch)(this.url(path), {
      ...init,
      headers: {
        authorization: `Bearer ${this.options.token}`,
        'content-type': 'application/json',
        ...init?.headers,
      },
      signal: AbortSignal.timeout(10_000),
    });
    return response;
  }

  private projectPath(hostname: string) {
    return `/v9/projects/${encodeURIComponent(this.options.projectId)}/domains/${encodeURIComponent(hostname)}`;
  }

  async synchronize(hostname: string): Promise<CustomDomainConnection> {
    let response = await this.request(this.projectPath(hostname));
    if (response.status === 404) {
      response = await this.request(
        `/v9/projects/${encodeURIComponent(this.options.projectId)}/domains`,
        { method: 'POST', body: JSON.stringify({ name: hostname }) },
      );
    }
    if (!response.ok)
      throw new ApplicationError(
        'INTERNAL_ERROR',
        `Vercelへドメインを登録できませんでした（HTTP ${response.status}）。`,
      );

    let domain = (await response.json()) as VercelProjectDomain;
    if (!domain.verified) {
      const verifyResponse = await this.request(`${this.projectPath(hostname)}/verify`, {
        method: 'POST',
      });
      const verificationResult = verifyResponse.ok
        ? ((await verifyResponse.json()) as VercelProjectDomain)
        : domain;
      const refreshed = await this.request(this.projectPath(hostname));
      domain = refreshed.ok
        ? ((await refreshed.json()) as VercelProjectDomain)
        : verificationResult;
    }

    if (!domain.verified) {
      const challenge = domain.verification?.[0];
      const instruction = [challenge?.type, challenge?.domain, challenge?.value]
        .filter((value): value is string => Boolean(value))
        .join(' / ');
      return {
        status: 'DRAFT',
        note: instruction
          ? `DNS確認待ちです。DNSに次の値を設定してください：${instruction}`
          : 'DNS確認待ちです。Vercelのドメイン設定画面に表示されたDNSレコードを設定してください。',
      };
    }
    const configurationResponse = await this.request(
      `/v6/domains/${encodeURIComponent(hostname)}/config`,
    );
    if (!configurationResponse.ok) {
      return {
        status: 'VERIFIED',
        note: `所有確認は完了しましたが、DNS接続を確認できませんでした（HTTP ${configurationResponse.status}）。`,
      };
    }
    const configuration = (await configurationResponse.json()) as VercelDomainConfiguration;
    if (configuration.misconfigured !== false) {
      const record = [
        configuration.recommendedCNAME?.[0]?.value,
        configuration.recommendedIPv4?.[0]?.value,
      ].find((value): value is string => Boolean(value));
      return {
        status: 'VERIFIED',
        note: record
          ? `所有確認は完了しました。DNSのAまたはCNAMEレコードを ${record} に設定してください。`
          : '所有確認は完了しました。Vercelの画面に表示されたAまたはCNAMEレコードを設定してください。',
      };
    }
    return {
      status: 'ACTIVE',
      note: 'Vercelでドメイン接続とSSLの準備を確認しました。',
    };
  }
}

export function vercelCustomDomainProviderFromEnvironment() {
  const token = process.env.VERCEL_CUSTOM_DOMAIN_TOKEN?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  if (!token || !projectId)
    throw new ApplicationError(
      'CONFIGURATION_ERROR',
      '独自ドメイン連携には VERCEL_CUSTOM_DOMAIN_TOKEN と VERCEL_PROJECT_ID の設定が必要です。',
    );
  return new VercelCustomDomainProvider({
    token,
    projectId,
    ...(process.env.VERCEL_TEAM_ID?.trim() ? { teamId: process.env.VERCEL_TEAM_ID.trim() } : {}),
  });
}
