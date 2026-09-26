import { ApplicationError } from '@bunshin/shared';
import type {
  ExternalTrackingLinkCandidate,
  ExternalTrackingLinkScopeType,
} from './external-tracking-link-types';
import { validateExternalTrackingUrl } from './external-tracking-link-validation';

const priority: ExternalTrackingLinkScopeType[] = [
  'CAMPAIGN_MEMBER',
  'PRODUCT_MEMBER',
  'MEMBER',
  'CAMPAIGN',
  'PRODUCT',
  'GROUP',
];

export function selectExternalTrackingLink(input: {
  groupId: string;
  groupMembershipId: string;
  productPackId: string;
  campaignId: string | null;
  at: Date;
  links: ExternalTrackingLinkCandidate[];
}) {
  const eligible = input.links.filter((link) => {
    if (
      link.groupId !== input.groupId ||
      link.status !== 'ACTIVE' ||
      link.systemStatus !== 'ACTIVE' ||
      link.domain.status !== 'ACTIVE' ||
      (link.startsAt && link.startsAt > input.at) ||
      (link.expiresAt && link.expiresAt <= input.at)
    )
      return false;
    const memberMatches = link.groupMembershipId === input.groupMembershipId;
    switch (link.scopeType) {
      case 'GROUP':
        return true;
      case 'MEMBER':
        return memberMatches;
      case 'PRODUCT':
        return link.productPackId === input.productPackId;
      case 'CAMPAIGN':
        return Boolean(input.campaignId) && link.campaignId === input.campaignId;
      case 'PRODUCT_MEMBER':
        return memberMatches && link.productPackId === input.productPackId;
      case 'CAMPAIGN_MEMBER':
        return Boolean(input.campaignId) && memberMatches && link.campaignId === input.campaignId;
    }
  });
  for (const scopeType of priority) {
    const matches = eligible.filter((link) => link.scopeType === scopeType);
    if (matches.length > 1)
      throw new ApplicationError('CONFLICT', 'multiple tracking links have the same priority');
    if (matches[0])
      return { ...matches[0], url: validateExternalTrackingUrl(matches[0].url, matches[0].domain) };
  }
  return null;
}
