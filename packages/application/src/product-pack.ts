import { ApplicationError } from '@bunshin/shared';

export type ProductPackRuleType =
  'REQUIRED_DISCLOSURE' | 'FORBIDDEN_EXPRESSION' | 'CONDITIONAL_EXPRESSION';
export type ProductPackAssetType = 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LINK';

export interface ProductPackScope {
  workspaceId: string;
  actorUserId: string;
}

export interface ProductPackVersionInput {
  summary: string;
  providerName: string;
  targetCustomer: string;
  facts: Record<string, string>;
  faq: Array<{ question: string; answer: string }>;
  suitableFor: string[];
  unsuitableFor: string[];
  validFrom?: Date | null;
  validUntil?: Date | null;
  rules: Array<{ type: ProductPackRuleType; value: string; condition?: string | null }>;
  assets: Array<{
    type: ProductPackAssetType;
    url: string;
    label: string;
    usageTerms: string;
    validUntil?: Date | null;
  }>;
}

export interface ProductPackRepository {
  createPack(input: ProductPackScope & { groupId: string; name: string }): Promise<object | null>;
  createDraftVersion(
    input: ProductPackScope & { productPackId: string; content: ProductPackVersionInput },
  ): Promise<object | null>;
  publishVersion(
    input: ProductPackScope & { productPackId: string; versionId: string; publishedAt: Date },
  ): Promise<object | null>;
  assign(
    input: ProductPackScope & {
      productPackId: string;
      versionId: string;
      bunshinId: string;
      consentedAt: Date;
    },
  ): Promise<object | null>;
  revokeAssignment(
    input: ProductPackScope & { assignmentId: string; revokedAt: Date },
  ): Promise<object | null>;
  resolveForGeneration(input: ProductPackScope & { bunshinId: string; at: Date }): Promise<{
    productPackId: string;
    versionId: string;
    version: number;
  } | null>;
}

const text = (value: string, field: string, max: number) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

export class ProductPackService {
  constructor(private readonly repository: ProductPackRepository) {}

  private result<T extends object>(value: T | null, message: string): T {
    if (value === null) throw new ApplicationError('NOT_FOUND', message);
    return value;
  }

  async createPack(input: ProductPackScope & { groupId: string; name: string }) {
    return this.result(
      await this.repository.createPack({ ...input, name: text(input.name, 'name', 160) }),
      'group unavailable',
    );
  }

  async createDraftVersion(
    input: ProductPackScope & { productPackId: string; content: ProductPackVersionInput },
  ) {
    const { content } = input;
    if (Object.keys(content.facts).length === 0)
      throw new ApplicationError('VALIDATION_ERROR', 'facts required');
    if (content.validFrom && content.validUntil && content.validFrom >= content.validUntil)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid validity');
    const normalized: ProductPackVersionInput = {
      ...content,
      summary: text(content.summary, 'summary', 1000),
      providerName: text(content.providerName, 'providerName', 200),
      targetCustomer: text(content.targetCustomer, 'targetCustomer', 1000),
      facts: Object.fromEntries(
        Object.entries(content.facts).map(([key, value]) => [
          text(key, 'fact key', 100),
          text(value, 'fact value', 2000),
        ]),
      ),
    };
    return this.result(
      await this.repository.createDraftVersion({ ...input, content: normalized }),
      'product pack unavailable',
    );
  }

  async publishVersion(input: ProductPackScope & { productPackId: string; versionId: string }) {
    return this.result(
      await this.repository.publishVersion({ ...input, publishedAt: new Date() }),
      'draft version unavailable',
    );
  }

  async assign(
    input: ProductPackScope & { productPackId: string; versionId: string; bunshinId: string },
  ) {
    return this.result(
      await this.repository.assign({ ...input, consentedAt: new Date() }),
      'published pack or consent unavailable',
    );
  }

  async revokeAssignment(input: ProductPackScope & { assignmentId: string }) {
    return this.result(
      await this.repository.revokeAssignment({ ...input, revokedAt: new Date() }),
      'assignment unavailable',
    );
  }

  resolveForGeneration(input: ProductPackScope & { bunshinId: string; at?: Date }) {
    return this.repository.resolveForGeneration({ ...input, at: input.at ?? new Date() });
  }
}
