import { ApplicationError } from '@bunshin/shared';

export const SERVICE_REFERRAL_CONTENT_DISCLOSURE = '#PR';

export const SERVICE_REFERRAL_CONTENT_PLATFORMS = ['INSTAGRAM', 'X', 'THREADS'] as const;
export type ServiceReferralContentPlatform = (typeof SERVICE_REFERRAL_CONTENT_PLATFORMS)[number];

const limits: Record<ServiceReferralContentPlatform, number> = {
  INSTAGRAM: 2_200,
  X: 280,
  THREADS: 500,
};

function normalizedSingleLine(value: string, maximum: number) {
  return value.replace(/\s+/g, ' ').trim().slice(0, maximum);
}

export function createServiceReferralContent(input: {
  serviceName: string;
  serviceDescription?: string | null | undefined;
  referralUrl: string;
  platform: ServiceReferralContentPlatform;
}) {
  const serviceName = normalizedSingleLine(input.serviceName, 100);
  if (!serviceName) throw new ApplicationError('VALIDATION_ERROR', 'service name is required');

  let parsed: URL;
  try {
    parsed = new URL(input.referralUrl);
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid service referral URL');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    !/^\/r\/[A-Z0-9]+$/.test(parsed.pathname)
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid service referral URL');

  parsed.searchParams.set('source', 'member_share');
  parsed.searchParams.set('content', input.platform.toLowerCase());
  const trackedUrl = parsed.toString();
  const description = normalizedSingleLine(input.serviceDescription ?? '', 160);
  const introduction = description
    ? `${serviceName}をご紹介します。\n${description}`
    : `${serviceName}をご紹介します。`;
  const suffix = `\n\n${SERVICE_REFERRAL_CONTENT_DISCLOSURE}\n${trackedUrl}`;
  const maximum = limits[input.platform];
  const available = maximum - suffix.length;
  if (available < 1)
    throw new ApplicationError('CONTENT_REJECTED', 'service referral URL exceeds platform limit');
  const body = `${introduction.slice(0, available).trim()}${suffix}`;

  return {
    platform: input.platform,
    body,
    referralUrl: trackedUrl,
    disclosure: SERVICE_REFERRAL_CONTENT_DISCLOSURE,
    characterCount: body.length,
    characterLimit: maximum,
  };
}
