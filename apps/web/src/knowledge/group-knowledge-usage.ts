export interface GroupKnowledgeUsageSnapshot {
  payload: unknown;
  generatedAt: Date;
}

export interface GroupKnowledgeChunkSource {
  id: string;
  sourceId: string;
}

export interface GroupKnowledgeUsageSummary {
  sourceId: string;
  generationCount: number;
  lastUsedAt: Date;
}

function referencedChunkIds(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const groupKnowledge = (payload as { groupKnowledge?: unknown }).groupKnowledge;
  if (!Array.isArray(groupKnowledge)) return [];
  return groupKnowledge.flatMap((reference) => {
    if (!reference || typeof reference !== 'object' || Array.isArray(reference)) return [];
    const id = (reference as { id?: unknown }).id;
    return typeof id === 'string' && id.length > 0 ? [id] : [];
  });
}

export function summarizeGroupKnowledgeUsage(
  snapshots: GroupKnowledgeUsageSnapshot[],
  chunks: GroupKnowledgeChunkSource[],
) {
  const sourceByChunk = new Map(chunks.map((chunk) => [chunk.id, chunk.sourceId]));
  const summaries = new Map<string, GroupKnowledgeUsageSummary>();

  for (const snapshot of snapshots) {
    const sourceIds = new Set(
      referencedChunkIds(snapshot.payload).flatMap((chunkId) => {
        const sourceId = sourceByChunk.get(chunkId);
        return sourceId ? [sourceId] : [];
      }),
    );
    for (const sourceId of sourceIds) {
      const current = summaries.get(sourceId);
      summaries.set(sourceId, {
        sourceId,
        generationCount: (current?.generationCount ?? 0) + 1,
        lastUsedAt:
          !current || snapshot.generatedAt > current.lastUsedAt
            ? snapshot.generatedAt
            : current.lastUsedAt,
      });
    }
  }

  return [...summaries.values()];
}
