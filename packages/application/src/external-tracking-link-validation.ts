import { ApplicationError } from '@bunshin/shared';
import type {
  AllowedTrackingDomain,
  ExternalTrackingLinkScopeType,
} from './external-tracking-link-types';

export const requiredText = (value: string, field: string, max: number) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

export const optionalText = (value: string | null | undefined, field: string, max: number) => {
  if (value === null || value === undefined || !value.trim()) return null;
  return requiredText(value, field, max);
};

export function normalizeTrackingHostname(value: string) {
  const hostname = value.trim().toLowerCase().replace(/\.$/, '');
  const isIpAddress = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
  if (
    !hostname ||
    hostname.length > 253 ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    isIpAddress ||
    !/^[a-z0-9.-]+$/.test(hostname) ||
    hostname
      .split('.')
      .some((part) => !part || part.length > 63 || part.startsWith('-') || part.endsWith('-'))
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid allowed domain');
  return hostname;
}

const personalQueryKeys = new Set([
  'email',
  'mail',
  'phone',
  'telephone',
  'name',
  'fullname',
  'first_name',
  'last_name',
  'address',
  'customer_name',
]);

export function validateExternalTrackingUrl(value: string, domain: AllowedTrackingDomain) {
  const hasControlCharacter = [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (value.length > 2_048 || hasControlCharacter)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid tracking URL');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid tracking URL');
  }
  const hostname = normalizeTrackingHostname(url.hostname);
  const allowed = normalizeTrackingHostname(domain.hostname);
  const hostMatches =
    hostname === allowed || (domain.allowSubdomains && hostname.endsWith(`.${allowed}`));
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    !hostMatches ||
    domain.status !== 'ACTIVE'
  )
    throw new ApplicationError('VALIDATION_ERROR', 'tracking URL is not allowed');
  for (const key of url.searchParams.keys()) {
    if (personalQueryKeys.has(key.toLowerCase()))
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'personal data is not allowed in tracking URL',
      );
  }
  return url.toString();
}

export function externalTrackingScopeKey(input: {
  scopeType: ExternalTrackingLinkScopeType;
  memberIdentityId?: string | null;
  productPackId?: string | null;
  campaignId?: string | null;
}) {
  const member = input.memberIdentityId ?? null;
  const product = input.productPackId ?? null;
  const campaign = input.campaignId ?? null;
  const invalid = () => new ApplicationError('VALIDATION_ERROR', 'invalid tracking link scope');
  switch (input.scopeType) {
    case 'GROUP':
      if (member || product || campaign) throw invalid();
      return 'GROUP';
    case 'MEMBER':
      if (!member || product || campaign) throw invalid();
      return `MEMBER:${member}`;
    case 'PRODUCT':
      if (member || !product || campaign) throw invalid();
      return `PRODUCT:${product}`;
    case 'CAMPAIGN':
      if (member || product || !campaign) throw invalid();
      return `CAMPAIGN:${campaign}`;
    case 'PRODUCT_MEMBER':
      if (!member || !product || campaign) throw invalid();
      return `PRODUCT_MEMBER:${product}:${member}`;
    case 'CAMPAIGN_MEMBER':
      if (!member || product || !campaign) throw invalid();
      return `CAMPAIGN_MEMBER:${campaign}:${member}`;
  }
}
