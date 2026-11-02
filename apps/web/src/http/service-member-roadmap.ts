import 'server-only';
import { GetMemberRoadmap, GetMemberUsageSummary, type MemberRoadmap } from '@bunshin/application';
import { getServiceMemberReadResponse } from './service-member-read';
import { ApplicationError } from '@bunshin/shared';
import { selectServiceMemberRoadmapPolicy } from '../services/service-growth-policy';

// Explicit allowlist: never serialize internal scope, feature policy or source records.
function memberDto(value: MemberRoadmap) {
  return {
    version: 'member-roadmap-api-v1' as const,
    definitionVersion: value.definitionVersion,
    asOf: value.asOf,
    timezone: value.timezone,
    currentStageId: value.currentStageId,
    nextRecommended: value.nextRecommended
      ? { stageId: value.nextRecommended.stageId, milestoneId: value.nextRecommended.milestoneId }
      : null,
    stages: value.stages.map((stage) => ({
      id: stage.id,
      title: stage.title,
      status: stage.status,
      progress: {
        completed: stage.progress.completed,
        total: stage.progress.total,
        unknown: stage.progress.unknown,
      },
      milestones: stage.milestones.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        reason: item.reason,
        achievement: item.achievement,
        availability: { state: item.availability.state, reason: item.availability.reason },
        progress: { current: item.progress.current, target: item.progress.target },
      })),
    })),
  };
}

export function getServiceMemberRoadmapResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
) {
  return getServiceMemberReadResponse(request, serviceSlug, bunshinId, async (input, service) => {
    const policy = selectServiceMemberRoadmapPolicy(service);
    if (!policy) throw new ApplicationError('NOT_FOUND', 'member roadmap unavailable');
    const db = await import('@bunshin/database');
    const usage = new db.PrismaMemberUsageRepository(db.prisma);
    const context = new db.PrismaMemberRoadmapContextRepository(db.prisma);
    const roadmap = await new GetMemberRoadmap(
      new GetMemberUsageSummary(usage, usage),
      context,
      policy,
    ).execute(input);
    return memberDto(roadmap);
  });
}
