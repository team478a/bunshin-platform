import { ApplicationError } from '@bunshin/shared';

export const MEMBER_PRODUCT_CONTENT_PLATFORMS = ['INSTAGRAM', 'X', 'THREADS'] as const;
export type MemberProductContentPlatform = (typeof MEMBER_PRODUCT_CONTENT_PLATFORMS)[number];

const limits: Record<MemberProductContentPlatform, number> = {
  INSTAGRAM: 2_200,
  X: 280,
  THREADS: 500,
};

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
  const productName = requiredText(input.productName, 'product name', 100);
  const appealPoint = requiredText(input.appealPoint, 'appeal point', 280);
  const targetAudience = optionalText(input.targetAudience, 120);
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
