import type {
  GroupKnowledgeChunkRecord,
  GroupKnowledgeRepository,
  GroupKnowledgeScope,
  GroupKnowledgeSourceRecord,
} from '@bunshin/application';
import { Prisma, type PrismaClient, prisma } from './client';

function groupKnowledgeSource(
  row: Prisma.GroupKnowledgeSourceGetPayload<object>,
): GroupKnowledgeSourceRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    groupId: row.groupId,
    productPackVersionId: row.productPackVersionId,
    logicalKey: row.logicalKey,
    version: row.version,
    type: row.type,
    title: row.title,
    sourceUri: row.sourceUri,
    storageKey: row.storageKey,
    originalFileName: row.originalFileName,
    mimeType: row.mimeType,
    contentHash: row.contentHash,
    status: row.status,
    failureCode: row.failureCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function groupKnowledgeChunk(
  row: Prisma.GroupKnowledgeChunkGetPayload<object>,
): GroupKnowledgeChunkRecord {
  return {
    id: row.id,
    sourceId: row.sourceId,
    sortOrder: row.sortOrder,
    type: row.type,
    content: row.content,
    sourceLabel: row.sourceLabel,
    pageNumber: row.pageNumber,
    startSeconds: row.startSeconds,
    endSeconds: row.endSeconds,
    confidence: row.confidence === null ? null : row.confidence.toNumber(),
  };
}

export class PrismaGroupKnowledgeRepository implements GroupKnowledgeRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async canManage(input: GroupKnowledgeScope) {
    const [workspaceManager, groupManager] = await Promise.all([
      this.client.workspaceMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          userId: input.actorUserId,
          status: 'ACTIVE',
          role: { in: ['OWNER', 'ADMIN'] },
          workspace: { type: 'ORGANIZATION', status: 'ACTIVE' },
        },
        select: { id: true },
      }),
      this.client.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          OR: [
            { role: 'MANAGER' },
            {
              serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN', 'CONTENT_EDITOR'] },
              group: { serviceConfiguration: { isNot: null } },
            },
          ],
          status: 'ACTIVE',
          consentedAt: { not: null },
          group: { status: 'ACTIVE' },
        },
        select: { id: true },
      }),
    ]);
    return workspaceManager !== null || groupManager !== null;
  }

  private canUse(input: GroupKnowledgeScope) {
    return this.client.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        consentedAt: { not: null },
        group: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
  }

  async createSource(input: Parameters<GroupKnowledgeRepository['createSource']>[0]) {
    if (!(await this.canManage(input))) return null;
    return this.client.$transaction(
      async (tx) => {
        const group = await tx.group.findFirst({
          where: { id: input.groupId, workspaceId: input.workspaceId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!group) return null;
        if (input.productPackVersionId) {
          const version = await tx.productPackVersion.findFirst({
            where: {
              id: input.productPackVersionId,
              productPack: { workspaceId: input.workspaceId, groupId: input.groupId },
            },
            select: { id: true },
          });
          if (!version) return null;
        }
        const latest = await tx.groupKnowledgeSource.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            logicalKey: input.logicalKey,
          },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const row = await tx.groupKnowledgeSource.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            productPackVersionId: input.productPackVersionId,
            logicalKey: input.logicalKey,
            version: (latest?.version ?? 0) + 1,
            type: input.type,
            title: input.title,
            sourceUri: input.sourceUri,
            storageKey: input.storageKey,
            originalFileName: input.originalFileName,
            mimeType: input.mimeType,
            contentHash: input.contentHash,
            createdByUserId: input.actorUserId,
          },
        });
        await tx.groupKnowledgeAuditLog.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            sourceId: row.id,
            actorUserId: input.actorUserId,
            action: 'CREATED',
            details: { type: input.type, version: row.version },
          },
        });
        return groupKnowledgeSource(row);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async beginProcessing(input: Parameters<GroupKnowledgeRepository['beginProcessing']>[0]) {
    if (!(await this.canManage(input))) return false;
    return this.client.$transaction(async (tx) => {
      const updated = await tx.groupKnowledgeSource.updateMany({
        where: {
          id: input.sourceId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: { in: ['DRAFT', 'FAILED', 'REVIEW_REQUIRED'] },
        },
        data: { status: 'PROCESSING', failureCode: null },
      });
      if (updated.count !== 1) return false;
      await tx.groupKnowledgeAuditLog.create({
        data: { ...input, actorUserId: input.actorUserId, action: 'PROCESSING_STARTED' },
      });
      return true;
    });
  }

  async replaceExtractedChunks(
    input: Parameters<GroupKnowledgeRepository['replaceExtractedChunks']>[0],
  ) {
    if (!(await this.canManage(input))) return false;
    return this.client.$transaction(async (tx) => {
      const source = await tx.groupKnowledgeSource.findFirst({
        where: {
          id: input.sourceId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'PROCESSING',
        },
        select: { id: true },
      });
      if (!source) return false;
      await tx.groupKnowledgeChunk.deleteMany({ where: { sourceId: source.id } });
      await tx.groupKnowledgeChunk.createMany({
        data: input.chunks.map((chunk) => ({ ...chunk, sourceId: source.id })),
      });
      await tx.groupKnowledgeSource.update({
        where: { id: source.id },
        data: { status: 'REVIEW_REQUIRED', failureCode: null },
      });
      await tx.groupKnowledgeAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          sourceId: source.id,
          actorUserId: input.actorUserId,
          action: 'EXTRACTION_SAVED',
          details: { chunkCount: input.chunks.length },
        },
      });
      return true;
    });
  }

  async markFailed(input: Parameters<GroupKnowledgeRepository['markFailed']>[0]) {
    if (!(await this.canManage(input))) return false;
    return this.client.$transaction(async (tx) => {
      const updated = await tx.groupKnowledgeSource.updateMany({
        where: {
          id: input.sourceId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'PROCESSING',
        },
        data: { status: 'FAILED', failureCode: input.failureCode },
      });
      if (updated.count !== 1) return false;
      await tx.groupKnowledgeAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          sourceId: input.sourceId,
          actorUserId: input.actorUserId,
          action: 'FAILED',
          details: { failureCode: input.failureCode },
        },
      });
      return true;
    });
  }

  async approve(input: Parameters<GroupKnowledgeRepository['approve']>[0]) {
    if (!(await this.canManage(input))) return false;
    return this.client.$transaction(async (tx) => {
      const source = await tx.groupKnowledgeSource.findFirst({
        where: {
          id: input.sourceId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'REVIEW_REQUIRED',
          chunks: { some: {} },
        },
        select: { id: true, logicalKey: true, version: true },
      });
      if (!source) return false;
      await tx.groupKnowledgeSource.updateMany({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          logicalKey: source.logicalKey,
          status: 'ACTIVE',
          version: { lt: source.version },
        },
        data: { status: 'ARCHIVED', archivedAt: input.approvedAt },
      });
      await tx.groupKnowledgeSource.update({
        where: { id: source.id },
        data: {
          status: 'ACTIVE',
          approvedByUserId: input.actorUserId,
          approvedAt: input.approvedAt,
        },
      });
      await tx.groupKnowledgeAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          sourceId: source.id,
          actorUserId: input.actorUserId,
          action: 'APPROVED',
        },
      });
      return true;
    });
  }

  async archive(input: Parameters<GroupKnowledgeRepository['archive']>[0]) {
    if (!(await this.canManage(input))) return false;
    return this.client.$transaction(async (tx) => {
      const updated = await tx.groupKnowledgeSource.updateMany({
        where: {
          id: input.sourceId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: { not: 'ARCHIVED' },
        },
        data: { status: 'ARCHIVED', archivedAt: input.archivedAt },
      });
      if (updated.count !== 1) return false;
      await tx.groupKnowledgeAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          sourceId: input.sourceId,
          actorUserId: input.actorUserId,
          action: 'ARCHIVED',
        },
      });
      return true;
    });
  }

  async updateProductScope(input: Parameters<GroupKnowledgeRepository['updateProductScope']>[0]) {
    if (!(await this.canManage(input))) return null;
    return this.client.$transaction(async (tx) => {
      if (input.productPackVersionId) {
        const version = await tx.productPackVersion.findFirst({
          where: {
            id: input.productPackVersionId,
            status: 'PUBLISHED',
            productPack: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              status: 'ACTIVE',
            },
          },
          select: { id: true },
        });
        if (!version) return null;
      }
      const source = await tx.groupKnowledgeSource.findFirst({
        where: {
          id: input.sourceId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: { not: 'ARCHIVED' },
        },
      });
      if (!source) return null;
      const updated = await tx.groupKnowledgeSource.update({
        where: { id: source.id },
        data: { productPackVersionId: input.productPackVersionId },
      });
      await tx.groupKnowledgeAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          sourceId: source.id,
          actorUserId: input.actorUserId,
          action: 'PRODUCT_SCOPE_UPDATED',
          details: {
            beforeProductPackVersionId: source.productPackVersionId,
            afterProductPackVersionId: input.productPackVersionId,
          },
        },
      });
      return groupKnowledgeSource(updated);
    });
  }

  async updateReviewChunkContents(
    input: Parameters<GroupKnowledgeRepository['updateReviewChunkContents']>[0],
  ) {
    if (!(await this.canManage(input))) return false;
    return this.client.$transaction(async (tx) => {
      const source = await tx.groupKnowledgeSource.findFirst({
        where: {
          id: input.sourceId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'REVIEW_REQUIRED',
        },
        select: { id: true, chunks: { select: { id: true } } },
      });
      if (!source) return false;
      const storedIds = new Set(source.chunks.map((chunk) => chunk.id));
      if (
        storedIds.size !== input.chunks.length ||
        input.chunks.some((chunk) => !storedIds.has(chunk.id))
      )
        return false;
      for (const chunk of input.chunks) {
        await tx.groupKnowledgeChunk.update({
          where: { id: chunk.id },
          data: { content: chunk.content },
        });
      }
      await tx.groupKnowledgeAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          sourceId: source.id,
          actorUserId: input.actorUserId,
          action: 'REVIEW_EDITED',
          details: { chunkCount: input.chunks.length },
        },
      });
      return true;
    });
  }

  async listForManagement(input: Parameters<GroupKnowledgeRepository['listForManagement']>[0]) {
    if (!(await this.canManage(input))) return null;
    const rows = await this.client.groupKnowledgeSource.findMany({
      where: { workspaceId: input.workspaceId, groupId: input.groupId },
      orderBy: [{ updatedAt: 'desc' }, { version: 'desc' }],
    });
    return rows.map(groupKnowledgeSource);
  }

  async listApprovedChunksForGeneration(
    input: Parameters<GroupKnowledgeRepository['listApprovedChunksForGeneration']>[0],
  ) {
    if (!(await this.canUse(input))) return null;
    const commonWhere = {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      status: 'ACTIVE' as const,
    };
    const productRows = input.productPackVersionId
      ? await this.client.groupKnowledgeChunk.findMany({
          where: {
            source: { ...commonWhere, productPackVersionId: input.productPackVersionId },
          },
          orderBy: [{ source: { updatedAt: 'desc' } }, { sortOrder: 'asc' }],
          take: 20,
        })
      : [];
    const remaining = 20 - productRows.length;
    const commonRows =
      remaining > 0
        ? await this.client.groupKnowledgeChunk.findMany({
            where: { source: { ...commonWhere, productPackVersionId: null } },
            orderBy: [{ source: { updatedAt: 'desc' } }, { sortOrder: 'asc' }],
            take: remaining,
          })
        : [];
    return [...productRows, ...commonRows].map(groupKnowledgeChunk);
  }
}
