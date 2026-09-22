import type { ValidationMetricsRepository, ValidationMetricsSnapshot } from '@bunshin/application';
import { type PrismaClient, prisma } from './client';
const uniqueCount = (values: string[]) => new Set(values).size;
const rate = (numerator: number, denominator: number) =>
  denominator === 0 ? null : numerator / denominator;
const validationCopyTypes = new Set([
  'COPIED_TEXT',
  'COPIED_SLIDE',
  'COPIED_IMAGE_INSTRUCTION',
  'COPIED_VIDEO_PROMPT',
  'COPIED_SCRIPT',
]);

export function summarizeAssistanceLevels(input: {
  missions: Array<{ id: string; assistanceLevel: 'IDEA_ONLY' | 'GUIDED' | 'READY_TO_USE' }>;
  activities: Array<{
    dailyMissionId: string;
    type: string;
    dailyMission: { assistanceLevel: 'IDEA_ONLY' | 'GUIDED' | 'READY_TO_USE' };
  }>;
  posts: Array<{
    dailyMissionId: string;
    dailyMission: { assistanceLevel: 'IDEA_ONLY' | 'GUIDED' | 'READY_TO_USE' };
  }>;
  feedback: Array<{
    dailyMissionId: string;
    rating: string;
    dailyMission: { assistanceLevel: 'IDEA_ONLY' | 'GUIDED' | 'READY_TO_USE' };
  }>;
}) {
  return (['IDEA_ONLY', 'GUIDED', 'READY_TO_USE'] as const).map((level) => {
    const missionIds = new Set(
      input.missions.filter(({ assistanceLevel }) => assistanceLevel === level).map(({ id }) => id),
    );
    const activities = input.activities.filter(
      ({ dailyMission }) => dailyMission.assistanceLevel === level,
    );
    const viewed = new Set(
      activities
        .filter(({ type }) => type === 'VIEWED')
        .map(({ dailyMissionId }) => dailyMissionId),
    ).size;
    const accepted = new Set(
      activities
        .filter(({ type }) => type === 'ACCEPTED')
        .map(({ dailyMissionId }) => dailyMissionId),
    ).size;
    const copied = new Set(
      activities
        .filter(({ type }) => validationCopyTypes.has(type))
        .map(({ dailyMissionId }) => dailyMissionId),
    ).size;
    const posts = input.posts.filter(({ dailyMission }) => dailyMission.assistanceLevel === level);
    const feedback = input.feedback.filter(
      ({ dailyMission }) => dailyMission.assistanceLevel === level,
    );
    const good = feedback.filter(({ rating }) => rating === 'GOOD').length;
    const posted = new Set(posts.map(({ dailyMissionId }) => dailyMissionId)).size;
    return {
      level,
      missions: missionIds.size,
      viewed,
      accepted,
      copied,
      posted,
      feedback: feedback.length,
      goodFeedback: good,
      acceptanceRate: rate(accepted, viewed),
      copyRate: rate(copied, accepted),
      postRate: rate(posted, copied),
      goodFeedbackRate: rate(good, feedback.length),
    };
  });
}

export function summarizePersonalityLearning(
  proposals: Array<{
    bunshinId: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
    reason: string;
  }>,
): ValidationMetricsSnapshot['personalityLearning'] {
  const approved = proposals.filter(({ status }) => status === 'APPROVED').length;
  const rejected = proposals.filter(({ status }) => status === 'REJECTED').length;
  const revoked = proposals.filter(({ status }) => status === 'REVOKED').length;
  const decided = approved + rejected + revoked;
  const correctionKeys = new Map<string, number>();
  for (const proposal of proposals) {
    const key = `${proposal.bunshinId}:${proposal.reason.trim().toLocaleLowerCase('ja-JP')}`;
    correctionKeys.set(key, (correctionKeys.get(key) ?? 0) + 1);
  }
  return {
    proposed: proposals.length,
    approved,
    rejected,
    revoked,
    decided,
    adoptionRate: rate(approved, decided),
    repeatedCorrectionCount: [...correctionKeys.values()].reduce(
      (sum, count) => sum + Math.max(0, count - 1),
      0,
    ),
    applications: 0,
    cohortTruncated: false,
    before: emptyPersonalityLearningOutcome(),
    after: emptyPersonalityLearningOutcome(),
  };
}

const LEARNING_OUTCOME_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;

function emptyPersonalityLearningOutcome() {
  return {
    missions: 0,
    posted: 0,
    postRate: null,
    feedback: 0,
    goodFeedback: 0,
    goodFeedbackRate: null,
  };
}

export function summarizePersonalityLearningOutcomes(
  applications: Array<{ bunshinId: string; appliedAt: Date }>,
  missions: Array<{
    id: string;
    bunshinId: string;
    createdAt: Date;
    posted: boolean;
    rating: 'GOOD' | 'BAD' | 'NEUTRAL' | null;
  }>,
) {
  const beforeIds = new Set<string>();
  const afterIds = new Set<string>();
  const missionsByBunshin = new Map<string, typeof missions>();
  for (const mission of missions) {
    const values = missionsByBunshin.get(mission.bunshinId) ?? [];
    values.push(mission);
    missionsByBunshin.set(mission.bunshinId, values);
  }
  for (const application of applications) {
    const from = application.appliedAt.getTime() - LEARNING_OUTCOME_WINDOW_MS;
    const to = application.appliedAt.getTime() + LEARNING_OUTCOME_WINDOW_MS;
    for (const mission of missionsByBunshin.get(application.bunshinId) ?? []) {
      const at = mission.createdAt.getTime();
      if (at >= from && at < application.appliedAt.getTime()) beforeIds.add(mission.id);
      if (at >= application.appliedAt.getTime() && at < to) afterIds.add(mission.id);
    }
  }
  const summarize = (ids: Set<string>) => {
    const values = missions.filter(({ id }) => ids.has(id));
    const feedback = values.filter(({ rating }) => rating !== null);
    const goodFeedback = feedback.filter(({ rating }) => rating === 'GOOD').length;
    const posted = values.filter(({ posted }) => posted).length;
    return {
      missions: values.length,
      posted,
      postRate: rate(posted, values.length),
      feedback: feedback.length,
      goodFeedback,
      goodFeedbackRate: rate(goodFeedback, feedback.length),
    };
  };
  return { before: summarize(beforeIds), after: summarize(afterIds) };
}

export class PrismaValidationMetricsRepository implements ValidationMetricsRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async summarize(input: {
    workspaceId: string;
    actorUserId: string;
    period: { from: Date; to: Date };
  }): Promise<ValidationMetricsSnapshot | null> {
    const authorized = await this.client.workspaceMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        role: { in: ['OWNER', 'ADMIN'] },
        workspace: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (authorized === null) return null;

    const occurred = { gte: input.period.from, lt: input.period.to };
    const matureLearningApplication = {
      gte: input.period.from,
      lt: new Date(input.period.to.getTime() - LEARNING_OUTCOME_WINDOW_MS),
    };
    const copyTypes = [
      'COPIED_TEXT',
      'COPIED_SLIDE',
      'COPIED_IMAGE_INSTRUCTION',
      'COPIED_VIDEO_PROMPT',
      'COPIED_SCRIPT',
    ] as const;
    const [
      registrations,
      bunshins,
      activations,
      strategies,
      missions,
      activities,
      posts,
      feedback,
      aiUsage,
      learningProposals,
      learningApplications,
    ] = await Promise.all([
      this.client.workspaceMembership.findMany({
        where: {
          workspaceId: input.workspaceId,
          status: 'ACTIVE',
          user: { createdAt: occurred },
        },
        select: { userId: true, user: { select: { createdAt: true } } },
      }),
      this.client.bunshin.findMany({
        where: { workspaceId: input.workspaceId, createdAt: occurred },
        select: { ownerUserId: true },
      }),
      this.client.bunshinCapabilityAssignment.findMany({
        where: {
          workspaceId: input.workspaceId,
          capabilityType: 'SOCIAL',
          activatedAt: occurred,
        },
        select: { assignedByUserId: true },
      }),
      this.client.socialAccountStrategy.findMany({
        where: { workspaceId: input.workspaceId, createdAt: occurred },
        select: {
          status: true,
          approvedAt: true,
          bunshin: { select: { ownerUserId: true } },
        },
      }),
      this.client.dailyMission.findMany({
        where: { workspaceId: input.workspaceId, createdAt: occurred },
        select: { id: true, assistanceLevel: true },
      }),
      this.client.missionActivity.findMany({
        where: { workspaceId: input.workspaceId, occurredAt: occurred },
        select: {
          actorUserId: true,
          dailyMissionId: true,
          type: true,
          dailyMission: { select: { assistanceLevel: true } },
        },
      }),
      this.client.postRecord.findMany({
        where: { workspaceId: input.workspaceId, postedAt: occurred },
        select: {
          actorUserId: true,
          dailyMissionId: true,
          postedAt: true,
          dailyMission: { select: { assistanceLevel: true } },
        },
      }),
      this.client.missionFeedback.findMany({
        where: { workspaceId: input.workspaceId, createdAt: occurred },
        select: {
          actorUserId: true,
          dailyMissionId: true,
          rating: true,
          dailyMission: { select: { assistanceLevel: true } },
        },
      }),
      this.client.aiUsageEvent.findMany({
        where: { workspaceId: input.workspaceId, occurredAt: occurred },
        select: {
          status: true,
          inputTokens: true,
          outputTokens: true,
          estimatedCostUsdMicros: true,
        },
      }),
      this.client.personalityLearningProposal.findMany({
        where: { workspaceId: input.workspaceId, createdAt: occurred },
        select: { bunshinId: true, status: true, reason: true },
      }),
      this.client.personalityLearningProposal.findMany({
        where: {
          workspaceId: input.workspaceId,
          status: { in: ['APPROVED', 'REVOKED'] },
          appliedVersion: { is: { createdAt: matureLearningApplication } },
        },
        select: { bunshinId: true, appliedVersion: { select: { createdAt: true } } },
        orderBy: { createdAt: 'asc' },
        take: 501,
      }),
    ]);

    const matureCohort = registrations.filter(
      ({ user }) => user.createdAt.getTime() + 8 * 24 * 60 * 60 * 1000 <= input.period.to.getTime(),
    );
    const cohortIds = matureCohort.map(({ userId }) => userId);
    const cohortActivity =
      cohortIds.length === 0
        ? []
        : await this.client.missionActivity.findMany({
            where: { workspaceId: input.workspaceId, actorUserId: { in: cohortIds } },
            select: { actorUserId: true, occurredAt: true },
          });
    const cohortPosts =
      cohortIds.length === 0
        ? []
        : await this.client.postRecord.findMany({
            where: { workspaceId: input.workspaceId, actorUserId: { in: cohortIds } },
            select: { actorUserId: true, postedAt: true },
          });
    const createdByUser = new Map(
      matureCohort.map((value) => [value.userId, value.user.createdAt]),
    );
    const d7Active = new Set<string>();
    const firstWeekPostCounts = new Map<string, number>();
    for (const activity of cohortActivity) {
      const createdAt = createdByUser.get(activity.actorUserId);
      if (
        createdAt &&
        activity.occurredAt >= new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000) &&
        activity.occurredAt < new Date(createdAt.getTime() + 8 * 24 * 60 * 60 * 1000)
      )
        d7Active.add(activity.actorUserId);
    }
    for (const post of cohortPosts) {
      const createdAt = createdByUser.get(post.actorUserId);
      if (!createdAt) continue;
      if (
        post.postedAt >= createdAt &&
        post.postedAt < new Date(createdAt.getTime() + 7 * 86400000)
      ) {
        firstWeekPostCounts.set(
          post.actorUserId,
          (firstWeekPostCounts.get(post.actorUserId) ?? 0) + 1,
        );
      }
      if (
        post.postedAt >= new Date(createdAt.getTime() + 7 * 86400000) &&
        post.postedAt < new Date(createdAt.getTime() + 8 * 86400000)
      )
        d7Active.add(post.actorUserId);
    }
    const threePostUsers = [...firstWeekPostCounts.values()].filter((value) => value >= 3).length;
    const goodFeedbackCount = feedback.filter(({ rating }) => rating === 'GOOD').length;
    const viewedUsers = activities
      .filter(({ type }) => type === 'VIEWED')
      .map(({ actorUserId }) => actorUserId);
    const acceptedUsers = activities
      .filter(({ type }) => type === 'ACCEPTED')
      .map(({ actorUserId }) => actorUserId);
    const copiedUsers = activities
      .filter(({ type }) => copyTypes.includes(type as (typeof copyTypes)[number]))
      .map(({ actorUserId }) => actorUserId);
    const approvedStrategyUsers = strategies
      .filter(
        ({ approvedAt }) =>
          approvedAt && approvedAt >= input.period.from && approvedAt < input.period.to,
      )
      .map(({ bunshin }) => bunshin.ownerUserId);
    const eligible = matureCohort.length;
    const pricedAiUsage = aiUsage.filter(
      ({ estimatedCostUsdMicros }) => estimatedCostUsdMicros !== null,
    );
    const assistanceLevels = summarizeAssistanceLevels({ missions, activities, posts, feedback });
    const personalityLearning = summarizePersonalityLearning(learningProposals);
    const learningCohort = learningApplications
      .slice(0, 500)
      .flatMap((application) =>
        application.appliedVersion
          ? [{ bunshinId: application.bunshinId, appliedAt: application.appliedVersion.createdAt }]
          : [],
      );
    const learningMissions =
      learningCohort.length === 0
        ? []
        : await this.client.dailyMission.findMany({
            where: {
              workspaceId: input.workspaceId,
              bunshinId: { in: [...new Set(learningCohort.map(({ bunshinId }) => bunshinId))] },
              createdAt: {
                gte: new Date(
                  Math.min(...learningCohort.map(({ appliedAt }) => appliedAt.getTime())) -
                    LEARNING_OUTCOME_WINDOW_MS,
                ),
                lt: new Date(
                  Math.max(...learningCohort.map(({ appliedAt }) => appliedAt.getTime())) +
                    LEARNING_OUTCOME_WINDOW_MS,
                ),
              },
            },
            select: {
              id: true,
              bunshinId: true,
              createdAt: true,
              postRecord: { select: { id: true } },
              feedback: { select: { rating: true } },
            },
            take: 50_001,
          });
    const learningOutcomes = summarizePersonalityLearningOutcomes(
      learningCohort,
      learningMissions.slice(0, 50_000).map((mission) => ({
        id: mission.id,
        bunshinId: mission.bunshinId,
        createdAt: mission.createdAt,
        posted: mission.postRecord !== null,
        rating: mission.feedback?.rating ?? null,
      })),
    );
    personalityLearning.applications = learningCohort.length;
    personalityLearning.cohortTruncated =
      learningApplications.length > 500 || learningMissions.length > 50_000;
    personalityLearning.before = learningOutcomes.before;
    personalityLearning.after = learningOutcomes.after;

    return {
      period: input.period,
      funnel: {
        registrations: uniqueCount(registrations.map(({ userId }) => userId)),
        bunshinCreations: uniqueCount(bunshins.map(({ ownerUserId }) => ownerUserId)),
        socialActivations: uniqueCount(activations.map(({ assignedByUserId }) => assignedByUserId)),
        strategyCompletions: uniqueCount(strategies.map(({ bunshin }) => bunshin.ownerUserId)),
        strategyApprovals: uniqueCount(approvedStrategyUsers),
        firstMissionViews: uniqueCount(viewedUsers),
        missionAcceptances: uniqueCount(acceptedUsers),
        copies: uniqueCount(copiedUsers),
        posts: uniqueCount(posts.map(({ actorUserId }) => actorUserId)),
        d7ActiveUsers: d7Active.size,
      },
      outcomes: {
        postedUsers: uniqueCount(posts.map(({ actorUserId }) => actorUserId)),
        postCount: posts.length,
        feedbackCount: feedback.length,
        goodFeedbackCount,
        goodFeedbackRate: rate(goodFeedbackCount, feedback.length),
        threePostsInFirstSevenDaysUsers: threePostUsers,
        eligibleFirstSevenDayUsers: eligible,
        threePostsInFirstSevenDaysRate: rate(threePostUsers, eligible),
        d7EligibleUsers: eligible,
        d7ActiveRate: rate(d7Active.size, eligible),
        aiCalls: aiUsage.length,
        aiSuccessfulCalls: aiUsage.filter(({ status }) => status === 'SUCCESS').length,
        aiFailedCalls: aiUsage.filter(({ status }) => status === 'FAILED').length,
        aiInputTokens: aiUsage.reduce((sum, value) => sum + (value.inputTokens ?? 0), 0),
        aiOutputTokens: aiUsage.reduce((sum, value) => sum + (value.outputTokens ?? 0), 0),
        aiPricedCalls: pricedAiUsage.length,
        aiEstimatedCostUsdMicros:
          pricedAiUsage.length === 0
            ? null
            : Number(
                pricedAiUsage.reduce(
                  (sum, value) => sum + (value.estimatedCostUsdMicros ?? 0n),
                  0n,
                ),
              ),
      },
      assistanceLevels,
      personalityLearning,
    };
  }
}
