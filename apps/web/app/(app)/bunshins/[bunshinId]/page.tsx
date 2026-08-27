import {
  GetBunshin,
  ListBunshinCapabilityAssignments,
  ListBunshinMemories,
  GetLineNotificationPreference,
  ListPersonalityVersions,
} from '@bunshin/application';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import {
  ListContentPillars,
  ListSocialProfiles,
  ListSocialAccountStrategies,
  ListWeeklyPlans,
  ListDailyMissions,
  GetMissionDecision,
  GetMissionProgress,
} from '@bunshin/capability-social';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { localDateInTimezone, weekRange } from '../../../../src/activity-progress';
import { BunshinEditor } from './editor';

export const dynamic = 'force-dynamic';

export default async function BunshinPage({
  params,
  searchParams,
}: {
  params: Promise<{ bunshinId: string }>;
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  const currentUser = await (await currentUserProvider()).getCurrentUser();
  if (currentUser === null) redirect('/login');
  const workspaceId = (await searchParams).workspaceId;
  if (!workspaceId) notFound();
  try {
    const {
      PrismaBunshinRepository,
      PrismaOwnerKnowledgeRepository,
      PrismaKnowledgeGrantRepository,
      PrismaBunshinMemoryRepository,
      PrismaBunshinCapabilityAssignmentRepository,
      PrismaSocialProfileRepository,
      PrismaSocialAccountStrategyRepository,
      PrismaContentPillarRepository,
      PrismaWeeklyPlanRepository,
      PrismaDailyMissionRepository,
      PrismaMissionEngagementRepository,
      PrismaMissionOutcomeRepository,
      PrismaLineNotificationPreferenceRepository,
      PrismaPersonalityVersionRepository,
    } = await import('@bunshin/database');
    const bunshin = await new GetBunshin(new PrismaBunshinRepository()).execute({
      workspaceId,
      bunshinId: (await params).bunshinId,
      actorUserId: currentUser.userId,
    });
    const personalityVersions = await new ListPersonalityVersions(
      new PrismaPersonalityVersionRepository(),
    ).execute({
      workspaceId,
      bunshinId: bunshin.id,
      actorUserId: currentUser.userId,
    });
    const owned = await new PrismaOwnerKnowledgeRepository().listOwned({
      workspaceId,
      actorUserId: currentUser.userId,
    });
    const granted = await new PrismaKnowledgeGrantRepository().listGrantedKnowledge({
      workspaceId,
      actorUserId: currentUser.userId,
      bunshinId: bunshin.id,
    });
    const memories = await new ListBunshinMemories(new PrismaBunshinMemoryRepository()).execute({
      workspaceId,
      actorUserId: currentUser.userId,
      bunshinId: bunshin.id,
      includeInactive: true,
    });
    const capabilities = await new ListBunshinCapabilityAssignments(
      new PrismaBunshinCapabilityAssignmentRepository(),
    ).execute({
      workspaceId,
      actorUserId: currentUser.userId,
      bunshinId: bunshin.id,
    });
    const socialCapabilityStatus =
      capabilities.find(({ capabilityType }) => capabilityType === 'SOCIAL')?.status ?? null;
    const lineNotificationPreference = await new GetLineNotificationPreference(
      new PrismaLineNotificationPreferenceRepository(),
    ).execute({
      workspaceId,
      actorUserId: currentUser.userId,
      bunshinId: bunshin.id,
    });
    const socialProfiles = await new ListSocialProfiles(
      new PrismaSocialProfileRepository(),
    ).execute({
      workspaceId,
      actorUserId: currentUser.userId,
      bunshinId: bunshin.id,
    });
    const strategyRepository = new PrismaSocialAccountStrategyRepository();
    const socialStrategies = (
      await Promise.all(
        socialProfiles.map((profile) =>
          new ListSocialAccountStrategies(strategyRepository).execute({
            workspaceId,
            actorUserId: currentUser.userId,
            bunshinId: bunshin.id,
            socialProfileId: profile.id,
          }),
        ),
      )
    ).flat();
    const contentPillars = await new ListContentPillars(
      new PrismaContentPillarRepository(),
    ).execute({ workspaceId, actorUserId: currentUser.userId, bunshinId: bunshin.id });
    const weeklyPlans = await new ListWeeklyPlans(new PrismaWeeklyPlanRepository()).execute({
      workspaceId,
      actorUserId: currentUser.userId,
      bunshinId: bunshin.id,
    });
    const dailyMissions = await new ListDailyMissions(new PrismaDailyMissionRepository()).execute({
      workspaceId,
      actorUserId: currentUser.userId,
      bunshinId: bunshin.id,
    });
    const engagementRepository = new PrismaMissionEngagementRepository();
    const localDate = localDateInTimezone(new Date(), 'Asia/Tokyo');
    const currentWeek = weekRange(localDate);
    const progress =
      socialCapabilityStatus === 'ACTIVE'
        ? await new GetMissionProgress(
            new PrismaBunshinCapabilityAssignmentRepository(),
            engagementRepository,
          ).execute({
            workspaceId,
            actorUserId: currentUser.userId,
            bunshinId: bunshin.id,
            ...currentWeek,
          })
        : {
            ...currentWeek,
            weeklyGoal: 3,
            remainingConfirmations: 3,
            weekly: {
              confirmedDays: 0,
              preparedDays: 0,
              postedDays: 0,
              restedDays: 0,
              days: [],
            },
            cumulative: {
              confirmedDays: 0,
              preparedDays: 0,
              postedDays: 0,
              restedDays: 0,
              activeDays: 0,
            },
          };
    const missionDecisions = await Promise.all(
      dailyMissions.map((mission) =>
        new GetMissionDecision(engagementRepository).execute({
          workspaceId,
          actorUserId: currentUser.userId,
          bunshinId: bunshin.id,
          dailyMissionId: mission.id,
        }),
      ),
    );
    const outcomeRepository = new PrismaMissionOutcomeRepository();
    const missionOutcomes = await Promise.all(
      dailyMissions.map(async (mission) => ({
        post: await outcomeRepository.getPost({
          workspaceId,
          actorUserId: currentUser.userId,
          bunshinId: bunshin.id,
          dailyMissionId: mission.id,
        }),
        feedback: await outcomeRepository.getFeedback({
          workspaceId,
          actorUserId: currentUser.userId,
          bunshinId: bunshin.id,
          dailyMissionId: mission.id,
        }),
      })),
    );
    return (
      <>
        <p>
          <Link href={`/bunshins/${bunshin.id}/evidence?workspaceId=${workspaceId}`}>
            経験の根拠と広告の安全確認
          </Link>
          {' ／ '}
          <Link href={`/bunshins/${bunshin.id}/campaigns?workspaceId=${workspaceId}`}>
            参加できる募集
          </Link>
        </p>
        <BunshinEditor
          workspaceId={workspaceId}
          bunshin={bunshin}
          personalityVersions={personalityVersions.map(
            ({
              id,
              version,
              source,
              changeReason,
              tone,
              formality,
              energyLevel,
              expertiseLevel,
              sentenceStyle,
              firstPerson,
              forbiddenExpressions,
              preferredExpressions,
              visualDirection,
              facePolicy,
              createdAt,
            }) => ({
              id,
              version,
              source,
              changeReason,
              tone,
              formality,
              energyLevel,
              expertiseLevel,
              sentenceStyle,
              firstPerson,
              forbiddenExpressions,
              preferredExpressions,
              visualDirection,
              facePolicy,
              createdAt: createdAt.toISOString(),
            }),
          )}
          knowledge={owned.map(({ id, title, type }) => ({
            id,
            title,
            type,
            granted: granted.some((item) => item.id === id),
          }))}
          memories={memories.map(
            ({ id, type, content, summary, confidence, importance, active }) => ({
              id,
              type,
              content,
              summary,
              confidence,
              importance,
              active,
            }),
          )}
          socialCapabilityStatus={socialCapabilityStatus}
          socialProfiles={socialProfiles.map(
            ({
              id,
              platform,
              handle,
              profileUrl,
              purpose,
              postingFrequency,
              preferredFormats,
              defaultAssistanceLevel,
              status,
            }) => ({
              id,
              platform,
              handle,
              profileUrl,
              purpose,
              postingFrequency,
              preferredFormats,
              defaultAssistanceLevel,
              status,
            }),
          )}
          socialStrategies={socialStrategies.map(
            ({
              id,
              socialProfileId,
              platform,
              concept,
              positioning,
              targetSummary,
              version,
              status,
            }) => ({
              id,
              socialProfileId,
              platform,
              concept,
              positioning,
              targetSummary,
              version,
              status,
            }),
          )}
          contentPillars={contentPillars.map(({ id, title, description, weight, active }) => ({
            id,
            title,
            description,
            weight,
            active,
          }))}
          weeklyPlans={weeklyPlans.map(
            ({ id, weekStartDate, timezone, strategySummary, status, items }) => ({
              id,
              weekStartDate,
              timezone,
              strategySummary,
              status,
              items: items.map(
                ({
                  id: itemId,
                  scheduledDate,
                  contentPillarId,
                  goal,
                  angle,
                  recommendedFormat,
                  notes,
                  campaignId,
                  classification,
                }) => ({
                  id: itemId,
                  scheduledDate,
                  contentPillarId,
                  goal,
                  angle,
                  recommendedFormat,
                  notes,
                  campaignId,
                  classification,
                }),
              ),
            }),
          )}
          dailyMissions={dailyMissions.map(
            (
              {
                id,
                missionDate,
                status,
                format,
                assistanceLevel,
                estimatedMinutes,
                topic,
                angle,
                reason,
                campaignId,
                classification,
                qualityScore,
                content,
                socialProfileId,
                trendContext,
                linkUsage,
              },
              index,
            ) => ({
              id,
              missionDate,
              status,
              format,
              assistanceLevel,
              estimatedMinutes,
              topic,
              angle,
              reason,
              campaignId,
              classification,
              qualityScore,
              content,
              decision: missionDecisions[index]!.decision,
              rejectionReason: missionDecisions[index]!.rejectionReason,
              platform:
                socialProfiles.find((profile) => profile.id === socialProfileId)?.platform ?? null,
              postedAt: missionOutcomes[index]!.post?.postedAt.toISOString() ?? null,
              feedback: missionOutcomes[index]!.feedback?.rating ?? null,
              trendContext: trendContext
                ? {
                    whyNow: trendContext.snapshot.candidate.whyNow,
                    fitReason: trendContext.snapshot.candidate.fitReason,
                    researchedAt: trendContext.createdAt.toISOString(),
                    evidence: trendContext.snapshot.evidence.map(
                      ({ sourceUrl, sourceTitle, publishedAt, retrievedAt }) => ({
                        sourceUrl,
                        sourceTitle,
                        publishedAt,
                        retrievedAt,
                      }),
                    ),
                  }
                : null,
              externalLinkUsage: linkUsage
                ? {
                    ...linkUsage,
                    expiresAt: linkUsage.expiresAt?.toISOString() ?? null,
                  }
                : null,
            }),
          )}
          progress={progress}
          localDate={localDate}
          lineNotificationPreference={{
            enabled: lineNotificationPreference.enabled,
            consentGranted: lineNotificationPreference.notificationConsentAt !== null,
            localTime: lineNotificationPreference.localTime,
            timezone: lineNotificationPreference.timezone,
            frequency: lineNotificationPreference.frequency,
            quietHoursStart: lineNotificationPreference.quietHoursStart,
            quietHoursEnd: lineNotificationPreference.quietHoursEnd,
            pausedUntil: lineNotificationPreference.pausedUntil
              ? lineNotificationPreference.pausedUntil.toISOString()
              : null,
            reminderEnabled: lineNotificationPreference.reminderEnabled,
          }}
        />
      </>
    );
  } catch {
    notFound();
  }
}
