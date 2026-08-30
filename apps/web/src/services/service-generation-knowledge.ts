import 'server-only';
import {
  GroupKnowledgeService,
  selectGroupKnowledgeChunksForPrompt,
  type GroupKnowledgeChunkRecord,
} from '@bunshin/application';

export interface ServiceGenerationKnowledgeScope {
  workspaceId: string;
  groupId: string;
  actorUserId: string;
}

export function serviceKnowledgeForPrompt(chunks: GroupKnowledgeChunkRecord[]) {
  const selected = selectGroupKnowledgeChunksForPrompt(chunks);
  return {
    officialKnowledge: selected.map((chunk) => ({
      type: `SERVICE_${chunk.type}`,
      title: chunk.sourceLabel,
      content: chunk.content.trim(),
    })),
    groupKnowledge: selected.map((chunk) => ({
      chunkId: chunk.id,
      sourceId: chunk.sourceId,
      type: chunk.type,
      sourceLabel: chunk.sourceLabel,
      content: chunk.content.trim(),
    })),
  };
}

export async function loadServiceGenerationKnowledge(scope: ServiceGenerationKnowledgeScope) {
  const db = await import('@bunshin/database');
  const chunks = await new GroupKnowledgeService(
    new db.PrismaGroupKnowledgeRepository(),
  ).listApprovedChunksForGeneration({
    ...scope,
    productPackVersionId: null,
  });
  return serviceKnowledgeForPrompt(chunks);
}
