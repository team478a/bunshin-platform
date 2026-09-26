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
  name: string;
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
  listConfiguration(
    input: ExternalTrackingAdminScope & { groupId: string; at: Date },
  ): Promise<object | null>;
  getAllowedDomain(
    input: ExternalTrackingAdminScope & { allowedDomainId: string },
  ): Promise<AllowedTrackingDomain | null>;
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
  updateLink(
    input: ExternalTrackingAdminScope & {
      linkId: string;
      name: string;
      allowedDomainId: string;
      url: string;
      startsAt: Date | null;
      expiresAt: Date | null;
      notes: string | null;
      now: Date;
    },
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

export interface MemberTrackingLinkSettings {
  systems: Array<{
    id: string;
    name: string;
    domains: AllowedTrackingDomain[];
  }>;
  links: Array<{
    id: string;
    systemId: string;
    systemName: string;
    allowedDomainId: string;
    url: string;
    status: ExternalTrackingLinkStatus;
    updatedAt: Date;
  }>;
}

export interface ExternalTrackingMemberLinkRepository {
  listMemberSettings(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
  }): Promise<MemberTrackingLinkSettings | null>;
  saveMemberDraft(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    systemId: string;
    allowedDomainId: string;
    url: string;
    now: Date;
  }): Promise<object | null>;
}
