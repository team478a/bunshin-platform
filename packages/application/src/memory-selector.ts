import type { BunshinMemory, BunshinMemoryType } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import type { BunshinMemoryRepository } from './index';

export interface SelectedBunshinMemory {
  id: string;
  type: BunshinMemoryType;
  summary: string;
  content: string;
  selectionReason: string;
}

const compact = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase('ja-JP')
    .replace(/[\p{P}\p{S}\s]/gu, '');

const tokens = (value: string) => {
  const normalized = compact(value);
  const values = new Set<string>();
  for (const word of value
    .normalize('NFKC')
    .toLocaleLowerCase('ja-JP')
    .match(/[a-z0-9]{2,}/g) ?? [])
    values.add(word);
  for (let index = 0; index < normalized.length - 1; index += 1)
    values.add(normalized.slice(index, index + 2));
  return values;
};

const relevance = (memory: BunshinMemory, queryTokens: Set<string>) => {
  let overlap = 0;
  for (const token of tokens(`${memory.summary ?? ''}\n${memory.content}`))
    if (queryTokens.has(token)) overlap += 1;
  return overlap;
};

export class SelectBunshinMemories {
  constructor(private readonly repository: BunshinMemoryRepository) {}

  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    query: string;
    maxItems?: number;
    maxCharacters?: number;
  }): Promise<SelectedBunshinMemory[]> {
    const query = input.query.trim();
    if (!query) throw new ApplicationError('VALIDATION_ERROR', 'memory query is required');
    const maxItems = input.maxItems ?? 5;
    const maxCharacters = input.maxCharacters ?? 3000;
    if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 10)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid memory item limit');
    if (!Number.isInteger(maxCharacters) || maxCharacters < 500 || maxCharacters > 10000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid memory character budget');

    const queryTokens = tokens(query);
    const candidates = (
      await this.repository.list({
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        bunshinId: input.bunshinId,
      })
    )
      .filter(
        (memory) =>
          memory.workspaceId === input.workspaceId &&
          memory.bunshinId === input.bunshinId &&
          memory.active &&
          memory.deletedAt === null,
      )
      .map((memory) => ({ memory, relevance: relevance(memory, queryTokens) }))
      .filter(({ relevance: score }) => score > 0)
      .sort(
        (left, right) =>
          right.relevance - left.relevance ||
          right.memory.importance - left.memory.importance ||
          right.memory.confidence - left.memory.confidence ||
          right.memory.updatedAt.getTime() - left.memory.updatedAt.getTime(),
      );

    const selected: SelectedBunshinMemory[] = [];
    let usedCharacters = 0;
    for (const { memory, relevance: score } of candidates) {
      if (selected.length >= maxItems) break;
      const summary = memory.summary?.trim() || memory.content.slice(0, 200);
      const characters = summary.length + memory.content.length;
      if (usedCharacters + characters > maxCharacters) continue;
      selected.push({
        id: memory.id,
        type: memory.type,
        summary,
        content: memory.content,
        selectionReason: `Missionとの関連語 ${score}件・重要度 ${memory.importance}/5`,
      });
      usedCharacters += characters;
    }
    return selected;
  }
}
