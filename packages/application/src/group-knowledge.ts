import { ApplicationError } from '@bunshin/shared';

export const GROUP_KNOWLEDGE_SOURCE_TYPES = ['PDF', 'VIDEO', 'URL', 'TEXT'] as const;
export type GroupKnowledgeSourceType = (typeof GROUP_KNOWLEDGE_SOURCE_TYPES)[number];
export type GroupKnowledgeSourceStatus =
  'DRAFT' | 'PROCESSING' | 'REVIEW_REQUIRED' | 'ACTIVE' | 'FAILED' | 'ARCHIVED';
export type GroupKnowledgeChunkType = 'GENERAL' | 'FACT' | 'FAQ' | 'RULE';

export interface GroupKnowledgeScope {
  workspaceId: string;
  groupId: string;
  actorUserId: string;
}

export interface GroupKnowledgeSourceRecord {
  id: string;
  workspaceId: string;
  groupId: string;
  productPackVersionId: string | null;
  logicalKey: string;
  version: number;
  type: GroupKnowledgeSourceType;
  title: string;
  sourceUri: string | null;
  storageKey: string | null;
  originalFileName: string | null;
  mimeType: string | null;
  contentHash: string | null;
  status: GroupKnowledgeSourceStatus;
  failureCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupKnowledgeChunkRecord {
  id: string;
  sourceId: string;
  sortOrder: number;
  type: GroupKnowledgeChunkType;
  content: string;
  sourceLabel: string;
  pageNumber: number | null;
  startSeconds: number | null;
  endSeconds: number | null;
  confidence: number | null;
}

export interface GroupKnowledgeRepository {
  createSource(
    input: GroupKnowledgeScope & {
      logicalKey: string;
      type: GroupKnowledgeSourceType;
      title: string;
      sourceUri: string | null;
      storageKey: string | null;
      originalFileName: string | null;
      mimeType: string | null;
      contentHash: string | null;
      productPackVersionId: string | null;
    },
  ): Promise<GroupKnowledgeSourceRecord | null>;
  beginProcessing(input: GroupKnowledgeScope & { sourceId: string }): Promise<boolean>;
  replaceExtractedChunks(
    input: GroupKnowledgeScope & {
      sourceId: string;
      chunks: Omit<GroupKnowledgeChunkRecord, 'id' | 'sourceId'>[];
    },
  ): Promise<boolean>;
  markFailed(
    input: GroupKnowledgeScope & { sourceId: string; failureCode: string },
  ): Promise<boolean>;
  approve(input: GroupKnowledgeScope & { sourceId: string; approvedAt: Date }): Promise<boolean>;
  archive(input: GroupKnowledgeScope & { sourceId: string; archivedAt: Date }): Promise<boolean>;
  listForManagement(input: GroupKnowledgeScope): Promise<GroupKnowledgeSourceRecord[] | null>;
  listApprovedChunksForGeneration(
    input: GroupKnowledgeScope & {
      productPackVersionId?: string | null;
    },
  ): Promise<GroupKnowledgeChunkRecord[] | null>;
}

export function selectGroupKnowledgeChunksForPrompt(
  values: GroupKnowledgeChunkRecord[],
  maximumItems = 20,
  maximumCharacters = 12_000,
) {
  if (!Number.isInteger(maximumItems) || maximumItems < 1 || maximumCharacters < 1)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid group knowledge prompt limit');
  const selected: GroupKnowledgeChunkRecord[] = [];
  let characters = 0;
  for (const chunk of values) {
    const length = chunk.content.trim().length;
    if (length === 0 || characters + length > maximumCharacters) continue;
    selected.push(chunk);
    characters += length;
    if (selected.length >= maximumItems) break;
  }
  return selected;
}

const requiredText = (value: string, field: string, max: number) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

const optionalText = (value: string | null | undefined, field: string, max: number) => {
  if (value === null || value === undefined || value.trim() === '') return null;
  return requiredText(value, field, max);
};

const safeHttpsUrl = (value: string | null | undefined) => {
  const normalized = optionalText(value, 'sourceUri', 2048);
  if (normalized === null) return null;
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid sourceUri');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    throw new ApplicationError('VALIDATION_ERROR', 'unsafe sourceUri');
  return url.toString();
};

const sha256 = (value: string | null | undefined) => {
  const normalized = optionalText(value, 'contentHash', 64);
  if (normalized !== null && !/^[a-f0-9]{64}$/u.test(normalized))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid contentHash');
  return normalized;
};

export class GroupKnowledgeService {
  constructor(private readonly repository: GroupKnowledgeRepository) {}

  async createSource(
    input: GroupKnowledgeScope & {
      logicalKey?: string;
      type: GroupKnowledgeSourceType;
      title: string;
      sourceUri?: string | null;
      storageKey?: string | null;
      originalFileName?: string | null;
      mimeType?: string | null;
      contentHash?: string | null;
      productPackVersionId?: string | null;
    },
  ) {
    if (!GROUP_KNOWLEDGE_SOURCE_TYPES.includes(input.type))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid source type');
    const sourceUri = safeHttpsUrl(input.sourceUri);
    const storageKey = optionalText(input.storageKey, 'storageKey', 1000);
    if (input.type === 'URL' && sourceUri === null)
      throw new ApplicationError('VALIDATION_ERROR', 'sourceUri required');
    if (['PDF', 'VIDEO'].includes(input.type) && sourceUri === null && storageKey === null)
      throw new ApplicationError('VALIDATION_ERROR', 'file source required');
    const title = requiredText(input.title, 'title', 200);
    const logicalKey =
      optionalText(input.logicalKey, 'logicalKey', 100) ??
      `${input.type.toLowerCase()}-${title.normalize('NFKC').replace(/\s+/gu, '-').slice(0, 80)}`;
    const value = await this.repository.createSource({
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      actorUserId: input.actorUserId,
      logicalKey,
      type: input.type,
      title,
      sourceUri,
      storageKey,
      originalFileName: optionalText(input.originalFileName, 'originalFileName', 255),
      mimeType: optionalText(input.mimeType, 'mimeType', 120),
      contentHash: sha256(input.contentHash),
      productPackVersionId: input.productPackVersionId ?? null,
    });
    if (value === null)
      throw new ApplicationError('FORBIDDEN', 'group knowledge management denied');
    return value;
  }

  async beginProcessing(input: GroupKnowledgeScope & { sourceId: string }) {
    if (!(await this.repository.beginProcessing(input)))
      throw new ApplicationError('CONFLICT', 'knowledge source is not ready for processing');
  }

  async saveExtraction(
    input: GroupKnowledgeScope & {
      sourceId: string;
      chunks: Array<{
        type?: GroupKnowledgeChunkType;
        content: string;
        sourceLabel: string;
        pageNumber?: number | null;
        startSeconds?: number | null;
        endSeconds?: number | null;
        confidence?: number | null;
      }>;
    },
  ) {
    if (input.chunks.length === 0 || input.chunks.length > 2000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid chunks');
    const chunks = input.chunks.map((chunk, sortOrder) => {
      const startSeconds = chunk.startSeconds ?? null;
      const endSeconds = chunk.endSeconds ?? null;
      if (chunk.pageNumber !== undefined && chunk.pageNumber !== null && chunk.pageNumber < 1)
        throw new ApplicationError('VALIDATION_ERROR', 'invalid pageNumber');
      if (
        startSeconds !== null &&
        (startSeconds < 0 || (endSeconds !== null && endSeconds < startSeconds))
      )
        throw new ApplicationError('VALIDATION_ERROR', 'invalid video timestamp');
      if (
        chunk.confidence !== undefined &&
        chunk.confidence !== null &&
        (chunk.confidence < 0 || chunk.confidence > 1)
      )
        throw new ApplicationError('VALIDATION_ERROR', 'invalid confidence');
      return {
        sortOrder,
        type: chunk.type ?? 'GENERAL',
        content: requiredText(chunk.content, 'chunk content', 8000),
        sourceLabel: requiredText(chunk.sourceLabel, 'sourceLabel', 300),
        pageNumber: chunk.pageNumber ?? null,
        startSeconds,
        endSeconds,
        confidence: chunk.confidence ?? null,
      };
    });
    if (!(await this.repository.replaceExtractedChunks({ ...input, chunks })))
      throw new ApplicationError('CONFLICT', 'knowledge extraction cannot be saved');
  }

  async markFailed(input: GroupKnowledgeScope & { sourceId: string; failureCode: string }) {
    if (
      !(await this.repository.markFailed({
        ...input,
        failureCode: requiredText(input.failureCode, 'failureCode', 100),
      }))
    )
      throw new ApplicationError('NOT_FOUND', 'knowledge source unavailable');
  }

  async approve(input: GroupKnowledgeScope & { sourceId: string }) {
    if (!(await this.repository.approve({ ...input, approvedAt: new Date() })))
      throw new ApplicationError('CONFLICT', 'knowledge source is not ready for approval');
  }

  async archive(input: GroupKnowledgeScope & { sourceId: string }) {
    if (!(await this.repository.archive({ ...input, archivedAt: new Date() })))
      throw new ApplicationError('NOT_FOUND', 'knowledge source unavailable');
  }

  async listForManagement(input: GroupKnowledgeScope) {
    const values = await this.repository.listForManagement(input);
    if (values === null)
      throw new ApplicationError('FORBIDDEN', 'group knowledge management denied');
    return values;
  }

  async listApprovedChunksForGeneration(
    input: GroupKnowledgeScope & {
      productPackVersionId?: string | null;
    },
  ) {
    const values = await this.repository.listApprovedChunksForGeneration(input);
    if (values === null) throw new ApplicationError('FORBIDDEN', 'group knowledge access denied');
    return values;
  }
}
