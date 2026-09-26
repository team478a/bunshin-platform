import {
  GetBunshin,
  GetLineNotificationPreference,
  ListBunshinCapabilityAssignments,
  ListBunshinMemories,
  ListPersonalityLearningProposals,
  ListPersonalityVersions,
  ListPointRewardCatalog,
} from '@bunshin/application';
import {
  EvaluateActivityMotivation,
  GetMissionDecision,
  GetMissionProgress,
  ListContentPillars,
  ListDailyMissions,
  ListMissionContentVariants,
  ListSocialAccountStrategies,
  ListSocialProfiles,
  ListWeeklyPlans,
} from '@bunshin/capability-social';
import { currentActivityContinuityRule } from '../../../../src/activity-continuity-rule';
import { localDateInTimezone, weekRange } from '../../../../src/activity-progress';
import { missionDecisionOrPending } from '../../../../src/mission-decision-fallback';

export async function loadBunshinPageData({
  workspaceId,
  bunshinId,
  actorUserId,
}: {
  workspaceId: string;
  bunshinId: string;
  actorUserId: string;
}) {
  const db = await import('@bunshin/database');
  const bunshin = await new GetBunshin(new db.PrismaBunshinRepository()).execute({
    workspaceId,
    bunshinId,
    actorUserId,
  });
  const personalityVersions = await new ListPersonalityVersions(
    new db.PrismaPersonalityVersionRepository(),
  ).execute({ workspaceId, bunshinId: bunshin.id, actorUserId });
  const personalityLearningProposals = await new ListPersonalityLearningProposals(
    new db.PrismaPersonalityLearningProposalRepository(),
  ).execute({ workspaceId, bunshinId: bunshin.id, actorUserId });
  const owned = await new db.PrismaOwnerKnowledgeRepository().listOwned({
    workspaceId,
    actorUserId,
  });
  const granted = await new db.PrismaKnowledgeGrantRepository().listGrantedKnowledge({
    workspaceId,
    actorUserId,
    bunshinId: bunshin.id,
  });
  const memories = await new ListBunshinMemories(new db.PrismaBunshinMemoryRepository()).execute({
    workspaceId,
    actorUserId,
    bunshinId: bunshin.id,
    includeInactive: true,
  });
  const capabilities = await new ListBunshinCapabilityAssignments(
    new db.PrismaBunshinCapabilityAssignmentRepository(),
  ).execute({ workspaceId, actorUserId, bunshinId: bunshin.id });
  const socialCapabilityStatus =
    capabilities.find(({ capabilityType }) => capabilityType === 'SOCIAL')?.status ?? null;
  const lineNotificationPreference = await new GetLineNotificationPreference(
    new db.PrismaLineNotificationPreferenceRepository(),
  ).execute({ workspaceId, actorUserId, bunshinId: bunshin.id });
  const socialProfiles = await new ListSocialProfiles(
    new db.PrismaSocialProfileRepository(),
  ).execute({ workspaceId, actorUserId, bunshinId: bunshin.id });
  const strategyRepository = new db.PrismaSocialAccountStrategyRepository();
  const socialStrategies = (
    await Promise.all(
      socialProfiles.map((profile) =>
        new ListSocialAccountStrategies(strategyRepository).execute({
          workspaceId,
          actorUserId,
          bunshinId: bunshin.id,
          socialProfileId: profile.id,
        }),
      ),
    )
  ).flat();
  const contentPillars = await new ListContentPillars(
    new db.PrismaContentPillarRepository(),
  ).execute({ workspaceId, actorUserId, bunshinId: bunshin.id });
  const weeklyPlans = await new ListWeeklyPlans(new db.PrismaWeeklyPlanRepository()).execute({
    workspaceId,
    actorUserId,
    bunshinId: bunshin.id,
  });
  const dailyMissions = await new ListDailyMissions(new db.PrismaDailyMissionRepository()).execute({
    workspaceId,
    actorUserId,
    bunshinId: bunshin.id,
  });
  const engagementRepository = new db.PrismaMissionEngagementRepository();
  const localDate = localDateInTimezone(new Date(), 'Asia/Tokyo');
  const activityRule = await currentActivityContinuityRule();
  const currentWeek = weekRange(localDate);
  const progress =
    socialCapabilityStatus === 'ACTIVE'
      ? await new GetMissionProgress(
          new db.PrismaBunshinCapabilityAssignmentRepository(),
          engagementRepository,
        ).execute({
          workspaceId,
          actorUserId,
          bunshinId: bunshin.id,
          ...currentWeek,
          weeklyGoal: activityRule.weeklyGoal,
        })
      : {
          ...currentWeek,
          weeklyGoal: activityRule.weeklyGoal,
          remainingConfirmations: 3,
          weekly: { confirmedDays: 0, preparedDays: 0, postedDays: 0, restedDays: 0, days: [] },
          cumulative: {
            confirmedDays: 0,
            preparedDays: 0,
            postedDays: 0,
            restedDays: 0,
            activeDays: 0,
            lastActiveDate: null,
          },
        };
  const motivation = await new EvaluateActivityMotivation(
    new db.PrismaAchievementBadgeRepository(),
  ).execute({
    workspaceId,
    actorUserId,
    bunshinId: bunshin.id,
    localDate,
    progress,
    rule: activityRule,
  });
  const missionDecisions = await Promise.all(
    dailyMissions.map((mission) =>
      missionDecisionOrPending(() =>
        new GetMissionDecision(engagementRepository).execute({
          workspaceId,
          actorUserId,
          bunshinId: bunshin.id,
          dailyMissionId: mission.id,
        }),
      ),
    ),
  );
  const outcomeRepository = new db.PrismaMissionOutcomeRepository();
  const missionOutcomes = await Promise.all(
    dailyMissions.map(async (mission) => ({
      post: await outcomeRepository.getPost({
        workspaceId,
        actorUserId,
        bunshinId: bunshin.id,
        dailyMissionId: mission.id,
      }),
      feedback: await outcomeRepository.getFeedback({
        workspaceId,
        actorUserId,
        bunshinId: bunshin.id,
        dailyMissionId: mission.id,
      }),
    })),
  );
  const missionVariants = await Promise.all(
    dailyMissions.map((mission) =>
      new ListMissionContentVariants(new db.PrismaMissionContentVariantRepository()).execute({
        workspaceId,
        actorUserId,
        bunshinId: bunshin.id,
        dailyMissionId: mission.id,
      }),
    ),
  );
  const variantPointCost = await new ListPointRewardCatalog(
    new db.PrismaPointRedemptionRepository(),
  )
    .execute({
      workspaceId,
      ...(bunshin.groupId === undefined ? {} : { groupId: bunshin.groupId }),
      actorUserId,
    })
    .then(
      (catalog) =>
        catalog.find(({ rewardType }) => rewardType === 'ALTERNATIVE_PLAN_GENERATION')?.pointCost ??
        null,
    )
    .catch(() => null);
  const rewardsPilotActive = bunshin.groupId
    ? Boolean(
        await db
          .getActiveRewardsPilotAccess(db.prisma, {
            workspaceId,
            groupId: bunshin.groupId,
            userId: actorUserId,
          })
          .catch(() => null),
      )
    : false;

  return {
    bunshin,
    personalityVersions,
    personalityLearningProposals,
    owned,
    granted,
    memories,
    socialCapabilityStatus,
    lineNotificationPreference,
    socialProfiles,
    socialStrategies,
    contentPillars,
    weeklyPlans,
    dailyMissions,
    missionDecisions,
    missionOutcomes,
    missionVariants,
    variantPointCost,
    rewardsPilotActive,
    progress,
    motivation,
    localDate,
  };
}

export type BunshinPageData = Awaited<ReturnType<typeof loadBunshinPageData>>;
