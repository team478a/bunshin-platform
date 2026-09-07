import type { OwnerKnowledgeType } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';

export const DAILY_ACTION_KINDS = [
  'PHOTO',
  'CUSTOMER_QUESTION',
  'VOICE_MEMO',
  'COMMENT_REPLY',
  'POST_IMPROVEMENT',
  'REST_REASON',
] as const;
export type DailyActionKind = (typeof DAILY_ACTION_KINDS)[number];

export interface DailyActionRecord {
  id: string;
  workspaceId: string;
  bunshinId: string;
  ownerUserId: string;
  ownerKnowledgeId: string;
  dailyMissionId: string | null;
  kind: DailyActionKind;
  title: string;
  content: string;
  assetStorageKey: string | null;
  assetMimeType: string | null;
  assetOriginalFilename: string | null;
  assetSizeBytes: number | null;
  assetPurgedAt: Date | null;
  idempotencyKey: string;
  createdAt: Date;
}

export interface DailyActionScope {
  workspaceId: string;
  bunshinId: string;
  actorUserId: string;
  groupId?: string;
}

export interface DailyActionRepository {
  find(input: DailyActionScope & { dailyActionId: string }): Promise<DailyActionRecord | null>;
  findByIdempotency(
    input: DailyActionScope & { idempotencyKey: string },
  ): Promise<DailyActionRecord | null>;
  list(input: DailyActionScope & { limit: number }): Promise<DailyActionRecord[] | null>;
  create(
    input: DailyActionScope & {
      dailyMissionId: string | null;
      kind: DailyActionKind;
      title: string;
      content: string;
      knowledgeType: OwnerKnowledgeType;
      assetStorageKey: string | null;
      assetMimeType: string | null;
      assetOriginalFilename: string | null;
      assetSizeBytes: number | null;
      idempotencyKey: string;
    },
  ): Promise<DailyActionRecord | null>;
}

const uuid = (value: string, field: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value))
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value;
};

const details: Record<DailyActionKind, { title: string; knowledgeType: OwnerKnowledgeType }> = {
  PHOTO: { title: '本人が撮影した写真', knowledgeType: 'ASSET' },
  CUSTOMER_QUESTION: { title: 'お客様から聞かれた質問', knowledgeType: 'FAQ' },
  VOICE_MEMO: { title: '本人の音声メモ', knowledgeType: 'ASSET' },
  COMMENT_REPLY: { title: 'コメントへの返信メモ', knowledgeType: 'FAQ' },
  POST_IMPROVEMENT: { title: '過去投稿の改善メモ', knowledgeType: 'EXPERIENCE' },
  REST_REASON: { title: '投稿を休んだ理由', knowledgeType: 'OTHER' },
};

function content(value: string) {
  const normalized = value.trim();
  if (normalized.length > 20_000)
    throw new ApplicationError('VALIDATION_ERROR', 'content is too long');
  return normalized;
}

function asset(input: {
  kind: DailyActionKind;
  content: string;
  assetStorageKey?: string | null;
  assetMimeType?: string | null;
  assetOriginalFilename?: string | null;
  assetSizeBytes?: number | null;
}) {
  const values = [
    input.assetStorageKey,
    input.assetMimeType,
    input.assetOriginalFilename,
    input.assetSizeBytes,
  ];
  const hasAsset = values.every((value) => value !== null && value !== undefined);
  const hasPartialAsset = values.some((value) => value !== null && value !== undefined);
  const needsAsset = input.kind === 'PHOTO' || input.kind === 'VOICE_MEMO';
  if (hasPartialAsset !== hasAsset || needsAsset !== hasAsset)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid daily action asset');
  if (!hasAsset) return null;
  const mimeType = input.assetMimeType!;
  if (
    (input.kind === 'PHOTO' && !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) ||
    (input.kind === 'VOICE_MEMO' &&
      !['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a'].includes(mimeType))
  )
    throw new ApplicationError('VALIDATION_ERROR', 'unsupported daily action asset');
  if (!Number.isInteger(input.assetSizeBytes) || input.assetSizeBytes! < 1)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid daily action asset size');
  return {
    storageKey: input.assetStorageKey!,
    mimeType,
    originalFilename: input.assetOriginalFilename!,
    sizeBytes: input.assetSizeBytes!,
  };
}

export class DailyActionService {
  constructor(private readonly repository: DailyActionRepository) {}

  async findByIdempotency(input: DailyActionScope & { idempotencyKey: string }) {
    return this.repository.findByIdempotency({
      ...input,
      idempotencyKey: uuid(input.idempotencyKey, 'idempotencyKey'),
    });
  }

  async find(input: DailyActionScope & { dailyActionId: string }) {
    const row = await this.repository.find({
      ...input,
      dailyActionId: uuid(input.dailyActionId, 'dailyActionId'),
    });
    if (!row) throw new ApplicationError('NOT_FOUND', 'daily action unavailable');
    return row;
  }

  async list(input: DailyActionScope & { limit?: number }) {
    const limit = input.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid limit');
    const rows = await this.repository.list({ ...input, limit });
    if (rows === null) throw new ApplicationError('NOT_FOUND', 'bunshin unavailable');
    return rows;
  }

  async create(
    input: DailyActionScope & {
      dailyMissionId?: string | null;
      kind: DailyActionKind;
      content: string;
      assetStorageKey?: string | null;
      assetMimeType?: string | null;
      assetOriginalFilename?: string | null;
      assetSizeBytes?: number | null;
      idempotencyKey: string;
    },
  ) {
    const normalizedContent = content(input.content);
    const uploaded = asset({ ...input, content: normalizedContent });
    if (!uploaded && !normalizedContent)
      throw new ApplicationError('VALIDATION_ERROR', 'content is required');
    const definition = details[input.kind];
    const knowledgeContent = uploaded
      ? `${definition.title}「${uploaded.originalFilename}」${normalizedContent ? `\nメモ: ${normalizedContent}` : ''}`
      : normalizedContent;
    const row = await this.repository.create({
      ...input,
      dailyMissionId: input.dailyMissionId ? uuid(input.dailyMissionId, 'dailyMissionId') : null,
      idempotencyKey: uuid(input.idempotencyKey, 'idempotencyKey'),
      title: definition.title,
      content: knowledgeContent,
      knowledgeType: definition.knowledgeType,
      assetStorageKey: uploaded?.storageKey ?? null,
      assetMimeType: uploaded?.mimeType ?? null,
      assetOriginalFilename: uploaded?.originalFilename ?? null,
      assetSizeBytes: uploaded?.sizeBytes ?? null,
    });
    if (!row) throw new ApplicationError('NOT_FOUND', 'daily action target unavailable');
    return row;
  }
}
