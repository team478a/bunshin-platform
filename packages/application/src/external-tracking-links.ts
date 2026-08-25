import { ApplicationError } from '@bunshin/shared';

export type ExternalTrackingLinkScopeType =
  'GROUP' | 'MEMBER' | 'PRODUCT' | 'CAMPAIGN' | 'PRODUCT_MEMBER' | 'CAMPAIGN_MEMBER';
export type ExternalTrackingLinkStatus = 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'DELETED';

export interface ExternalTrackingAdminScope {
  workspaceId: string;
  actorUserId: string;
}

export interface AllowedTrackingDomain {
  id: string;
  hostname: string;
  allowSubdomains: boolean;
  shortener: boolean;
  status: 'ACTIVE' | 'SUSPENDED';
}

export interface ExternalTrackingLinkCandidate {
  id: string;
  groupId: string;
  scopeType: ExternalTrackingLinkScopeType;
  groupMembershipId: string | null;
  productPackId: string | null;
  campaignId: string | null;
  url: string;
  status: ExternalTrackingLinkStatus;
  startsAt: Date | null;
  expiresAt: Date | null;
  systemStatus: 'ACTIVE' | 'SUSPENDED';
  domain: AllowedTrackingDomain;
}

export interface ExternalTrackingLinkRepository {
  createSystem(
    input: ExternalTrackingAdminScope & {
      groupId: string;
      name: string;
      systemType: string;
      externalSystemId: string | null;
    },
  ): Promise<object | null>;
  addAllowedDomain(
    input: ExternalTrackingAdminScope & {
      systemId: string;
      hostname: string;
      allowSubdomains: boolean;
      shortener: boolean;
    },
  ): Promise<object | null>;
  upsertMemberIdentity(
    input: ExternalTrackingAdminScope & {
      systemId: string;
      groupMembershipId: string;
      commonUserId: string | null;
      agencyId: string | null;
      externalMemberId: string | null;
    },
  ): Promise<object | null>;
  createLink(
    input: ExternalTrackingAdminScope & {
      systemId: string;
      allowedDomainId: string;
      memberIdentityId: string | null;
      productPackId: string | null;
      campaignId: string | null;
      scopeType: ExternalTrackingLinkScopeType;
      scopeKey: string;
      name: string;
      externalLinkId: string | null;
      referralToken: string | null;
      url: string;
      startsAt: Date | null;
      expiresAt: Date | null;
      notes: string | null;
    },
  ): Promise<object | null>;
  activateLink(
    input: ExternalTrackingAdminScope & { linkId: string; now: Date },
  ): Promise<object | null>;
  suspendLink(
    input: ExternalTrackingAdminScope & { linkId: string; now: Date },
  ): Promise<object | null>;
  listResolutionCandidates(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    groupId: string;
    productPackId: string;
    campaignId: string | null;
    at: Date;
  }): Promise<{
    groupMembershipId: string;
    links: ExternalTrackingLinkCandidate[];
  } | null>;
}

const requiredText = (value: string, field: string, max: number) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

const optionalText = (value: string | null | undefined, field: string, max: number) => {
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

export class ExternalTrackingLinkService {
  constructor(private readonly repository: ExternalTrackingLinkRepository) {}

  private result<T extends object>(value: T | null, message: string): T {
    if (!value) throw new ApplicationError('NOT_FOUND', message);
    return value;
  }

  createSystem(
    input: ExternalTrackingAdminScope & {
      groupId: string;
      name: string;
      systemType: string;
      externalSystemId?: string | null;
    },
  ) {
    return this.repository
      .createSystem({
        ...input,
        name: requiredText(input.name, 'name', 160),
        systemType: requiredText(input.systemType, 'systemType', 80),
        externalSystemId: optionalText(input.externalSystemId, 'externalSystemId', 255),
      })
      .then((value) => this.result(value, 'group unavailable'));
  }

  addAllowedDomain(
    input: ExternalTrackingAdminScope & {
      systemId: string;
      hostname: string;
      allowSubdomains?: boolean;
      shortener?: boolean;
    },
  ) {
    return this.repository
      .addAllowedDomain({
        ...input,
        hostname: normalizeTrackingHostname(input.hostname),
        allowSubdomains: input.allowSubdomains ?? false,
        shortener: input.shortener ?? false,
      })
      .then((value) => this.result(value, 'tracking system unavailable'));
  }

  upsertMemberIdentity(
    input: ExternalTrackingAdminScope & {
      systemId: string;
      groupMembershipId: string;
      commonUserId?: string | null;
      agencyId?: string | null;
      externalMemberId?: string | null;
    },
  ) {
    return this.repository
      .upsertMemberIdentity({
        ...input,
        commonUserId: optionalText(input.commonUserId, 'commonUserId', 255),
        agencyId: optionalText(input.agencyId, 'agencyId', 255),
        externalMemberId: optionalText(input.externalMemberId, 'externalMemberId', 255),
      })
      .then((value) => this.result(value, 'group member unavailable'));
  }

  async createLink(
    input: ExternalTrackingAdminScope & {
      systemId: string;
      allowedDomain: AllowedTrackingDomain;
      memberIdentityId?: string | null;
      productPackId?: string | null;
      campaignId?: string | null;
      scopeType: ExternalTrackingLinkScopeType;
      name: string;
      externalLinkId?: string | null;
      referralToken?: string | null;
      url: string;
      startsAt?: Date | null;
      expiresAt?: Date | null;
      notes?: string | null;
    },
  ) {
    if (input.startsAt && input.expiresAt && input.startsAt >= input.expiresAt)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid tracking link validity');
    const scopeKey = externalTrackingScopeKey(input);
    return this.result(
      await this.repository.createLink({
        ...input,
        allowedDomainId: input.allowedDomain.id,
        memberIdentityId: input.memberIdentityId ?? null,
        productPackId: input.productPackId ?? null,
        campaignId: input.campaignId ?? null,
        scopeKey,
        name: requiredText(input.name, 'name', 160),
        externalLinkId: optionalText(input.externalLinkId, 'externalLinkId', 255),
        referralToken: optionalText(input.referralToken, 'referralToken', 500),
        url: validateExternalTrackingUrl(input.url, input.allowedDomain),
        startsAt: input.startsAt ?? null,
        expiresAt: input.expiresAt ?? null,
        notes: optionalText(input.notes, 'notes', 1000),
      }),
      'tracking link scope unavailable',
    );
  }

  activateLink(input: ExternalTrackingAdminScope & { linkId: string }) {
    return this.repository
      .activateLink({ ...input, now: new Date() })
      .then((value) => this.result(value, 'tracking link unavailable'));
  }

  suspendLink(input: ExternalTrackingAdminScope & { linkId: string }) {
    return this.repository
      .suspendLink({ ...input, now: new Date() })
      .then((value) => this.result(value, 'tracking link unavailable'));
  }

  async resolve(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    groupId: string;
    productPackId: string;
    campaignId?: string | null;
    at?: Date;
  }) {
    const at = input.at ?? new Date();
    const resolution = await this.repository.listResolutionCandidates({
      ...input,
      campaignId: input.campaignId ?? null,
      at,
    });
    if (!resolution) throw new ApplicationError('NOT_FOUND', 'tracking link context unavailable');
    return selectExternalTrackingLink({
      groupId: input.groupId,
      groupMembershipId: resolution.groupMembershipId,
      productPackId: input.productPackId,
      campaignId: input.campaignId ?? null,
      at,
      links: resolution.links,
    });
  }
}
