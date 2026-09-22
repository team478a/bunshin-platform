import { ApplicationError } from '@bunshin/shared';

export const LEGAL_DOCUMENT_TYPES = ['TERMS', 'PRIVACY', 'COMMERCE_DISCLOSURE'] as const;
export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number];
export type LegalDocumentStatus = 'DRAFT' | 'PUBLISHED' | 'RETIRED';
export interface LegalDocument {
  id: string;
  type: LegalDocumentType;
  version: number;
  title: string;
  content: string;
  status: LegalDocumentStatus;
  effectiveAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface LegalDocumentRepository {
  listForAdmin(actorUserId: string): Promise<LegalDocument[] | null>;
  createDraft(input: {
    actorUserId: string;
    type: LegalDocumentType;
    title: string;
    content: string;
  }): Promise<LegalDocument | null>;
  publish(input: {
    actorUserId: string;
    documentId: string;
    effectiveAt: Date;
  }): Promise<LegalDocument | null>;
  findPublished(type: LegalDocumentType): Promise<LegalDocument | null>;
}
export class ListLegalDocuments {
  constructor(private readonly repository: LegalDocumentRepository) {}
  async execute(actorUserId: string) {
    const values = await this.repository.listForAdmin(actorUserId);
    if (values === null) throw new ApplicationError('NOT_FOUND', 'admin page not found');
    return values;
  }
}

export const PRODUCTION_GATE_CHECK_KEYS = [
  'BACKUP_RESTORE',
  'MIGRATION_HEALTH',
  'AUTH_SMOKE',
  'FREE_MVP_SMOKE',
  'ACCOUNT_DELETION_DRY_RUN',
  'LINE_GO_NO_GO',
  'TREND_RESEARCH_SMOKE',
  'EXTERNAL_TRACKING_SMOKE',
  'DAILY_MISSION_LINE_SMOKE',
  'TRACKING_LINK_NOTIFICATION_SMOKE',
  'REFERRAL_SHARE_SMOKE',
  'DUPLICATE_PREVENTION_SMOKE',
  'FINAL_APPROVAL',
] as const;
export type ProductionGateCheckKey = (typeof PRODUCTION_GATE_CHECK_KEYS)[number];
export const PRODUCTION_GATE_REQUIRED_CHECK_KEYS = PRODUCTION_GATE_CHECK_KEYS.filter(
  (key) => key !== 'FINAL_APPROVAL',
);
export interface ProductionGateEvidence {
  id: string;
  environment: 'PRODUCTION';
  checkKey: ProductionGateCheckKey;
  commitSha: string;
  action: 'RECORDED' | 'REVOKED';
  reason: string;
  evidenceUrl: string | null;
  actorUserId: string;
  occurredAt: Date;
}
export function currentProductionGateRecordedChecks(
  events: ReadonlyArray<
    Pick<ProductionGateEvidence, 'checkKey' | 'action'> & { occurredAt: Date | string }
  >,
) {
  const latest = new Map(events.map((event) => [event.checkKey, event] as const));
  const recorded = new Set(
    [...latest].filter(([, event]) => event.action === 'RECORDED').map(([checkKey]) => checkKey),
  );
  const finalApproval = latest.get('FINAL_APPROVAL');
  const finalApprovalTime = finalApproval ? new Date(finalApproval.occurredAt).getTime() : 0;
  const finalApprovalIsCurrent =
    finalApproval?.action === 'RECORDED' &&
    Number.isFinite(finalApprovalTime) &&
    PRODUCTION_GATE_REQUIRED_CHECK_KEYS.every((checkKey) => {
      const event = latest.get(checkKey);
      return (
        event?.action === 'RECORDED' && new Date(event.occurredAt).getTime() <= finalApprovalTime
      );
    });
  if (!finalApprovalIsCurrent) recorded.delete('FINAL_APPROVAL');
  return recorded;
}
export interface ProductionGateEvidenceRepository {
  list(input: {
    actorUserId: string;
    environment: 'PRODUCTION';
    commitSha: string;
  }): Promise<ProductionGateEvidence[] | null>;
  append(
    input: Omit<ProductionGateEvidence, 'id' | 'occurredAt'>,
  ): Promise<ProductionGateEvidence | null>;
}

function validProductionCommit(commitSha: string) {
  return /^[0-9a-f]{40}$/.test(commitSha);
}
function validatedEvidenceUrl(value: string | null | undefined) {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid evidence URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid evidence URL');
  if (
    !['github.com', 'vercel.com', 'supabase.com'].some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    )
  )
    throw new ApplicationError('VALIDATION_ERROR', 'evidence URL is not allowed');
  return url.toString();
}
export class ListProductionGateEvidence {
  constructor(private readonly repository: ProductionGateEvidenceRepository) {}
  async execute(input: { actorUserId: string; environment: 'PRODUCTION'; commitSha: string }) {
    if (!validProductionCommit(input.commitSha))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid commit SHA');
    const events = await this.repository.list(input);
    if (!events) throw new ApplicationError('NOT_FOUND', 'admin page not found');
    return events;
  }
}
export class RecordProductionGateEvidence {
  constructor(private readonly repository: ProductionGateEvidenceRepository) {}
  async execute(input: {
    actorUserId: string;
    environment: 'PRODUCTION';
    commitSha: string;
    checkKey: ProductionGateCheckKey;
    action: 'RECORDED' | 'REVOKED';
    reason: string;
    evidenceUrl?: string | null;
  }) {
    const reason = input.reason.trim();
    if (
      !validProductionCommit(input.commitSha) ||
      !PRODUCTION_GATE_CHECK_KEYS.includes(input.checkKey)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid production gate evidence');
    if (reason.length < 10 || reason.length > 1000)
      throw new ApplicationError('VALIDATION_ERROR', 'reason must be 10 to 1000 characters');
    const result = await this.repository.append({
      ...input,
      reason,
      evidenceUrl: validatedEvidenceUrl(input.evidenceUrl),
    });
    if (!result)
      throw new ApplicationError(
        input.checkKey === 'FINAL_APPROVAL' ? 'CONFLICT' : 'NOT_FOUND',
        input.checkKey === 'FINAL_APPROVAL'
          ? 'all required checks must be current before final approval'
          : 'admin page not found',
      );
    return result;
  }
}
export class CreateLegalDocumentDraft {
  constructor(private readonly repository: LegalDocumentRepository) {}
  async execute(input: {
    actorUserId: string;
    type: LegalDocumentType;
    title: string;
    content: string;
  }) {
    const title = input.title.trim();
    const content = input.content.trim();
    if (!LEGAL_DOCUMENT_TYPES.includes(input.type) || title.length < 1 || title.length > 200)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid legal document title');
    if (content.length < 1 || content.length > 100_000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid legal document content');
    const value = await this.repository.createDraft({ ...input, title, content });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'admin page not found');
    return value;
  }
}
export class PublishLegalDocument {
  constructor(private readonly repository: LegalDocumentRepository) {}
  async execute(input: { actorUserId: string; documentId: string; effectiveAt: Date }) {
    if (Number.isNaN(input.effectiveAt.getTime()))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid effective date');
    const value = await this.repository.publish(input);
    if (value === null) throw new ApplicationError('NOT_FOUND', 'legal document not found');
    return value;
  }
}

export interface RequiredLegalConsentDocument extends LegalDocument {
  consentedAt: Date | null;
}
export interface LegalConsentRepository {
  findRequiredForUser(userId: string): Promise<RequiredLegalConsentDocument[]>;
  acceptRequired(input: { userId: string; documentIds: string[] }): Promise<boolean>;
  listConsentCountsForAdmin(
    actorUserId: string,
  ): Promise<Array<LegalDocument & { consentCount: number }> | null>;
}
export class GetRequiredLegalConsents {
  constructor(private readonly repository: LegalConsentRepository) {}
  execute(userId: string) {
    return this.repository.findRequiredForUser(userId);
  }
}
export class AcceptRequiredLegalConsents {
  constructor(private readonly repository: LegalConsentRepository) {}
  async execute(input: { userId: string; documentIds: string[] }) {
    if (
      input.documentIds.length === 0 ||
      input.documentIds.length > LEGAL_DOCUMENT_TYPES.length ||
      new Set(input.documentIds).size !== input.documentIds.length
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid legal consent documents');
    const accepted = await this.repository.acceptRequired(input);
    if (!accepted) throw new ApplicationError('CONFLICT', 'legal documents changed; review again');
  }
}
export class ListLegalConsentCounts {
  constructor(private readonly repository: LegalConsentRepository) {}
  async execute(actorUserId: string) {
    const values = await this.repository.listConsentCountsForAdmin(actorUserId);
    if (!values) throw new ApplicationError('NOT_FOUND', 'admin page not found');
    return values;
  }
}
