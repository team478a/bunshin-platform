import type { MemberUsageRequest } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import type { Prisma } from '@prisma/client';
import { latestServiceLegalDocuments } from './service-legal-latest';

export const memberUsageReadOptions = {
  isolationLevel: 'RepeatableRead' as const,
  maxWait: 3_000,
  timeout: 20_000,
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function snapshotMemberUsageRequest(input: MemberUsageRequest) {
  const request = {
    actorUserId: input.actorUserId,
    timezone: input.timezone,
    asOf: new Date(input.asOf),
    scope: {
      workspaceId: input.scope.workspaceId,
      serviceId: input.scope.serviceId,
      groupMembershipId: input.scope.groupMembershipId,
      userId: input.scope.userId,
      bunshinId: input.scope.bunshinId,
    },
  };
  if (
    !uuid.test(request.actorUserId) ||
    Object.values(request.scope).some((id) => !uuid.test(id)) ||
    !Number.isFinite(request.asOf.getTime())
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid member usage request');
  return request;
}

export async function isMemberUsagePermitted(
  tx: Prisma.TransactionClient,
  request: MemberUsageRequest,
  now: Date,
) {
  if (request.actorUserId !== request.scope.userId) return false;
  const scope = request.scope;
  const member = await tx.groupMembership.findFirst({
    where: {
      id: scope.groupMembershipId,
      workspaceId: scope.workspaceId,
      groupId: scope.serviceId,
      userId: scope.userId,
      status: 'ACTIVE',
      consentedAt: { lte: now },
      user: { status: 'ACTIVE' },
      workspace: {
        status: 'ACTIVE',
        memberships: { some: { userId: scope.userId, status: 'ACTIVE' } },
      },
      group: {
        workspaceId: scope.workspaceId,
        status: 'ACTIVE',
        serviceConfiguration: {
          is: {
            workspaceId: scope.workspaceId,
            AND: [
              { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
              { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
            ],
          },
        },
      },
    },
    select: { id: true },
  });
  if (!member) return false;
  const bunshin = await tx.bunshin.findFirst({
    where: {
      id: scope.bunshinId,
      workspaceId: scope.workspaceId,
      groupId: scope.serviceId,
      ownerUserId: scope.userId,
      status: { not: 'ARCHIVED' },
    },
    select: { id: true },
  });
  if (!bunshin) return false;
  const required = latestServiceLegalDocuments(
    await tx.serviceLegalDocument.findMany({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.serviceId,
        status: 'PUBLISHED',
        effectiveAt: { lte: now },
      },
      select: { id: true, type: true, version: true },
    }),
  ).map((row) => row.id);
  if (!required.length) return true;
  return (
    (await tx.serviceLegalConsent.count({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.serviceId,
        groupMembershipId: scope.groupMembershipId,
        userId: scope.userId,
        legalDocumentId: { in: required },
        consentedAt: { lte: now },
      },
    })) === required.length
  );
}
