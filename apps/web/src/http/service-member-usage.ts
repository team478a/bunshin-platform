import 'server-only';
import {
  GetMemberUsageSummary,
  type MemberUsageMetrics,
  type MemberUsageSummary,
} from '@bunshin/application';
import { getServiceMemberReadResponse } from './service-member-read';

function metrics(value: MemberUsageMetrics) {
  return {
    generated: value.generated,
    unknownTriggerGenerations: value.unknownTriggerGenerations,
    accepted: value.accepted,
    rejected: value.rejected,
    selfReportedPosts: value.selfReportedPosts,
    activeDays: value.activeDays,
    lastActiveAt: value.lastActiveAt,
  };
}

function memberDto(value: MemberUsageSummary) {
  return {
    version: 'member-usage-api-v1' as const,
    asOf: value.asOf,
    timezone: value.timezone,
    allTime: metrics(value.allTime),
    last7Days: {
      ...metrics(value.last7Days),
      fromLocalDate: value.last7Days.fromLocalDate,
      throughLocalDate: value.last7Days.throughLocalDate,
    },
    last30Days: {
      ...metrics(value.last30Days),
      fromLocalDate: value.last30Days.fromLocalDate,
      throughLocalDate: value.last30Days.throughLocalDate,
    },
  };
}

export function getServiceMemberUsageResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  return getServiceMemberReadResponse(request, serviceSlug, bunshinId, async (input) => {
    const db = await import('@bunshin/database');
    const adapter = new db.PrismaMemberUsageRepository(db.prisma);
    return memberDto(await new GetMemberUsageSummary(adapter, adapter).execute(input));
  });
}
