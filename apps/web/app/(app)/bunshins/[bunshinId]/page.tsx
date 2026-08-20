import {
  GetBunshin,
  ListBunshinCapabilityAssignments,
  ListBunshinMemories,
} from '@bunshin/application';
import { notFound, redirect } from 'next/navigation';
import {
  ListContentPillars,
  ListSocialProfiles,
  ListSocialAccountStrategies,
  ListWeeklyPlans,
  ListDailyMissions,
} from '@bunshin/capability-social';
import { currentUserProvider } from '../../../../src/auth/current-user';
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
    } = await import('@bunshin/database');
    const bunshin = await new GetBunshin(new PrismaBunshinRepository()).execute({
      workspaceId,
      bunshinId: (await params).bunshinId,
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
    return (
      <BunshinEditor
        workspaceId={workspaceId}
        bunshin={bunshin}
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
        socialCapabilityStatus={
          capabilities.find(({ capabilityType }) => capabilityType === 'SOCIAL')?.status ?? null
        }
        socialProfiles={socialProfiles.map(
          ({
            id,
            platform,
            handle,
            profileUrl,
            purpose,
            postingFrequency,
            preferredFormats,
            status,
          }) => ({
            id,
            platform,
            handle,
            profileUrl,
            purpose,
            postingFrequency,
            preferredFormats,
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
              }) => ({
                id: itemId,
                scheduledDate,
                contentPillarId,
                goal,
                angle,
                recommendedFormat,
                notes,
              }),
            ),
          }),
        )}
        dailyMissions={dailyMissions.map(
          ({
            id,
            missionDate,
            status,
            format,
            estimatedMinutes,
            topic,
            angle,
            reason,
            qualityScore,
            content,
          }) => ({
            id,
            missionDate,
            status,
            format,
            estimatedMinutes,
            topic,
            angle,
            reason,
            qualityScore,
            content,
          }),
        )}
      />
    );
  } catch {
    notFound();
  }
}
