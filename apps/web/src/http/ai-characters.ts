import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveManagedServiceContext } from '../services/public-service';

const uuid = z.string().uuid();
const body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('CREATE_PROFILE'),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(1000),
  }),
  z.object({
    action: z.literal('ADD_LICENSE'),
    characterProfileId: uuid,
    rightsHolder: z.string().trim().min(1).max(300),
    commercialUseAllowed: z.boolean(),
    derivativeUseAllowed: z.boolean(),
    redistributionAllowed: z.boolean(),
    terms: z.string().trim().min(1).max(3000),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().nullable(),
    consentConfirmed: z.literal(true),
  }),
  z.object({
    action: z.literal('PUBLISH_VERSION'),
    characterProfileId: uuid,
    licenseVersionId: uuid,
    appearance: z.string().trim().min(1).max(2000),
    worldSetting: z.string().trim().min(1).max(2000),
    basePrompt: z.string().trim().min(1).max(5000),
    negativePrompt: z.string().trim().min(1).max(3000),
    safetyRules: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  }),
]);
const response = (data: unknown, requestId: string, status = 200) =>
  Response.json({ data, requestId }, { status, headers: { 'cache-control': 'private, no-store' } });

export async function aiCharactersResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const [service, value] = await Promise.all([
      resolveManagedServiceContext(serviceSlug, actor.userId),
      body.parseAsync(request.json()),
    ]);
    const db = await import('@bunshin/database');
    if (value.action === 'CREATE_PROFILE') {
      const profile = await db.prisma.$transaction(async (tx) => {
        const created = await tx.aiCharacterProfile.create({
          data: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            ownerUserId: null,
            scope: 'SERVICE',
            name: value.name,
            description: value.description,
            createdByUserId: actor.userId,
          },
        });
        await tx.aiCharacterAuditLog.create({
          data: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            characterProfileId: created.id,
            resourceType: 'PROFILE',
            resourceId: created.id,
            action: 'CREATED',
            afterData: { id: created.id, name: created.name, scope: created.scope },
            performedByUserId: actor.userId,
          },
        });
        return created;
      });
      return response(profile, requestId, 201);
    }
    const profile = await db.prisma.aiCharacterProfile.findFirst({
      where: {
        id: value.characterProfileId,
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        scope: 'SERVICE',
        status: { not: 'RETIRED' },
      },
    });
    if (!profile) throw new ApplicationError('NOT_FOUND', 'character profile not found');
    if (value.action === 'ADD_LICENSE') {
      const startsAt = new Date(value.startsAt);
      const endsAt = value.endsAt ? new Date(value.endsAt) : null;
      if (endsAt && startsAt >= endsAt)
        throw new ApplicationError('VALIDATION_ERROR', 'invalid license period');
      const license = await db.prisma.$transaction(async (tx) => {
        const latest = await tx.aiCharacterLicenseVersion.aggregate({
          where: { characterProfileId: profile.id },
          _max: { version: true },
        });
        const created = await tx.aiCharacterLicenseVersion.create({
          data: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            characterProfileId: profile.id,
            version: (latest._max.version ?? 0) + 1,
            rightsHolder: value.rightsHolder,
            commercialUseAllowed: value.commercialUseAllowed,
            derivativeUseAllowed: value.derivativeUseAllowed,
            redistributionAllowed: value.redistributionAllowed,
            terms: value.terms,
            startsAt,
            endsAt,
            consentRecordedAt: new Date(),
            recordedByUserId: actor.userId,
          },
        });
        await tx.aiCharacterAuditLog.create({
          data: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            characterProfileId: profile.id,
            resourceType: 'LICENSE_VERSION',
            resourceId: created.id,
            action: 'RECORDED',
            afterData: {
              id: created.id,
              version: created.version,
              rightsHolder: created.rightsHolder,
            },
            performedByUserId: actor.userId,
          },
        });
        return created;
      });
      return response(license, requestId, 201);
    }
    const license = await db.prisma.aiCharacterLicenseVersion.findFirst({
      where: {
        id: value.licenseVersionId,
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        characterProfileId: profile.id,
      },
    });
    if (!license) throw new ApplicationError('NOT_FOUND', 'license version not found');
    const now = new Date();
    if (license.startsAt > now || (license.endsAt && license.endsAt <= now))
      throw new ApplicationError('FORBIDDEN', 'license is not active');
    const version = await db.prisma.$transaction(async (tx) => {
      const current = await tx.aiCharacterProfileVersion.findFirst({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          characterProfileId: profile.id,
          status: 'PUBLISHED',
        },
      });
      if (current)
        await tx.aiCharacterProfileVersion.update({
          where: { id: current.id },
          data: { status: 'SUPERSEDED', supersededAt: now },
        });
      const latest = await tx.aiCharacterProfileVersion.aggregate({
        where: { characterProfileId: profile.id },
        _max: { version: true },
      });
      const created = await tx.aiCharacterProfileVersion.create({
        data: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          characterProfileId: profile.id,
          licenseVersionId: license.id,
          version: (latest._max.version ?? 0) + 1,
          status: 'PUBLISHED',
          appearance: value.appearance,
          worldSetting: value.worldSetting,
          basePrompt: value.basePrompt,
          negativePrompt: value.negativePrompt,
          safetyRules: [...new Set(value.safetyRules)],
          licenseSnapshot: {
            version: license.version,
            rightsHolder: license.rightsHolder,
            commercialUseAllowed: license.commercialUseAllowed,
            derivativeUseAllowed: license.derivativeUseAllowed,
            redistributionAllowed: license.redistributionAllowed,
            terms: license.terms,
            startsAt: license.startsAt.toISOString(),
            endsAt: license.endsAt?.toISOString() ?? null,
          },
          createdByUserId: actor.userId,
          publishedAt: now,
        },
      });
      await tx.aiCharacterProfile.update({ where: { id: profile.id }, data: { status: 'ACTIVE' } });
      await tx.aiCharacterAuditLog.create({
        data: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          characterProfileId: profile.id,
          resourceType: 'PROFILE_VERSION',
          resourceId: created.id,
          action: 'PUBLISHED',
          ...(current ? { beforeData: { id: current.id, version: current.version } } : {}),
          afterData: { id: created.id, version: created.version, licenseVersionId: license.id },
          performedByUserId: actor.userId,
        },
      });
      return created;
    });
    return response(version, requestId, 201);
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
