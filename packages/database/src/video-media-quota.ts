import { Prisma } from '@prisma/client';
import { ApplicationError } from '@bunshin/shared';

export type VideoMediaScope = {
  workspaceId: string;
  groupId: string;
  videoProjectId: string;
  projectRevision: number;
};

const operationKey = (input: VideoMediaScope) =>
  `video:${input.videoProjectId}:revision:${input.projectRevision}`;

/** Called inside the same transaction as queueing. Lock the service to serialize its quota. */
export async function reserveVideoMedia(tx: Prisma.TransactionClient, input: VideoMediaScope) {
  const now = new Date();
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM organization_entitlements WHERE workspace_id = ${input.workspaceId}::uuid FOR UPDATE
  `);
  const organization = await tx.organizationEntitlement.findUnique({
    where: { workspaceId: input.workspaceId },
  });
  if (organization) {
    if (
      organization.suspended ||
      (organization.startsAt && organization.startsAt > now) ||
      (organization.endsAt && organization.endsAt <= now)
    )
      throw new ApplicationError('FORBIDDEN', '組織の動画作成契約が有効ではありません');
    if (organization.monthlyVideoGenerationLimit !== null) {
      const createdAt = { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) };
      const used = await tx.videoProject.count({
        where: {
          workspaceId: input.workspaceId,
          id: { not: input.videoProjectId },
          OR: [
            { sceneGenerations: { some: { createdAt } } },
            { renderAttempts: { some: { createdAt } } },
          ],
        },
      });
      if (used >= organization.monthlyVideoGenerationLimit)
        throw new ApplicationError('FORBIDDEN', '組織の今月の動画作成枠を使い切りました');
    }
  }
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM service_commercial_settings
    WHERE workspace_id = ${input.workspaceId}::uuid AND group_id = ${input.groupId}::uuid
    FOR UPDATE
  `);
  const setting = await tx.serviceCommercialSetting.findFirst({
    where: { workspaceId: input.workspaceId, groupId: input.groupId },
  });
  if (!setting) return;
  if (
    setting.status !== 'ACTIVE' ||
    (setting.startsAt && setting.startsAt > now) ||
    (setting.endsAt && setting.endsAt <= now)
  )
    throw new ApplicationError('FORBIDDEN', 'サービスの動画作成契約が有効ではありません');
  const limit = setting.monthlyVideoGenerationLimit;
  if (limit === null) return;
  const where = {
    workspaceId_groupId_kind_operationKey: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      kind: 'VIDEO' as const,
      operationKey: operationKey(input),
    },
  };
  const existing = await tx.serviceMediaGenerationReservation.findUnique({ where });
  if (existing?.status === 'RESERVED' || existing?.status === 'CONSUMED') return;
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const used = await tx.serviceMediaGenerationReservation.count({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      kind: 'VIDEO',
      OR: [{ status: 'RESERVED' }, { status: 'CONSUMED', monthKey }],
    },
  });
  if (used >= limit) throw new ApplicationError('FORBIDDEN', '今月の動画作成枠を使い切りました');
  // External jobs can take longer than an HTTP lease; only terminal processing releases this slot.
  const data = {
    monthKey,
    status: 'RESERVED' as const,
    expiresAt: new Date('9999-12-31T00:00:00Z'),
    consumedAt: null,
    releasedAt: null,
  };
  await tx.serviceMediaGenerationReservation.upsert({
    where,
    create: { ...where.workspaceId_groupId_kind_operationKey, ...data },
    update: data,
  });
}

export async function finishVideoMedia(
  tx: Prisma.TransactionClient,
  input: VideoMediaScope,
  outcome: 'CONSUMED' | 'RELEASED',
) {
  await tx.serviceMediaGenerationReservation.updateMany({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      kind: 'VIDEO',
      operationKey: operationKey(input),
      status: 'RESERVED',
    },
    data:
      outcome === 'CONSUMED'
        ? { status: outcome, consumedAt: new Date() }
        : { status: outcome, releasedAt: new Date() },
  });
}

/** Last scene settles a failed batch; successful scenes retain the slot for final composition. */
export async function settleVideoSceneBatch(tx: Prisma.TransactionClient, input: VideoMediaScope) {
  const where = {
    workspaceId: input.workspaceId,
    groupId: input.groupId,
    videoProjectId: input.videoProjectId,
    projectRevision: input.projectRevision,
  };
  const scenes = await tx.videoSceneGeneration.findMany({ where, select: { status: true } });
  if (scenes.some((scene) => ['QUEUED', 'SUBMITTED', 'GENERATING'].includes(scene.status))) return;
  if (!scenes.some((scene) => ['FAILED', 'CANCELLED'].includes(scene.status))) {
    if (scenes.length > 0)
      await tx.videoProject.updateMany({
        where: {
          id: input.videoProjectId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          revision: input.projectRevision,
          status: 'QUEUED',
          renderAttempts: { none: { projectRevision: input.projectRevision } },
        },
        data: { status: 'APPROVED' },
      });
    return;
  }
  await finishVideoMedia(tx, input, 'RELEASED');
  await tx.videoProject.updateMany({
    where: {
      id: input.videoProjectId,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      revision: input.projectRevision,
      status: { in: ['APPROVED', 'QUEUED'] },
    },
    data: { status: 'FAILED' },
  });
}
