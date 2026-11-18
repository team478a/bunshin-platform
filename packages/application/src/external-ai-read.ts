import {
  ExternalConnectionRead,
  ExternalReadError,
  type ExternalReadContext,
  type ExternalReadDependencies,
  type ExternalReadPrincipal,
} from './external-connection-read';

export interface ExternalDailyPostIdea {
  postingDate: string;
  socialNetwork: string;
  postingPurpose: string;
  adoptionStatus: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  format: string;
  content: Record<string, unknown>;
}

export interface ExternalCampaignBrief {
  campaignName: string;
  postingPurpose: string;
  officialAssets: Array<{ type: string; url: string; label: string; usageTerms: string }>;
  requiredDisclosures: string[];
  forbiddenExpressions: string[];
  startsAt: string;
  endsAt: string;
}

export interface ExternalAiReadProjectionPort {
  listDailyPostIdeas(context: ExternalReadContext): Promise<{ items: ExternalDailyPostIdea[] }>;
  listCampaignBriefs(context: ExternalReadContext): Promise<{ items: ExternalCampaignBrief[] }>;
}

const active = (signal: AbortSignal) => {
  if (signal.aborted) throw new ExternalReadError('TIMEOUT');
};

export class ReadExternalDailyPostIdeas {
  private readonly reader: ExternalConnectionRead<{
    version: 'external-daily-post-ideas-v1';
    asOf: string;
    items: ExternalDailyPostIdea[];
  }>;

  constructor(
    ports: ExternalReadDependencies,
    projection: Pick<ExternalAiReadProjectionPort, 'listDailyPostIdeas'>,
    now: () => Date = () => new Date(),
    timeoutMs = 30_000,
  ) {
    this.reader = new ExternalConnectionRead(
      ports,
      'daily-post-ideas:read',
      async (context) => {
        active(context.signal);
        const result = await projection.listDailyPostIdeas(context);
        active(context.signal);
        return {
          data: {
            version: 'external-daily-post-ideas-v1',
            asOf: context.asOf.toISOString(),
            items: result.items,
          },
          count: result.items.length,
        };
      },
      now,
      timeoutMs,
    );
  }

  execute(principal: ExternalReadPrincipal, input: unknown) {
    return this.reader.execute(principal, input);
  }
}

export class ReadExternalCampaignBriefs {
  private readonly reader: ExternalConnectionRead<{
    version: 'external-campaign-brief-v1';
    asOf: string;
    items: ExternalCampaignBrief[];
  }>;

  constructor(
    ports: ExternalReadDependencies,
    projection: Pick<ExternalAiReadProjectionPort, 'listCampaignBriefs'>,
    now: () => Date = () => new Date(),
    timeoutMs = 30_000,
  ) {
    this.reader = new ExternalConnectionRead(
      ports,
      'campaign-brief:read',
      async (context) => {
        active(context.signal);
        const result = await projection.listCampaignBriefs(context);
        active(context.signal);
        return {
          data: {
            version: 'external-campaign-brief-v1',
            asOf: context.asOf.toISOString(),
            items: result.items,
          },
          count: result.items.length,
        };
      },
      now,
      timeoutMs,
    );
  }

  execute(principal: ExternalReadPrincipal, input: unknown) {
    return this.reader.execute(principal, input);
  }
}
