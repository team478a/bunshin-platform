import { ApplicationError } from '@bunshin/shared';

export const MEMBER_PRODUCT_CONTENT_PLATFORMS = ['INSTAGRAM', 'X', 'THREADS'] as const;
export type MemberProductContentPlatform = (typeof MEMBER_PRODUCT_CONTENT_PLATFORMS)[number];

export interface MemberProductProfileRecord {
  id: string;
  externalTrackingLinkId: string;
  externalTrackingSystemName: string;
  productPackId: string | null;
  productPackName: string | null;
  name: string;
  appealPoint: string;
  targetAudience: string | null;
  updatedAt: Date;
}

export interface MemberProductOfficialContext {
  name: string;
  summary: string;
  providerName: string;
  targetCustomer: string;
  facts: unknown;
  suitableFor: string[];
  unsuitableFor: string[];
  requiredDisclosures: string[];
  forbiddenExpressions: string[];
  conditionalExpressions: Array<{ value: string; condition: string | null }>;
}

export interface MemberProductGenerationContext {
  id: string;
  externalTrackingLinkId: string;
  productPackId: string | null;
  name: string;
  appealPoint: string;
  targetAudience: string | null;
  officialProduct: MemberProductOfficialContext | null;
}

export interface MemberProductMasterOption {
  id: string;
  name: string;
}

export interface MemberProductProfileRepository {
  list(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
  }): Promise<MemberProductProfileRecord[] | null>;
  listProductMasters(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
  }): Promise<MemberProductMasterOption[] | null>;
  getGenerationContext(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    profileId: string;
    now: Date;
  }): Promise<MemberProductGenerationContext | null>;
  save(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    profileId: string | null;
    externalTrackingLinkId: string;
    productPackId: string | null;
    name: string;
    appealPoint: string;
    targetAudience: string | null;
    now: Date;
  }): Promise<MemberProductProfileRecord | null>;
  archive(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    profileId: string;
    now: Date;
  }): Promise<boolean | null>;
}

const limits: Record<MemberProductContentPlatform, number> = {
  INSTAGRAM: 2_200,
  X: 280,
  THREADS: 500,
};

export function finalizeMemberProductCandidate(input: {
  draft: string;
  approvedUrl: string;
  platform: MemberProductContentPlatform;
  requiredDisclosures?: string[] | undefined;
  forbiddenExpressions?: string[] | undefined;
}) {
  const draft = input.draft.replace(/\r\n/g, '\n').trim();
  if (!draft || draft.length > 4_000)
    throw new ApplicationError('CONTENT_REJECTED', 'invalid member product candidate');
  if (/https?:\/\//iu.test(draft))
    throw new ApplicationError('CONTENT_REJECTED', 'unapproved URL in member product candidate');
  const forbiddenExpressions = normalizeRules(input.forbiddenExpressions);
  const lowerDraft = draft.toLocaleLowerCase('ja-JP');
  if (forbiddenExpressions.some((value) => lowerDraft.includes(value.toLocaleLowerCase('ja-JP'))))
    throw new ApplicationError(
      'CONTENT_REJECTED',
      'forbidden expression in member product candidate',
    );
  const requiredDisclosures = normalizeRules(input.requiredDisclosures);
  const url = approvedMemberUrl(input.approvedUrl);
  const disclosureSuffix = requiredDisclosures.length ? `${requiredDisclosures.join('\n')}\n` : '';
  const suffix = `\n\n${disclosureSuffix}#PR\n${url}`;
  const characterLimit = limits[input.platform];
  const available = characterLimit - suffix.length;
  if (available < 1)
    throw new ApplicationError('CONTENT_REJECTED', 'member product URL exceeds platform limit');
  const text = requiredDisclosures
    .reduce((value, disclosure) => value.split(disclosure).join(''), draft)
    .replace(/(^|\s)#PR(?=\s|$)/giu, '$1')
    .trim();
  if (!text) throw new ApplicationError('CONTENT_REJECTED', 'empty member product candidate');
  const body = `${text.slice(0, available).trim()}${suffix}`;
  return {
    platform: input.platform,
    body,
    approvedUrl: url,
    disclosure: '#PR' as const,
    characterCount: body.length,
    characterLimit,
  };
}

function requiredText(value: string, field: string, maximum: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > maximum)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
}

function optionalText(value: string | null | undefined, maximum: number) {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? '';
  if (normalized.length > maximum)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid target audience');
  return normalized;
}

function approvedMemberUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid member product URL');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid member product URL');
  return parsed.toString();
}

export function createMemberProductContent(input: {
  productName: string;
  appealPoint: string;
  targetAudience?: string | null | undefined;
  approvedUrl: string;
  platform: MemberProductContentPlatform;
}) {
  const productName = requiredText(input.productName, 'product name', 160);
  const appealPoint = requiredText(input.appealPoint, 'appeal point', 1_000);
  const targetAudience = optionalText(input.targetAudience, 500);
  const url = approvedMemberUrl(input.approvedUrl);
  const suffix = `\n\n#PR\n${url}`;
  const lead = `${productName}についてご紹介します。\n${appealPoint}${
    targetAudience ? `\n${targetAudience}におすすめしたい内容です。` : ''
  }`;
  const characterLimit = limits[input.platform];
  const available = characterLimit - suffix.length;
  if (available < 1)
    throw new ApplicationError('CONTENT_REJECTED', 'member product URL exceeds platform limit');
  const body = `${lead.slice(0, available).trim()}${suffix}`;

  return {
    platform: input.platform,
    body,
    approvedUrl: url,
    disclosure: '#PR' as const,
    characterCount: body.length,
    characterLimit,
  };
}

export class MemberProductProfileService {
  constructor(private readonly repository: MemberProductProfileRepository) {}

  async list(input: { workspaceId: string; groupId: string; actorUserId: string }) {
    const profiles = await this.repository.list(input);
    if (!profiles) throw new ApplicationError('NOT_FOUND', 'service membership unavailable');
    return profiles;
  }

  async listProductMasters(input: { workspaceId: string; groupId: string; actorUserId: string }) {
    const products = await this.repository.listProductMasters(input);
    if (!products) throw new ApplicationError('NOT_FOUND', 'service membership unavailable');
    return products;
  }

  async getGenerationContext(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    profileId: string;
  }) {
    const context = await this.repository.getGenerationContext({
      ...input,
      profileId: requiredText(input.profileId, 'member product profile id', 100),
      now: new Date(),
    });
    if (!context)
      throw new ApplicationError('NOT_FOUND', 'active member product profile unavailable');
    return context;
  }

  async save(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    profileId?: string | null | undefined;
    externalTrackingLinkId: string;
    productPackId?: string | null | undefined;
    name: string;
    appealPoint: string;
    targetAudience?: string | null | undefined;
  }) {
    const saved = await this.repository.save({
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      actorUserId: input.actorUserId,
      profileId: input.profileId
        ? requiredText(input.profileId, 'member product profile id', 100)
        : null,
      externalTrackingLinkId: requiredText(
        input.externalTrackingLinkId,
        'external tracking link id',
        100,
      ),
      productPackId: input.productPackId
        ? requiredText(input.productPackId, 'product pack id', 100)
        : null,
      name: requiredText(input.name, 'product name', 160),
      appealPoint: requiredText(input.appealPoint, 'appeal point', 1_000),
      targetAudience: optionalText(input.targetAudience, 500) || null,
      now: new Date(),
    });
    if (!saved) throw new ApplicationError('NOT_FOUND', 'active member URL unavailable');
    return saved;
  }

  async archive(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    profileId: string;
  }) {
    const archived = await this.repository.archive({
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      actorUserId: input.actorUserId,
      profileId: requiredText(input.profileId, 'member product profile id', 100),
      now: new Date(),
    });
    if (archived === null)
      throw new ApplicationError('NOT_FOUND', 'member product profile unavailable');
    return { archived };
  }
}

function normalizeRules(values: string[] | undefined) {
  const normalized = [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
  if (normalized.length > 20 || normalized.some((value) => value.length > 1_000))
    throw new ApplicationError('CONTENT_REJECTED', 'invalid product rule');
  return normalized;
}
