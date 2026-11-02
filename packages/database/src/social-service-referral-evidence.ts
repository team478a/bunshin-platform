import {
  projectServiceReferralRegistrationOrigin,
  type MemberUsageRequest,
} from '@bunshin/application';
import {
  projectSocialServiceReferralActivities,
  type SocialServiceReferralEvidenceRequest,
  type SocialServiceReferralEvidenceRepository,
  type SocialServiceReferralQualificationEvidence,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import type { PrismaClient } from '@prisma/client';
import { isMemberUsagePermitted, memberUsageReadOptions } from './member-usage-authorization';
import { readMemberUsageSources } from './member-usage-repository';

const BUNSHIN_LIMIT = 20;
const AUDIT_LIMIT = 100;
const ACTIVITY_LIMIT = 10_000;

/** Internal owner-only read. No HTTP/Job exposure, qualification persistence or reward grant. */
export class PrismaSocialServiceReferralEvidenceRepository implements SocialServiceReferralEvidenceRepository {
  constructor(
    private readonly client: PrismaClient,
    private readonly now = () => new Date(),
  ) {}

  async read(
    input: SocialServiceReferralEvidenceRequest,
  ): Promise<SocialServiceReferralQualificationEvidence | null> {
    // Validate a member scope without inventing a Bunshin identity for a non-SOCIAL service.
    if (!input || !input.scope)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid referral read');
    const s = input.scope;
    const scope = {
      workspaceId: s.workspaceId,
      serviceId: s.serviceId,
      groupMembershipId: s.groupMembershipId,
      userId: s.userId,
    };
    const request = {
      actorUserId: input.actorUserId,
      scope,
      asOf: new Date(input.asOf),
      timezone: input.timezone,
    };
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (
      !uuid.test(request.actorUserId) ||
      Object.values(scope).some((id) => !uuid.test(id)) ||
      !Number.isFinite(request.asOf.getTime()) ||
      typeof request.timezone !== 'string' ||
      !request.timezone ||
      request.timezone.length > 64
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid referral read');
    if (request.actorUserId !== scope.userId)
      throw new ApplicationError('VALIDATION_ERROR', 'referral owner required');
    try {
      new Intl.DateTimeFormat('sv-SE', { timeZone: request.timezone }).format(request.asOf);
    } catch {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid referral timezone');
    }
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const owned = {
        workspaceId: scope.workspaceId,
        groupId: scope.serviceId,
        ownerUserId: scope.userId,
        status: { not: 'ARCHIVED' as const },
      };
      const bunshins = await tx.bunshin.findMany({
        where: owned,
        take: BUNSHIN_LIMIT + 1,
        orderBy: { id: 'asc' },
        select: { id: true },
      });
      if (!bunshins.length) return null;
      const requests: MemberUsageRequest[] = bunshins.slice(0, BUNSHIN_LIMIT).map(({ id }) => ({
        ...request,
        scope: { ...scope, bunshinId: id },
      }));
      const now = this.now();
      for (const item of requests) if (!(await isMemberUsagePermitted(tx, item, now))) return null;
      const referral = await tx.serviceReferral.findFirst({
        where: {
          workspaceId: scope.workspaceId,
          groupId: scope.serviceId,
          referredMembershipId: scope.groupMembershipId,
          referredUserId: scope.userId,
          createdAt: { lte: request.asOf },
        },
        select: {
          id: true,
          status: true,
          registeredAt: true,
          onboardingCompletedAt: true,
          referralCode: { select: { groupMembershipId: true, userId: true } },
        },
      });
      if (!referral) return null;
      const audits = await tx.groupMembershipAuditLog.findMany({
        where: {
          workspaceId: scope.workspaceId,
          groupId: scope.serviceId,
          groupMembershipId: scope.groupMembershipId,
          occurredAt: { lte: request.asOf },
        },
        select: {
          workspaceId: true,
          groupId: true,
          groupMembershipId: true,
          performedByUserId: true,
          occurredAt: true,
          action: true,
          reason: true,
          beforeData: true,
          afterData: true,
        },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        take: AUDIT_LIMIT + 1,
      });
      const activities: SocialServiceReferralQualificationEvidence['activities'][number][] = [];
      let partial = bunshins.length > BUNSHIN_LIMIT || audits.length > AUDIT_LIMIT;
      let hasUnknownGenerationTrigger = false;
      for (const item of requests) {
        const sources = await readMemberUsageSources(tx, item);
        if (sources.completeness !== 'COMPLETE') {
          partial = true;
          continue;
        }
        const projected = projectSocialServiceReferralActivities(item, sources);
        hasUnknownGenerationTrigger ||= projected.hasUnknownGenerationTrigger;
        if (activities.length + projected.activities.length > ACTIVITY_LIMIT) {
          partial = true;
          continue;
        }
        activities.push(...projected.activities);
      }
      return {
        scope,
        referralId: referral.id,
        status: referral.status,
        referrer: { ...referral.referralCode },
        referred: { groupMembershipId: scope.groupMembershipId, userId: scope.userId },
        registeredAt: referral.registeredAt,
        onboardingCompletedAt: referral.onboardingCompletedAt,
        newRegistration: projectServiceReferralRegistrationOrigin(
          scope,
          referral.registeredAt,
          audits,
          audits.length <= AUDIT_LIMIT,
        ),
        uniqueAttribution: true,
        review: 'UNKNOWN',
        completeness: partial ? 'PARTIAL' : 'COMPLETE',
        activities,
        hasUnknownGenerationTrigger,
      };
    }, memberUsageReadOptions);
  }
}
