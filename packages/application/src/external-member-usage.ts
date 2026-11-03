import {
  ExternalConnectionRead,
  ExternalReadError,
  type ExternalReadDependencies,
  type ExternalReadPrincipal,
} from './external-connection-read';
import {
  GetMemberUsageSummary,
  type MemberUsageAuthorizationPort,
  type MemberUsageSourceRepository,
  type MemberUsageSummary,
} from './member-usage';

function windowDto(window: MemberUsageSummary['last7Days']) {
  return {
    fromLocalDate: window.fromLocalDate,
    throughLocalDate: window.throughLocalDate,
    generated: window.generated,
    unknownTriggerGenerations: window.unknownTriggerGenerations,
    accepted: window.accepted,
    rejected: window.rejected,
    selfReportedPosts: window.selfReportedPosts,
    activeDays: window.activeDays,
  };
}
/** Explicit allowlist: never spread internal summaries, scope, costs or timestamps. */
function externalUsageDto(summary: MemberUsageSummary) {
  return {
    version: 'external-member-usage-v1' as const,
    asOf: summary.asOf,
    timezone: summary.timezone,
    postEvidence: 'SELF_REPORTED_NOT_VERIFIED' as const,
    last7Days: windowDto(summary.last7Days),
    last30Days: windowDto(summary.last30Days),
  };
}
export type ExternalMemberUsageDto = ReturnType<typeof externalUsageDto>;
/** No HTTP/OAuth wiring: credential authentication and durable grants remain separate adapters. */
export class ReadExternalMemberUsage {
  private readonly reader: ExternalConnectionRead<ExternalMemberUsageDto>;
  constructor(
    ports: ExternalReadDependencies,
    authorization: MemberUsageAuthorizationPort,
    sources: MemberUsageSourceRepository,
    now: () => Date = () => new Date(),
    timeoutMs = 30_000,
  ) {
    this.reader = new ExternalConnectionRead(
      ports,
      'member-usage:read',
      async (context) => {
        const active = () => {
          if (context.signal.aborted) throw new ExternalReadError('TIMEOUT');
        };
        const usage = new GetMemberUsageSummary(
          {
            authorize: async (request) => {
              active();
              const allowed = await authorization.authorize(request);
              active();
              return allowed;
            },
          },
          {
            read: async (request) => {
              active();
              const value = await sources.read(request);
              active();
              return value;
            },
          },
        );
        const summary = await usage.execute({
          actorUserId: context.scope.userId,
          scope: { ...context.scope },
          asOf: new Date(context.asOf),
          timezone: 'Asia/Tokyo',
        });
        return { data: externalUsageDto(summary), count: 1 };
      },
      now,
      timeoutMs,
    );
  }
  execute(principal: ExternalReadPrincipal, input: unknown) {
    return this.reader.execute(principal, input);
  }
}
