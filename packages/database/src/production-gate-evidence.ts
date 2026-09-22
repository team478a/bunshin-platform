import {
  PRODUCTION_GATE_REQUIRED_CHECK_KEYS,
  type ProductionGateEvidence,
  type ProductionGateEvidenceRepository,
} from '@bunshin/application';
import { type PrismaClient, prisma } from './client';
function productionGateEvidence(row: {
  id: string;
  environment: string;
  checkKey: string;
  commitSha: string;
  action: string;
  reason: string;
  evidenceUrl: string | null;
  actorUserId: string;
  occurredAt: Date;
}): ProductionGateEvidence {
  return row as ProductionGateEvidence;
}

export class PrismaProductionGateEvidenceRepository implements ProductionGateEvidenceRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async list(input: {
    actorUserId: string;
    environment: 'PRODUCTION';
    commitSha: string;
  }): Promise<ProductionGateEvidence[] | null> {
    const admin = await this.client.platformAdmin.findFirst({
      where: { userId: input.actorUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!admin) return null;
    const rows = await this.client.productionGateEvidence.findMany({
      where: { environment: input.environment, commitSha: input.commitSha },
      orderBy: { occurredAt: 'asc' },
    });
    return rows.map(productionGateEvidence);
  }

  async append(
    input: Omit<ProductionGateEvidence, 'id' | 'occurredAt'>,
  ): Promise<ProductionGateEvidence | null> {
    return this.client.$transaction(async (tx) => {
      const admin = await tx.platformAdmin.findFirst({
        where: { userId: input.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      });
      if (!admin) return null;
      if (input.checkKey === 'FINAL_APPROVAL' && input.action === 'RECORDED') {
        const rows = await tx.productionGateEvidence.findMany({
          where: { environment: input.environment, commitSha: input.commitSha },
          orderBy: { occurredAt: 'asc' },
          select: { checkKey: true, action: true },
        });
        const latest = new Map(rows.map((row) => [row.checkKey, row.action]));
        if (!PRODUCTION_GATE_REQUIRED_CHECK_KEYS.every((key) => latest.get(key) === 'RECORDED'))
          return null;
      }
      return productionGateEvidence(await tx.productionGateEvidence.create({ data: input }));
    });
  }
}
