import type { Prisma, PrismaClient } from './client';
const socialImagePilotApprovalChecks = [
  'PLAN_APPROVAL',
  'STORAGE_RETENTION',
  'MOBILE_E2E',
  'SECURITY_ISOLATION',
  'TEN_THEME_VALIDATION',
  'FINAL_APPROVAL',
] as const;

export async function socialImagePilotCanGenerate(
  client: PrismaClient | Prisma.TransactionClient,
  input: {
    workspaceId: string;
    groupId: string;
    pilotId: string;
    pilotEnrollmentId: string;
    currentRequestId?: string;
  },
) {
  const rows = await client.socialImagePilotEvidence.findMany({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      pilotId: input.pilotId,
    },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    select: { checkKey: true, action: true },
  });
  const latest = new Map(rows.map((row) => [row.checkKey, row.action]));
  if (socialImagePilotApprovalChecks.every((key) => latest.get(key) === 'RECORDED')) return true;
  const preflightReady =
    latest.get('PLAN_APPROVAL') === 'RECORDED' &&
    latest.get('STORAGE_RETENTION') === 'RECORDED' &&
    latest.get('FINAL_APPROVAL') === undefined;
  if (!preflightReady) return false;

  const otherPreflightRequests = await client.socialImageGenerationRequest.count({
    where: {
      pilotEnrollmentId: input.pilotEnrollmentId,
      status: { notIn: ['FAILED', 'CANCELLED'] },
      ...(input.currentRequestId ? { id: { not: input.currentRequestId } } : {}),
    },
  });
  return otherPreflightRequests === 0;
}
