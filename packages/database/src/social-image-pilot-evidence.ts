import type {
  SocialImagePilotEvidenceRecord,
  SocialImagePilotEvidenceRepository,
} from '@bunshin/application';
import { Prisma, type PrismaClient, prisma } from './client';
const socialImagePilotEvidenceRecord = (
  row: Prisma.SocialImagePilotEvidenceGetPayload<object>,
): SocialImagePilotEvidenceRecord => ({
  ...row,
  checkKey: row.checkKey,
  action: row.action,
});

export class PrismaSocialImagePilotEvidenceRepository implements SocialImagePilotEvidenceRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async list(input: Parameters<SocialImagePilotEvidenceRepository['list']>[0]) {
    const [admin, pilot] = await Promise.all([
      this.client.platformAdmin.findFirst({
        where: { userId: input.actorUserId, status: 'ACTIVE' },
        select: { id: true },
      }),
      this.client.socialImageGenerationPilot.findFirst({
        where: {
          id: input.pilotId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
        },
        select: { id: true },
      }),
    ]);
    if (!admin || !pilot) return null;
    const rows = await this.client.socialImagePilotEvidence.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        pilotId: input.pilotId,
      },
      orderBy: { occurredAt: 'asc' },
    });
    return rows.map(socialImagePilotEvidenceRecord);
  }

  async append(input: Parameters<SocialImagePilotEvidenceRepository['append']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        const [admin, pilot] = await Promise.all([
          tx.platformAdmin.findFirst({
            where: { userId: input.actorUserId, role: 'SUPER_ADMIN', status: 'ACTIVE' },
            select: { id: true },
          }),
          tx.socialImageGenerationPilot.findFirst({
            where: {
              id: input.pilotId,
              workspaceId: input.workspaceId,
              groupId: input.groupId,
            },
            select: { id: true },
          }),
        ]);
        if (!admin || !pilot) return null;
        if (input.checkKey === 'FINAL_APPROVAL' && input.action === 'RECORDED') {
          const rows = await tx.socialImagePilotEvidence.findMany({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              pilotId: input.pilotId,
            },
            orderBy: { occurredAt: 'asc' },
            select: { checkKey: true, action: true },
          });
          const latest = new Map(rows.map((row) => [row.checkKey, row.action]));
          const required = [
            'PLAN_APPROVAL',
            'STORAGE_RETENTION',
            'MOBILE_E2E',
            'SECURITY_ISOLATION',
            'TEN_THEME_VALIDATION',
          ] as const;
          if (!required.every((key) => latest.get(key) === 'RECORDED')) return null;
        }
        return socialImagePilotEvidenceRecord(
          await tx.socialImagePilotEvidence.create({ data: input }),
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
