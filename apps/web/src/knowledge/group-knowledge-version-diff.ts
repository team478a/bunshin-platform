export interface KnowledgeVersionChunk {
  id: string;
  content: string;
}

export type KnowledgeVersionDiffStatus = 'UNCHANGED' | 'CHANGED' | 'ADDED' | 'REMOVED';

export interface KnowledgeVersionDiffRow {
  index: number;
  status: KnowledgeVersionDiffStatus;
  previous: KnowledgeVersionChunk | null;
  current: KnowledgeVersionChunk | null;
}

const normalized = (value: string) => value.trim().replace(/\s+/gu, ' ');

export function compareGroupKnowledgeVersions(
  previous: KnowledgeVersionChunk[],
  current: KnowledgeVersionChunk[],
) {
  const length = Math.max(previous.length, current.length);
  return Array.from({ length }, (_, index): KnowledgeVersionDiffRow => {
    const before = previous[index] ?? null;
    const after = current[index] ?? null;
    const status: KnowledgeVersionDiffStatus = !before
      ? 'ADDED'
      : !after
        ? 'REMOVED'
        : normalized(before.content) === normalized(after.content)
          ? 'UNCHANGED'
          : 'CHANGED';
    return { index, status, previous: before, current: after };
  });
}
