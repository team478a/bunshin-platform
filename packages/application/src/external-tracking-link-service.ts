import { ApplicationError } from '@bunshin/shared';
import type {
  ExternalTrackingAdminScope,
  ExternalTrackingLinkScopeType,
  ExternalTrackingLinkRepository,
} from './external-tracking-link-types';
import { selectExternalTrackingLink } from './external-tracking-link-selection';
import {
  externalTrackingScopeKey,
  normalizeTrackingHostname,
  optionalText,
  requiredText,
  validateExternalTrackingUrl,
} from './external-tracking-link-validation';

export class ExternalTrackingLinkService {
  constructor(private readonly repository: ExternalTrackingLinkRepository) {}

  private result<T extends object>(value: T | null, message: string): T {
    if (!value) throw new ApplicationError('NOT_FOUND', message);
    return value;
  }

  listConfiguration(input: ExternalTrackingAdminScope & { groupId: string; at?: Date }) {
    return this.repository
      .listConfiguration({ ...input, at: input.at ?? new Date() })
      .then((value) => this.result(value, 'group unavailable'));
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
      allowedDomainId: string;
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
    const allowedDomain = await this.repository.getAllowedDomain({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      allowedDomainId: input.allowedDomainId,
    });
    if (!allowedDomain) throw new ApplicationError('NOT_FOUND', 'allowed domain unavailable');
    return this.result(
      await this.repository.createLink({
        ...input,
        memberIdentityId: input.memberIdentityId ?? null,
        productPackId: input.productPackId ?? null,
        campaignId: input.campaignId ?? null,
        scopeKey,
        name: requiredText(input.name, 'name', 160),
        externalLinkId: optionalText(input.externalLinkId, 'externalLinkId', 255),
        referralToken: optionalText(input.referralToken, 'referralToken', 500),
        url: validateExternalTrackingUrl(input.url, allowedDomain),
        startsAt: input.startsAt ?? null,
        expiresAt: input.expiresAt ?? null,
        notes: optionalText(input.notes, 'notes', 1000),
      }),
      'tracking link scope unavailable',
    );
  }

  async updateLink(
    input: ExternalTrackingAdminScope & {
      linkId: string;
      allowedDomainId: string;
      name: string;
      url: string;
      startsAt?: Date | null;
      expiresAt?: Date | null;
      notes?: string | null;
    },
  ) {
    if (input.startsAt && input.expiresAt && input.startsAt >= input.expiresAt)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid tracking link validity');
    const allowedDomain = await this.repository.getAllowedDomain(input);
    if (!allowedDomain) throw new ApplicationError('NOT_FOUND', 'allowed domain unavailable');
    return this.result(
      await this.repository.updateLink({
        ...input,
        name: requiredText(input.name, 'name', 160),
        url: validateExternalTrackingUrl(input.url, allowedDomain),
        startsAt: input.startsAt ?? null,
        expiresAt: input.expiresAt ?? null,
        notes: optionalText(input.notes, 'notes', 1000),
        now: new Date(),
      }),
      'tracking link unavailable',
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
