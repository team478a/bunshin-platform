import 'server-only';
import {
  GroupKnowledgeService,
  selectGroupKnowledgeChunksForPrompt,
  type CampaignPlanningContext,
} from '@bunshin/application';
import type { MissionContentGeneratorInput } from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';

interface DailyMissionScope {
  workspaceId: string;
  groupId?: string | null;
  bunshinId: string;
  actorUserId: string;
}

export async function loadDailyMissionGenerationEnvironment(input: {
  scope: DailyMissionScope;
  timezone?: string;
  campaign: CampaignPlanningContext | null;
  fallbackGroupKnowledge: NonNullable<MissionContentGeneratorInput['groupKnowledge']>;
}) {
  const db = await import('@bunshin/database');
  let timezone = input.timezone;
  if (!timezone) {
    const preference = await new db.PrismaLineNotificationPreferenceRepository().getScoped(
      input.scope,
    );
    if (!preference.accessible)
      throw new ApplicationError('NOT_FOUND', 'notification preference scope not found');
    timezone = preference.preference?.timezone ?? 'Asia/Tokyo';
  }

  const groupKnowledge = input.campaign
    ? selectGroupKnowledgeChunksForPrompt(
        await new GroupKnowledgeService(
          new db.PrismaGroupKnowledgeRepository(),
        ).listApprovedChunksForGeneration({
          ...input.scope,
          groupId: input.campaign.productPack.groupId,
          productPackVersionId: input.campaign.productPack.versionId,
        }),
      ).map((chunk) => ({
        chunkId: chunk.id,
        sourceId: chunk.sourceId,
        type: chunk.type,
        sourceLabel: chunk.sourceLabel,
        content: chunk.content.trim(),
      }))
    : input.fallbackGroupKnowledge;

  return { timezone, groupKnowledge };
}
