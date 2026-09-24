import 'server-only';
import {
  EnqueueJob,
  GROUP_KNOWLEDGE_EXTRACTION_JOB_TYPE,
  GroupKnowledgeService,
} from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';

export const uuid = z.string().uuid();
const common = {
  title: z.string().trim().min(1).max(200),
  productPackVersionId: z.uuid().nullable().optional(),
};
export const createSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('URL'), ...common, sourceUri: z.url().max(2048) }).strict(),
  z
    .object({ type: z.literal('TEXT'), ...common, content: z.string().trim().min(1).max(8000) })
    .strict(),
  z
    .object({
      type: z.enum(['PDF', 'VIDEO']),
      ...common,
      originalFileName: z.string().trim().min(1).max(255),
      mimeType: z.enum(['application/pdf', 'video/mp4', 'video/quicktime']),
      sizeBytes: z.number().int().positive().max(200_000_000),
      rightsConfirmed: z.literal(true),
    })
    .strict(),
]);

export const completeSchema = z
  .object({ sizeBytes: z.number().int().positive().max(200_000_000) })
  .strict();
export const updateScopeSchema = z.object({ productPackVersionId: z.uuid().nullable() }).strict();
export const updateReviewSchema = z
  .object({
    chunks: z
      .array(z.object({ id: z.uuid(), content: z.string().trim().min(1).max(8000) }).strict())
      .min(1)
      .max(2000),
  })
  .strict();

export function publicSource(source: {
  id: string;
  type: string;
  title: string;
  sourceUri: string | null;
  originalFileName: string | null;
  mimeType: string | null;
  productPackVersionId: string | null;
  status: string;
  version: number;
  failureCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: source.id,
    type: source.type,
    title: source.title,
    sourceUri: source.sourceUri,
    originalFileName: source.originalFileName,
    mimeType: source.mimeType,
    productPackVersionId: source.productPackVersionId,
    status: source.status,
    version: source.version,
    failureCode: source.failureCode,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

export async function dependencies() {
  const db = await import('@bunshin/database');
  const repository = new db.PrismaGroupKnowledgeRepository();
  return { repository, service: new GroupKnowledgeService(repository) };
}

export async function actor() {
  const value = await (await currentUserProvider()).getCurrentUser();
  if (!value) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return value;
}

export async function enqueueExtraction(input: {
  workspaceId: string;
  groupId: string;
  sourceId: string;
  actorUserId: string;
  correlationId: string;
  idempotencySuffix?: string;
}) {
  const db = await import('@bunshin/database');
  const environment = getServerEnvironment().APP_ENV.toUpperCase() as
    'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
  await new EnqueueJob(new db.PrismaJobRepository()).enqueue({
    workspaceId: input.workspaceId,
    correlationId: input.correlationId,
    requestedBy: input.actorUserId,
    environment,
    jobType: GROUP_KNOWLEDGE_EXTRACTION_JOB_TYPE,
    idempotencyKey: `group-knowledge:${input.sourceId}:${input.idempotencySuffix ?? 'v1'}`,
    payloadReference: `group-knowledge:${input.groupId}:${input.sourceId}:${input.actorUserId}`,
    maxAttempts: 3,
  });
}
