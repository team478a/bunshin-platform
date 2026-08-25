import { ApplicationError } from '@bunshin/shared';

export type UserEvidenceType = 'EXPERIENCE' | 'USAGE' | 'RESULT' | 'QUALIFICATION';
export type AdvertisingClassification = 'ORGANIC' | 'PRODUCT_RELATED' | 'ADVERTISEMENT';
export type AdvertisingEvidenceRequirement = 'NONE' | 'PERSONAL_EVIDENCE';

export interface AdvertisingSafetyScope {
  workspaceId: string;
  bunshinId: string;
  actorUserId: string;
}

export interface AdvertisingReviewInput extends AdvertisingSafetyScope {
  dailyMissionId?: string | null;
  productPackVersionId?: string | null;
  classification: AdvertisingClassification;
  evidenceRequirement: AdvertisingEvidenceRequirement;
  evidenceIds: string[];
  officialClaims: Record<string, string>;
  content: string;
}

export interface AdvertisingReviewMaterial {
  productPackVersionId: string | null;
  facts: Record<string, string>;
  rules: Array<{
    type: 'REQUIRED_DISCLOSURE' | 'FORBIDDEN_EXPRESSION' | 'CONDITIONAL_EXPRESSION';
    value: string;
    condition: string | null;
  }>;
  evidenceIds: string[];
}

export interface AdvertisingSafetyRepository {
  hashContent(content: string): string;
  listEvidence(input: AdvertisingSafetyScope): Promise<object[] | null>;
  createEvidence(
    input: AdvertisingSafetyScope & {
      type: UserEvidenceType;
      title: string;
      claim: string;
      sourceUrl: string | null;
      occurredAt: Date | null;
    },
  ): Promise<{ id: string } | null>;
  revokeEvidence(
    input: AdvertisingSafetyScope & { evidenceId: string; revokedAt: Date },
  ): Promise<object | null>;
  prepareReview(
    input: Omit<AdvertisingReviewInput, 'content' | 'officialClaims'>,
  ): Promise<AdvertisingReviewMaterial | null>;
  saveReview(
    input: AdvertisingSafetyScope & {
      dailyMissionId: string | null;
      productPackVersionId: string | null;
      classification: AdvertisingClassification;
      evidenceRequirement: AdvertisingEvidenceRequirement;
      evidenceIds: string[];
      officialClaims: Record<string, string>;
      requiredDisclosures: string[];
      issueCodes: string[];
      verdict: 'PASS' | 'BLOCKED';
      contentHash: string;
    },
  ): Promise<object | null>;
  listReviews(input: AdvertisingSafetyScope): Promise<object[] | null>;
}

const clean = (value: string, field: string, max: number) => {
  const result = value.trim();
  if (!result || result.length > max)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return result;
};

export function inspectAdvertisingContent(input: {
  content: string;
  classification: AdvertisingClassification;
  evidenceRequirement: AdvertisingEvidenceRequirement;
  officialClaims: Record<string, string>;
  material: AdvertisingReviewMaterial;
}) {
  const issueCodes = new Set<string>();
  const requiredDisclosures = new Set<string>();
  if (input.classification === 'ADVERTISEMENT') requiredDisclosures.add('#PR');
  if (input.classification !== 'ORGANIC' && !input.material.productPackVersionId)
    issueCodes.add('PRODUCT_PACK_REQUIRED');
  if (input.evidenceRequirement === 'PERSONAL_EVIDENCE' && input.material.evidenceIds.length === 0)
    issueCodes.add('PERSONAL_EVIDENCE_REQUIRED');

  for (const [key, value] of Object.entries(input.officialClaims)) {
    if (!(key in input.material.facts)) issueCodes.add('UNKNOWN_OFFICIAL_FACT');
    else if (input.material.facts[key] !== value) issueCodes.add('OFFICIAL_FACT_MISMATCH');
  }
  for (const rule of input.material.rules) {
    if (rule.type === 'REQUIRED_DISCLOSURE') requiredDisclosures.add(rule.value);
    if (rule.type === 'FORBIDDEN_EXPRESSION' && input.content.includes(rule.value))
      issueCodes.add('FORBIDDEN_EXPRESSION');
    if (
      rule.type === 'CONDITIONAL_EXPRESSION' &&
      rule.condition &&
      input.content.includes(rule.condition) &&
      !input.content.includes(rule.value)
    )
      issueCodes.add('CONDITIONAL_DISCLOSURE_MISSING');
  }
  for (const disclosure of requiredDisclosures)
    if (!input.content.includes(disclosure)) issueCodes.add('REQUIRED_DISCLOSURE_MISSING');
  return {
    requiredDisclosures: [...requiredDisclosures],
    issueCodes: [...issueCodes],
    verdict: issueCodes.size === 0 ? ('PASS' as const) : ('BLOCKED' as const),
  };
}

export class AdvertisingSafetyService {
  constructor(private readonly repository: AdvertisingSafetyRepository) {}

  async listEvidence(input: AdvertisingSafetyScope) {
    const values = await this.repository.listEvidence(input);
    if (values === null) throw new ApplicationError('NOT_FOUND', 'bunshin unavailable');
    return values;
  }

  async createEvidence(
    input: AdvertisingSafetyScope & {
      type: UserEvidenceType;
      title: string;
      claim: string;
      sourceUrl?: string | null;
      occurredAt?: Date | null;
    },
  ) {
    const value = await this.repository.createEvidence({
      ...input,
      title: clean(input.title, 'title', 160),
      claim: clean(input.claim, 'claim', 1000),
      sourceUrl: input.sourceUrl ?? null,
      occurredAt: input.occurredAt ?? null,
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'bunshin unavailable');
    return value;
  }

  async revokeEvidence(input: AdvertisingSafetyScope & { evidenceId: string }) {
    const value = await this.repository.revokeEvidence({ ...input, revokedAt: new Date() });
    if (!value) throw new ApplicationError('NOT_FOUND', 'evidence unavailable');
    return value;
  }

  async review(input: AdvertisingReviewInput) {
    const { content, material, inspected } = await this.inspect(input);
    const value = await this.repository.saveReview({
      ...input,
      dailyMissionId: input.dailyMissionId ?? null,
      productPackVersionId: material.productPackVersionId,
      evidenceIds: material.evidenceIds,
      requiredDisclosures: inspected.requiredDisclosures,
      issueCodes: inspected.issueCodes,
      verdict: inspected.verdict,
      contentHash: this.repository.hashContent(content),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'review context unavailable');
    return value;
  }

  async inspect(input: AdvertisingReviewInput) {
    const content = clean(input.content, 'content', 20_000);
    if (new Set(input.evidenceIds).size !== input.evidenceIds.length)
      throw new ApplicationError('VALIDATION_ERROR', 'duplicate evidence');
    const material = await this.repository.prepareReview({
      ...input,
      evidenceIds: input.evidenceIds,
    });
    if (!material) throw new ApplicationError('NOT_FOUND', 'review context unavailable');
    return {
      content,
      material,
      inspected: inspectAdvertisingContent({ ...input, content, material }),
    };
  }

  async listReviews(input: AdvertisingSafetyScope) {
    const values = await this.repository.listReviews(input);
    if (values === null) throw new ApplicationError('NOT_FOUND', 'bunshin unavailable');
    return values;
  }
}
