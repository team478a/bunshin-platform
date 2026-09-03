import 'server-only';
import { ApplicationError } from '@bunshin/shared';

type GenerationKind = 'IMAGE' | 'VIDEO';

const startOfUtcMonth = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/**
 * Applies the organization-wide contract ceiling before a paid generation is queued.
 * No entitlement row, or a null limit, intentionally means unlimited for existing tenants.
 */
export async function assertOrganizationGenerationQuota(input: {
  workspaceId: string;
  kind: GenerationKind;
  resourceId?: string;
  now?: Date;
}) {
  const db = await import('@bunshin/database');
  const now = input.now ?? new Date();
  const entitlement = await db.prisma.organizationEntitlement.findUnique({
    where: { workspaceId: input.workspaceId },
    select: {
      suspended: true,
      startsAt: true,
      endsAt: true,
      monthlyImageGenerationLimit: true,
      monthlyVideoGenerationLimit: true,
    },
  });
  if (!entitlement) return;
  if (
    entitlement.suspended ||
    (entitlement.startsAt && entitlement.startsAt > now) ||
    (entitlement.endsAt && entitlement.endsAt <= now)
  )
    throw new ApplicationError('FORBIDDEN', 'organization generation is suspended');

  const since = startOfUtcMonth(now);
  if (input.kind === 'IMAGE') {
    if (entitlement.monthlyImageGenerationLimit === null) return;
    const used = await db.prisma.socialImageGenerationRequest.count({
      where: {
        workspaceId: input.workspaceId,
        createdAt: { gte: since, lt: now },
        status: { not: 'DRAFT' },
      },
    });
    if (used >= entitlement.monthlyImageGenerationLimit)
      throw new ApplicationError('FORBIDDEN', 'organization monthly image limit reached');
    return;
  }

  if (entitlement.monthlyVideoGenerationLimit === null) return;
  if (input.resourceId) {
    const alreadyCounted = await db.prisma.videoSceneGeneration.findFirst({
      where: {
        workspaceId: input.workspaceId,
        videoProjectId: input.resourceId,
        createdAt: { gte: since, lt: now },
      },
      select: { id: true },
    });
    if (alreadyCounted) return;
  }
  const used = await db.prisma.videoSceneGeneration.findMany({
    where: { workspaceId: input.workspaceId, createdAt: { gte: since, lt: now } },
    distinct: ['videoProjectId'],
    select: { videoProjectId: true },
  });
  if (used.length >= entitlement.monthlyVideoGenerationLimit)
    throw new ApplicationError('FORBIDDEN', 'organization monthly video limit reached');
}
