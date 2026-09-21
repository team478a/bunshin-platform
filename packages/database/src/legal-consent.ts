import type {
  LegalConsentRepository,
  LegalDocument,
  LegalDocumentRepository,
  LegalDocumentType,
  RequiredLegalConsentDocument,
} from '@bunshin/application';
import { type Prisma, type PrismaClient, prisma } from './client';
function legalDocument(row: Prisma.LegalDocumentGetPayload<object>): LegalDocument {
  return { ...row, type: row.type, status: row.status };
}

export class PrismaLegalDocumentRepository implements LegalDocumentRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async listForAdmin(actorUserId: string): Promise<LegalDocument[] | null> {
    const admin = await this.client.platformAdmin.findFirst({
      where: { userId: actorUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!admin) return null;
    return (
      await this.client.legalDocument.findMany({
        orderBy: [{ type: 'asc' }, { version: 'desc' }],
      })
    ).map(legalDocument);
  }

  async createDraft(input: {
    actorUserId: string;
    type: LegalDocumentType;
    title: string;
    content: string;
  }): Promise<LegalDocument | null> {
    return this.client.$transaction(async (tx) => {
      const admin = await tx.platformAdmin.findFirst({
        where: {
          userId: input.actorUserId,
          status: 'ACTIVE',
          role: { in: ['SUPER_ADMIN', 'OPERATOR'] },
        },
        select: { id: true },
      });
      if (!admin) return null;
      const latest = await tx.legalDocument.findFirst({
        where: { type: input.type },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      return legalDocument(
        await tx.legalDocument.create({
          data: {
            type: input.type,
            version: (latest?.version ?? 0) + 1,
            title: input.title,
            content: input.content,
            createdByUserId: input.actorUserId,
          },
        }),
      );
    });
  }

  async publish(input: {
    actorUserId: string;
    documentId: string;
    effectiveAt: Date;
  }): Promise<LegalDocument | null> {
    return this.client.$transaction(async (tx) => {
      const admin = await tx.platformAdmin.findFirst({
        where: {
          userId: input.actorUserId,
          status: 'ACTIVE',
          role: { in: ['SUPER_ADMIN', 'OPERATOR'] },
        },
        select: { id: true },
      });
      if (!admin) return null;
      const target = await tx.legalDocument.findFirst({
        where: { id: input.documentId, status: 'DRAFT' },
      });
      if (!target) return null;
      const now = new Date();
      await tx.legalDocument.updateMany({
        where: { type: target.type, status: 'PUBLISHED' },
        data: { status: 'RETIRED' },
      });
      return legalDocument(
        await tx.legalDocument.update({
          where: { id: target.id },
          data: { status: 'PUBLISHED', effectiveAt: input.effectiveAt, publishedAt: now },
        }),
      );
    });
  }

  async findPublished(type: LegalDocumentType): Promise<LegalDocument | null> {
    const row = await this.client.legalDocument.findFirst({
      where: { type, status: 'PUBLISHED', effectiveAt: { lte: new Date() } },
      orderBy: { version: 'desc' },
    });
    return row ? legalDocument(row) : null;
  }
}

export class PrismaLegalConsentRepository implements LegalConsentRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findRequiredForUser(userId: string): Promise<RequiredLegalConsentDocument[]> {
    const rows = await this.client.legalDocument.findMany({
      where: { status: 'PUBLISHED', effectiveAt: { lte: new Date() } },
      orderBy: [{ type: 'asc' }, { version: 'desc' }],
      distinct: ['type'],
      include: { consents: { where: { userId }, select: { consentedAt: true }, take: 1 } },
    });
    return rows.map(({ consents, ...row }) => ({
      ...legalDocument(row),
      consentedAt: consents[0]?.consentedAt ?? null,
    }));
  }

  async acceptRequired(input: { userId: string; documentIds: string[] }): Promise<boolean> {
    return this.client.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: input.userId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!user) return false;
      const current = await tx.legalDocument.findMany({
        where: { status: 'PUBLISHED', effectiveAt: { lte: new Date() } },
        orderBy: [{ type: 'asc' }, { version: 'desc' }],
        distinct: ['type'],
        select: { id: true },
      });
      const requiredIds = current.map((item) => item.id).sort();
      if (
        requiredIds.length !== input.documentIds.length ||
        requiredIds.some((id, index) => id !== [...input.documentIds].sort()[index])
      )
        return false;
      await Promise.all(
        requiredIds.map((legalDocumentId) =>
          tx.userLegalConsent.upsert({
            where: { userId_legalDocumentId: { userId: input.userId, legalDocumentId } },
            create: { userId: input.userId, legalDocumentId },
            update: {},
          }),
        ),
      );
      return true;
    });
  }

  async listConsentCountsForAdmin(actorUserId: string) {
    const admin = await this.client.platformAdmin.findFirst({
      where: { userId: actorUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!admin) return null;
    const rows = await this.client.legalDocument.findMany({
      orderBy: [{ type: 'asc' }, { version: 'desc' }],
      include: { _count: { select: { consents: true } } },
    });
    return rows.map(({ _count, ...row }) => ({
      ...legalDocument(row),
      consentCount: _count.consents,
    }));
  }
}
