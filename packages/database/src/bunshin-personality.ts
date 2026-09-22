import { normalizePersonalityVersionContent } from '@bunshin/application';
import type {
  BunshinPersonalityVersion,
  PersonalityLearningProposal,
  PersonalityLearningProposalRepository,
  PersonalityVersionContent,
  PersonalityVersionRepository,
  PersonalityVersionScope,
} from '@bunshin/application';
import { canManageBunshin } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient, prisma } from './client';
import { stringArray } from './bunshin-records';
import { LATEST_DATABASE_MIGRATION } from './schema-readiness';

function personalityVersion(
  row: Prisma.BunshinPersonalityVersionGetPayload<object>,
): BunshinPersonalityVersion {
  if (!['INITIAL', 'MANUAL', 'LEARNING', 'RESTORE'].includes(row.source))
    throw new ApplicationError('DATABASE_UNAVAILABLE', 'invalid personality version source');
  return {
    ...row,
    source: row.source as BunshinPersonalityVersion['source'],
    forbiddenExpressions: stringArray(row.forbiddenExpressions, 'forbiddenExpressions'),
    preferredExpressions: stringArray(row.preferredExpressions, 'preferredExpressions'),
  };
}

export class PrismaPersonalityVersionRepository implements PersonalityVersionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async managedPersonality(tx: Prisma.TransactionClient, input: PersonalityVersionScope) {
    const row = await tx.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: { status: 'ACTIVE' },
      },
      select: {
        id: true,
        ownerUserId: true,
        personality: { select: { id: true } },
        workspace: {
          select: {
            memberships: {
              where: { userId: input.actorUserId, status: 'ACTIVE' },
              select: { role: true },
              take: 1,
            },
          },
        },
      },
    });
    const membership = row?.workspace.memberships[0];
    if (
      !row ||
      !membership ||
      !canManageBunshin(membership.role, input.actorUserId, row.ownerUserId)
    )
      return null;
    return { personality: row.personality };
  }

  private async write(
    tx: Prisma.TransactionClient,
    input: PersonalityVersionScope & {
      content: PersonalityVersionContent;
      source: BunshinPersonalityVersion['source'];
      changeReason: string;
      basedOnVersionId: string | null;
    },
  ) {
    const access = await this.managedPersonality(tx, input);
    const personality = access?.personality;
    if (!personality) return null;
    if (input.basedOnVersionId) {
      const base = await tx.bunshinPersonalityVersion.findFirst({
        where: {
          id: input.basedOnVersionId,
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          personalityId: personality.id,
        },
        select: { id: true },
      });
      if (!base) return null;
    }
    const latest = await tx.bunshinPersonalityVersion.aggregate({
      where: { personalityId: personality.id },
      _max: { version: true },
    });
    await tx.bunshinPersonality.update({
      where: { id: personality.id },
      data: {
        ...input.content,
        forbiddenExpressions: input.content.forbiddenExpressions,
        preferredExpressions: input.content.preferredExpressions,
      },
    });
    const row = await tx.bunshinPersonalityVersion.create({
      data: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        personalityId: personality.id,
        version: (latest._max.version ?? 0) + 1,
        source: input.source,
        changeReason: input.changeReason,
        basedOnVersionId: input.basedOnVersionId,
        ...input.content,
        forbiddenExpressions: input.content.forbiddenExpressions,
        preferredExpressions: input.content.preferredExpressions,
        createdByUserId: input.actorUserId,
      },
    });
    return personalityVersion(row);
  }

  async create(input: Parameters<PersonalityVersionRepository['create']>[0]) {
    try {
      return await this.client.$transaction((tx) =>
        this.write(tx, { ...input, basedOnVersionId: input.basedOnVersionId ?? null }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError('CONFLICT', 'personality version changed concurrently');
      throw error;
    }
  }

  async restore(input: Parameters<PersonalityVersionRepository['restore']>[0]) {
    return this.client.$transaction(async (tx) => {
      const access = await this.managedPersonality(tx, input);
      const personality = access?.personality;
      if (!personality) return null;
      const target = await tx.bunshinPersonalityVersion.findFirst({
        where: {
          id: input.versionId,
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          personalityId: personality.id,
        },
      });
      if (!target) return null;
      return this.write(tx, {
        ...input,
        source: 'RESTORE',
        basedOnVersionId: target.id,
        content: {
          tone: target.tone,
          formality: target.formality,
          energyLevel: target.energyLevel,
          expertiseLevel: target.expertiseLevel,
          sentenceStyle: target.sentenceStyle,
          firstPerson: target.firstPerson,
          forbiddenExpressions: stringArray(target.forbiddenExpressions, 'forbiddenExpressions'),
          preferredExpressions: stringArray(target.preferredExpressions, 'preferredExpressions'),
          visualDirection: target.visualDirection,
          facePolicy: target.facePolicy,
        },
      });
    });
  }

  async list(input: Parameters<PersonalityVersionRepository['list']>[0]) {
    return this.client.$transaction(async (tx) => {
      const access = await this.managedPersonality(tx, input);
      if (!access) return null;
      const personality = access.personality;
      if (!personality) return [];
      const rows = await tx.bunshinPersonalityVersion.findMany({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          personalityId: personality.id,
        },
        orderBy: { version: 'desc' },
      });
      return rows.map(personalityVersion);
    });
  }
}

function personalityLearningProposal(
  row: Prisma.PersonalityLearningProposalGetPayload<object>,
): PersonalityLearningProposal {
  const proposedContent = normalizePersonalityVersionContent(
    row.proposedContent as unknown as PersonalityVersionContent,
  );
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    bunshinId: row.bunshinId,
    status: row.status,
    proposedContent,
    reason: row.reason,
    evidenceIds: stringArray(row.evidenceIds, 'evidenceIds'),
    basedOnVersionId: row.basedOnVersionId,
    appliedVersionId: row.appliedVersionId,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
    revokedAt: row.revokedAt,
  };
}

export class PrismaPersonalityLearningProposalRepository implements PersonalityLearningProposalRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async access(tx: Prisma.TransactionClient, input: PersonalityVersionScope) {
    const row = await tx.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: { status: 'ACTIVE' },
      },
      select: {
        ownerUserId: true,
        personality: { select: { id: true } },
        workspace: {
          select: {
            memberships: {
              where: { userId: input.actorUserId, status: 'ACTIVE' },
              select: { role: true },
              take: 1,
            },
          },
        },
      },
    });
    const membership = row?.workspace.memberships[0];
    if (
      !row ||
      !membership ||
      !canManageBunshin(membership.role, input.actorUserId, row.ownerUserId)
    )
      return null;
    return { personality: row.personality };
  }

  async create(input: Parameters<PersonalityLearningProposalRepository['create']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        const personality = (await this.access(tx, input))?.personality;
        if (!personality) return null;
        const base = await tx.bunshinPersonalityVersion.findFirst({
          where: {
            id: input.basedOnVersionId,
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            personalityId: personality.id,
          },
          select: { id: true },
        });
        if (!base) return null;
        const row = await tx.personalityLearningProposal.create({
          data: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            proposedContent: input.proposedContent as unknown as Prisma.InputJsonValue,
            reason: input.reason,
            evidenceIds: input.evidenceIds,
            basedOnVersionId: input.basedOnVersionId,
            createdByUserId: input.actorUserId,
          },
        });
        return personalityLearningProposal(row);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError('CONFLICT', 'pending learning proposal already exists');
      throw error;
    }
  }

  async list(input: Parameters<PersonalityLearningProposalRepository['list']>[0]) {
    return this.client.$transaction(async (tx) => {
      const access = await this.access(tx, input);
      if (!access) return null;
      if (!access.personality) return [];
      const rows = await tx.personalityLearningProposal.findMany({
        where: { workspaceId: input.workspaceId, bunshinId: input.bunshinId },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(personalityLearningProposal);
    });
  }

  async reject(input: Parameters<PersonalityLearningProposalRepository['reject']>[0]) {
    return this.client.$transaction(async (tx) => {
      if (!(await this.access(tx, input))) return null;
      const current = await tx.personalityLearningProposal.findFirst({
        where: {
          id: input.proposalId,
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          status: 'PENDING',
        },
      });
      if (!current) return null;
      const row = await tx.personalityLearningProposal.update({
        where: { id: current.id },
        data: { status: 'REJECTED', decidedAt: new Date() },
      });
      return personalityLearningProposal(row);
    });
  }

  async approve(input: Parameters<PersonalityLearningProposalRepository['approve']>[0]) {
    return this.client.$transaction(async (tx) => {
      const personality = (await this.access(tx, input))?.personality;
      if (!personality) return null;
      const proposal = await tx.personalityLearningProposal.findFirst({
        where: {
          id: input.proposalId,
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          status: 'PENDING',
        },
      });
      if (!proposal) return null;
      const content = normalizePersonalityVersionContent(
        proposal.proposedContent as unknown as PersonalityVersionContent,
      );
      const latest = await tx.bunshinPersonalityVersion.aggregate({
        where: { personalityId: personality.id },
        _max: { version: true },
      });
      await tx.bunshinPersonality.update({
        where: { id: personality.id },
        data: {
          ...content,
          forbiddenExpressions: content.forbiddenExpressions,
          preferredExpressions: content.preferredExpressions,
        },
      });
      const versionRow = await tx.bunshinPersonalityVersion.create({
        data: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          personalityId: personality.id,
          version: (latest._max.version ?? 0) + 1,
          source: 'LEARNING',
          changeReason: proposal.reason,
          basedOnVersionId: proposal.basedOnVersionId,
          ...content,
          forbiddenExpressions: content.forbiddenExpressions,
          preferredExpressions: content.preferredExpressions,
          createdByUserId: input.actorUserId,
        },
      });
      const updated = await tx.personalityLearningProposal.update({
        where: { id: proposal.id },
        data: { status: 'APPROVED', appliedVersionId: versionRow.id, decidedAt: new Date() },
      });
      return {
        proposal: personalityLearningProposal(updated),
        personalityVersion: personalityVersion(versionRow),
      };
    });
  }

  async revoke(input: Parameters<PersonalityLearningProposalRepository['revoke']>[0]) {
    return this.client.$transaction(async (tx) => {
      const personality = (await this.access(tx, input))?.personality;
      if (!personality) return null;
      const proposal = await tx.personalityLearningProposal.findFirst({
        where: {
          id: input.proposalId,
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          status: 'APPROVED',
        },
      });
      if (!proposal) return null;
      const base = await tx.bunshinPersonalityVersion.findFirst({
        where: { id: proposal.basedOnVersionId, personalityId: personality.id },
      });
      if (!base) return null;
      const content: PersonalityVersionContent = {
        tone: base.tone,
        formality: base.formality,
        energyLevel: base.energyLevel,
        expertiseLevel: base.expertiseLevel,
        sentenceStyle: base.sentenceStyle,
        firstPerson: base.firstPerson,
        forbiddenExpressions: stringArray(base.forbiddenExpressions, 'forbiddenExpressions'),
        preferredExpressions: stringArray(base.preferredExpressions, 'preferredExpressions'),
        visualDirection: base.visualDirection,
        facePolicy: base.facePolicy,
      };
      const latest = await tx.bunshinPersonalityVersion.aggregate({
        where: { personalityId: personality.id },
        _max: { version: true },
      });
      await tx.bunshinPersonality.update({
        where: { id: personality.id },
        data: {
          ...content,
          forbiddenExpressions: content.forbiddenExpressions,
          preferredExpressions: content.preferredExpressions,
        },
      });
      const versionRow = await tx.bunshinPersonalityVersion.create({
        data: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          personalityId: personality.id,
          version: (latest._max.version ?? 0) + 1,
          source: 'RESTORE',
          changeReason: `学習提案の取消: ${proposal.reason}`,
          basedOnVersionId: base.id,
          ...content,
          forbiddenExpressions: content.forbiddenExpressions,
          preferredExpressions: content.preferredExpressions,
          createdByUserId: input.actorUserId,
        },
      });
      const updated = await tx.personalityLearningProposal.update({
        where: { id: proposal.id },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      return {
        proposal: personalityLearningProposal(updated),
        personalityVersion: personalityVersion(versionRow),
      };
    });
  }
}

export async function checkDatabaseReadiness(client: PrismaClient = prisma): Promise<void> {
  try {
    const rows = await client.$queryRaw<Array<{ applied: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM "_prisma_migrations"
        WHERE "migration_name" = ${LATEST_DATABASE_MIGRATION}
          AND "finished_at" IS NOT NULL
          AND "rolled_back_at" IS NULL
      ) AS "applied"
    `;
    if (rows[0]?.applied !== true)
      throw new ApplicationError('DATABASE_UNAVAILABLE', 'Database schema is not current');
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw new ApplicationError('DATABASE_UNAVAILABLE', 'Database readiness check failed', error);
  }
}
