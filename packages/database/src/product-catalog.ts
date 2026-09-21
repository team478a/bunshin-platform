import { createHash } from 'node:crypto';
import type { ExternalLinkPlacementRepository, ProductPackRepository } from '@bunshin/application';
import { Prisma, type PrismaClient, prisma } from './client';

export class PrismaExternalLinkPlacementRepository implements ExternalLinkPlacementRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private manage(workspaceId: string, actorUserId: string) {
    return this.client.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId: actorUserId,
        status: 'ACTIVE',
        role: { in: ['OWNER', 'ADMIN'] },
        workspace: { type: 'ORGANIZATION', status: 'ACTIVE' },
      },
      select: { id: true },
    });
  }

  async list(input: Parameters<ExternalLinkPlacementRepository['list']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    const version = await this.client.productPackVersion.findFirst({
      where: {
        id: input.productPackVersionId,
        productPack: { workspaceId: input.workspaceId },
      },
      select: { id: true },
    });
    if (!version) return null;
    return this.client.externalLinkPlacementTemplate.findMany({
      where: { workspaceId: input.workspaceId, productPackVersionId: version.id },
      orderBy: [{ platform: 'asc' }, { format: 'asc' }],
    });
  }

  async upsert(input: Parameters<ExternalLinkPlacementRepository['upsert']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId))) return null;
    return this.client.$transaction(async (tx) => {
      const productVersion = await tx.productPackVersion.findFirst({
        where: {
          id: input.productPackVersionId,
          status: 'DRAFT',
          productPack: { workspaceId: input.workspaceId },
        },
        include: { productPack: { select: { groupId: true } } },
      });
      if (!productVersion) return null;
      const key = {
        productPackVersionId_platform_format: {
          productPackVersionId: productVersion.id,
          platform: input.platform,
          format: input.format,
        },
      };
      const before = await tx.externalLinkPlacementTemplate.findUnique({ where: key });
      const saved = await tx.externalLinkPlacementTemplate.upsert({
        where: key,
        create: {
          workspaceId: input.workspaceId,
          groupId: productVersion.productPack.groupId,
          productPackVersionId: productVersion.id,
          platform: input.platform,
          format: input.format,
          target: input.target,
          template: input.template,
          urlLocked: true,
          status: input.status,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
        },
        update: {
          target: input.target,
          template: input.template,
          urlLocked: true,
          status: input.status,
          version: { increment: 1 },
          updatedByUserId: input.actorUserId,
        },
      });
      await tx.externalTrackingAuditLog.create({
        data: {
          workspaceId: saved.workspaceId,
          groupId: saved.groupId,
          resourceType: 'PLACEMENT_TEMPLATE',
          resourceId: saved.id,
          action: before ? 'UPDATED' : 'CREATED',
          beforeData: before
            ? {
                platform: before.platform,
                format: before.format,
                target: before.target,
                status: before.status,
                version: before.version,
                templateHash: createHash('sha256').update(before.template).digest('hex'),
              }
            : Prisma.JsonNull,
          afterData: {
            platform: saved.platform,
            format: saved.format,
            target: saved.target,
            status: saved.status,
            version: saved.version,
            templateHash: createHash('sha256').update(saved.template).digest('hex'),
          },
          performedByUserId: input.actorUserId,
        },
      });
      return saved;
    });
  }

  async resolveForGeneration(
    input: Parameters<ExternalLinkPlacementRepository['resolveForGeneration']>[0],
  ) {
    const assignment = await this.client.productPackAssignment.findFirst({
      where: {
        productPackVersionId: input.productPackVersionId,
        bunshinId: input.bunshinId,
        status: 'ACTIVE',
        bunshin: {
          workspaceId: input.workspaceId,
          ownerUserId: input.actorUserId,
          status: 'ACTIVE',
        },
        productPackVersion: { status: 'PUBLISHED' },
      },
      select: { id: true },
    });
    if (!assignment) return { accessible: false, placement: null };
    const placement = await this.client.externalLinkPlacementTemplate.findFirst({
      where: {
        workspaceId: input.workspaceId,
        productPackVersionId: input.productPackVersionId,
        platform: input.platform,
        format: input.format,
        status: 'ACTIVE',
        urlLocked: true,
      },
      select: { id: true, target: true, template: true, version: true },
    });
    return { accessible: true, placement };
  }
}

export class PrismaProductPackRepository implements ProductPackRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async manage(workspaceId: string, actorUserId: string, groupId?: string | null) {
    const workspaceManager = await this.client.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId: actorUserId,
        status: 'ACTIVE',
        role: { in: ['OWNER', 'ADMIN'] },
        workspace: { type: 'ORGANIZATION', status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (workspaceManager) return true;
    if (!groupId) return false;
    return Boolean(
      await this.client.groupMembership.findFirst({
        where: {
          workspaceId,
          groupId,
          userId: actorUserId,
          status: 'ACTIVE',
          OR: [
            { role: 'MANAGER' },
            {
              serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN', 'CONTENT_EDITOR'] },
              group: { serviceConfiguration: { isNot: null } },
            },
          ],
          group: { status: 'ACTIVE' },
        },
        select: { id: true },
      }),
    );
  }

  async list(input: Parameters<ProductPackRepository['list']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId, input.groupId))) return null;
    return this.client.productPack.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...(input.groupId ? { groupId: input.groupId } : {}),
      },
      include: {
        group: { select: { id: true, name: true } },
        versions: { orderBy: { version: 'desc' }, include: { rules: true, assets: true } },
        assignments: { where: { status: 'ACTIVE' } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(input: Parameters<ProductPackRepository['get']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId, input.groupId))) return null;
    return this.client.productPack.findFirst({
      where: {
        id: input.productPackId,
        workspaceId: input.workspaceId,
        ...(input.groupId ? { groupId: input.groupId } : {}),
      },
      include: {
        group: { select: { id: true, name: true } },
        versions: { orderBy: { version: 'desc' }, include: { rules: true, assets: true } },
        assignments: { include: { bunshin: { select: { id: true, name: true } } } },
      },
    });
  }

  async createPack(input: Parameters<ProductPackRepository['createPack']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId, input.groupId))) return null;
    const group = await this.client.group.findFirst({
      where: { id: input.groupId, workspaceId: input.workspaceId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!group) return null;
    return this.client.productPack.create({
      data: { workspaceId: input.workspaceId, groupId: input.groupId, name: input.name },
    });
  }

  async createDraftVersion(input: Parameters<ProductPackRepository['createDraftVersion']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId, input.groupId))) return null;
    return this.client.$transaction(async (tx) => {
      const pack = await tx.productPack.findFirst({
        where: {
          id: input.productPackId,
          workspaceId: input.workspaceId,
          status: { not: 'ARCHIVED' },
          ...(input.groupId ? { groupId: input.groupId } : {}),
        },
        include: { _count: { select: { versions: true } } },
      });
      if (!pack) return null;
      const c = input.content;
      return tx.productPackVersion.create({
        data: {
          productPackId: pack.id,
          version: pack._count.versions + 1,
          summary: c.summary,
          providerName: c.providerName,
          targetCustomer: c.targetCustomer,
          facts: c.facts,
          faq: c.faq,
          suitableFor: c.suitableFor,
          unsuitableFor: c.unsuitableFor,
          allowLinklessPosts: c.allowLinklessPosts ?? false,
          validFrom: c.validFrom ?? null,
          validUntil: c.validUntil ?? null,
          createdByUserId: input.actorUserId,
          rules: { create: c.rules.map((rule, sortOrder) => ({ ...rule, sortOrder })) },
          assets: {
            create: c.assets.map((asset) => ({ ...asset, validUntil: asset.validUntil ?? null })),
          },
        },
        include: { rules: true, assets: true },
      });
    });
  }

  async publishVersion(input: Parameters<ProductPackRepository['publishVersion']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId, input.groupId))) return null;
    return this.client.$transaction(async (tx) => {
      const draft = await tx.productPackVersion.findFirst({
        where: {
          id: input.versionId,
          productPackId: input.productPackId,
          status: 'DRAFT',
          productPack: {
            workspaceId: input.workspaceId,
            status: { not: 'ARCHIVED' },
            ...(input.groupId ? { groupId: input.groupId } : {}),
          },
        },
      });
      if (!draft) return null;
      await tx.productPackVersion.updateMany({
        where: { productPackId: input.productPackId, status: 'PUBLISHED' },
        data: { status: 'SUPERSEDED', supersededAt: input.publishedAt },
      });
      await tx.productPack.update({
        where: { id: input.productPackId },
        data: { status: 'ACTIVE' },
      });
      return tx.productPackVersion.update({
        where: { id: draft.id },
        data: { status: 'PUBLISHED', publishedAt: input.publishedAt },
        include: { rules: true, assets: true },
      });
    });
  }

  async assign(input: Parameters<ProductPackRepository['assign']>[0]) {
    return this.client.$transaction(async (tx) => {
      const eligible = await tx.productPackVersion.findFirst({
        where: {
          id: input.versionId,
          productPackId: input.productPackId,
          status: 'PUBLISHED',
          productPack: {
            workspaceId: input.workspaceId,
            status: 'ACTIVE',
            group: {
              memberships: {
                some: {
                  userId: input.actorUserId,
                  status: 'ACTIVE',
                  consentedAt: { not: null },
                },
              },
            },
          },
        },
        include: { productPack: true },
      });
      const bunshin = await tx.bunshin.findFirst({
        where: {
          id: input.bunshinId,
          ownerUserId: input.actorUserId,
          status: { in: ['DRAFT', 'ACTIVE', 'PAUSED'] },
        },
      });
      if (!eligible || !bunshin) return null;
      const active = await tx.productPackAssignment.findFirst({
        where: { bunshinId: input.bunshinId, status: 'ACTIVE' },
      });
      if (active && active.productPackId !== input.productPackId) return null;
      return tx.productPackAssignment.upsert({
        where: {
          productPackId_bunshinId: {
            productPackId: input.productPackId,
            bunshinId: input.bunshinId,
          },
        },
        create: {
          workspaceId: eligible.productPack.workspaceId,
          productPackId: input.productPackId,
          productPackVersionId: input.versionId,
          bunshinId: input.bunshinId,
          consentedAt: input.consentedAt,
          assignedByUserId: input.actorUserId,
        },
        update: {
          productPackVersionId: input.versionId,
          status: 'ACTIVE',
          consentedAt: input.consentedAt,
          assignedByUserId: input.actorUserId,
          revokedAt: null,
        },
      });
    });
  }

  async revokeAssignment(input: Parameters<ProductPackRepository['revokeAssignment']>[0]) {
    const row = await this.client.productPackAssignment.findFirst({
      where: {
        id: input.assignmentId,
        workspaceId: input.workspaceId,
        status: 'ACTIVE',
        bunshin: { ownerUserId: input.actorUserId },
      },
    });
    if (!row) return null;
    return this.client.productPackAssignment.update({
      where: { id: row.id },
      data: { status: 'REVOKED', revokedAt: input.revokedAt },
    });
  }

  async suspend(input: Parameters<ProductPackRepository['suspend']>[0]) {
    if (!(await this.manage(input.workspaceId, input.actorUserId, input.groupId))) return null;
    return this.client.$transaction(async (tx) => {
      const pack = await tx.productPack.findFirst({
        where: {
          id: input.productPackId,
          workspaceId: input.workspaceId,
          status: 'ACTIVE',
          ...(input.groupId ? { groupId: input.groupId } : {}),
        },
      });
      if (!pack) return null;
      await tx.productPackAssignment.updateMany({
        where: { productPackId: pack.id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: input.suspendedAt },
      });
      return tx.productPack.update({
        where: { id: pack.id },
        data: { status: 'SUSPENDED' },
      });
    });
  }

  async resolveForGeneration(input: Parameters<ProductPackRepository['resolveForGeneration']>[0]) {
    const row = await this.client.productPackAssignment.findFirst({
      where: {
        bunshinId: input.bunshinId,
        status: 'ACTIVE',
        bunshin: {
          workspaceId: input.workspaceId,
          ownerUserId: input.actorUserId,
          status: 'ACTIVE',
        },
        productPack: {
          status: 'ACTIVE',
          group: {
            status: 'ACTIVE',
            memberships: {
              some: {
                userId: input.actorUserId,
                status: 'ACTIVE',
                consentedAt: { not: null },
              },
            },
          },
        },
        productPackVersion: {
          status: 'PUBLISHED',
          AND: [
            { OR: [{ validFrom: null }, { validFrom: { lte: input.at } }] },
            { OR: [{ validUntil: null }, { validUntil: { gt: input.at } }] },
          ],
        },
      },
      select: {
        productPackId: true,
        productPack: { select: { groupId: true } },
        productPackVersion: {
          select: { id: true, version: true, allowLinklessPosts: true },
        },
      },
    });
    return row
      ? {
          productPackId: row.productPackId,
          versionId: row.productPackVersion.id,
          version: row.productPackVersion.version,
          groupId: row.productPack.groupId,
          allowLinklessPosts: row.productPackVersion.allowLinklessPosts,
        }
      : null;
  }
}
