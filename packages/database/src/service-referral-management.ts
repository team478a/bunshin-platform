import { createHash } from 'node:crypto';
import {
  transitionServiceReferralConfirmation,
  type ReferralManagementScope,
  type ReferralManagementOverview,
  type ReferralManagementCommand,
  type ReferralPolicyView,
  type ServiceReferralConfirmation,
  type ServiceReferralConfirmationCommand,
  type ServiceReferralManagementRepository,
} from '@bunshin/application';
import {
  evaluateSocialServiceReferralQualification,
  normalizeSocialServiceReferralQualificationRule,
  SOCIAL_SERVICE_REFERRAL_QUALIFICATION_VERSION,
  type SocialServiceReferralQualificationRule,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import {
  Prisma,
  type ServiceReferral,
  type ServiceReferralQualificationPolicyVersion,
} from '@prisma/client';
import { prisma, type PrismaClient } from './client';
import { readSocialReferralEvidenceInTransaction } from './social-service-referral-evidence';
import { grantReferralMilestonesInTransaction } from './service-referral-reward-repository';

const fail = () =>
  new ApplicationError(
    'CONFLICT',
    '紹介条件または審査状態が変わりました。再読み込みしてください。',
  );
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const transactionOptions = { maxWait: 5_000, timeout: 30_000 };
type Tx = Prisma.TransactionClient;
function scopeSnapshot(s: ReferralManagementScope) {
  const value = { workspaceId: s.workspaceId, serviceId: s.serviceId, actorUserId: s.actorUserId };
  if (Object.values(value).some((v) => !uuid.test(v))) throw fail();
  return value;
}
const whereScope = (s: ReferralManagementScope) => ({
  workspaceId: s.workspaceId,
  groupId: s.serviceId,
});

/** Must run inside the same transaction as evidence, CAS and audit. */
async function authorize(tx: Tx, s: ReferralManagementScope, now: Date) {
  const group = await tx.group.findFirst({
    where: {
      id: s.serviceId,
      workspaceId: s.workspaceId,
      status: 'ACTIVE',
      workspace: { status: 'ACTIVE' },
      serviceConfiguration: {
        is: {
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          ],
        },
      },
    },
    select: { id: true },
  });
  const user = await tx.user.findFirst({
    where: { id: s.actorUserId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!group || !user) throw new ApplicationError('NOT_FOUND', 'service not found');
  const hq = await tx.platformAdmin.findFirst({
    where: { userId: s.actorUserId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
    select: { id: true },
  });
  const member = await tx.groupMembership.findFirst({
    where: {
      ...whereScope(s),
      userId: s.actorUserId,
      status: 'ACTIVE',
      serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
      workspace: { memberships: { some: { userId: s.actorUserId, status: 'ACTIVE' } } },
    },
    select: { id: true },
  });
  if (!hq && !member) throw new ApplicationError('FORBIDDEN', 'service management required');
  return Boolean(hq);
}
async function lockService(tx: Tx, s: ReferralManagementScope) {
  await tx.$queryRaw`SELECT id FROM groups WHERE workspace_id=${s.workspaceId}::uuid AND id=${s.serviceId}::uuid FOR UPDATE`;
}
async function policies(tx: Tx, s: ReferralManagementScope) {
  const [latest, headquarters] = await Promise.all([
    tx.serviceReferralQualificationPolicyVersion.findFirst({
      where: whereScope(s),
      orderBy: { version: 'desc' },
    }),
    tx.serviceReferralQualificationPolicyVersion.findFirst({
      where: { ...whereScope(s), authority: 'HEADQUARTERS' },
      orderBy: { version: 'desc' },
    }),
  ]);
  return { latest, headquarters };
}
type SocialConditions = Pick<
  SocialServiceReferralQualificationRule,
  | 'requireNewRegistration'
  | 'requireOnboarding'
  | 'requireFirstUserGeneration'
  | 'minimumActiveDays'
>;
function conditions(value: Prisma.JsonValue): SocialConditions {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !==
      'minimumActiveDays,requireFirstUserGeneration,requireNewRegistration,requireOnboarding'
  )
    throw fail();
  return value as unknown as SocialConditions;
}
function rule(row: ServiceReferralQualificationPolicyVersion) {
  if (
    row.profileKey !== 'SOCIAL_REFERRAL' ||
    row.profileRevision !== SOCIAL_SERVICE_REFERRAL_QUALIFICATION_VERSION
  )
    throw fail();
  return normalizeSocialServiceReferralQualificationRule({
    scope: { workspaceId: row.workspaceId, serviceId: row.groupId },
    ruleKey: row.policyKey,
    version: row.version,
    status: row.status as 'ACTIVE' | 'SUSPENDED',
    timezone: row.timezone,
    ...conditions(row.conditions),
  });
}
function policyView(row: ServiceReferralQualificationPolicyVersion): ReferralPolicyView {
  const normalized = rule(row);
  return {
    id: row.id,
    version: row.version,
    authority: row.authority as ReferralPolicyView['authority'],
    status: normalized.status,
    timezone: row.timezone,
    conditions: { ...conditions(row.conditions) },
  };
}
function confirmation(row: ServiceReferral): ServiceReferralConfirmation {
  return {
    scope: { workspaceId: row.workspaceId, serviceId: row.groupId },
    referralId: row.id,
    state: row.qualificationState as ServiceReferralConfirmation['state'],
    review: row.qualificationReview as ServiceReferralConfirmation['review'],
    revision: row.qualificationRevision,
    confirmedPolicyVersionId: row.confirmedPolicyVersionId,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}
export class PrismaServiceReferralManagementRepository implements ServiceReferralManagementRepository {
  constructor(
    private readonly client: PrismaClient = prisma,
    private readonly now = () => new Date(),
  ) {}

  private async writeTransaction<T>(run: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.client.$transaction(run, {
          ...transactionOptions,
          isolationLevel: 'RepeatableRead',
        });
      } catch (error) {
        // A waiter must start a fresh snapshot after a policy/confirmation commits.
        // Retry only rolled-back database conflicts; external effects never occur here.
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2034' ||
            error.code === 'P2002' ||
            (error.code === 'P2010' && ['40001', '40P01'].includes(String(error.meta?.['code']))));
        if (!retryable || attempt >= 2) throw error;
      }
    }
  }

  async overview(
    input: ReferralManagementScope,
    after?: string,
  ): Promise<ReferralManagementOverview> {
    const s = scopeSnapshot(input);
    if (after !== undefined && !uuid.test(after)) throw fail();
    return this.client.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const canSetHeadquartersPolicy = await authorize(tx, s, this.now());
        const { latest, headquarters } = await policies(tx, s);
        if (
          after &&
          !(await tx.serviceReferral.findFirst({
            where: { ...whereScope(s), id: after },
            select: { id: true },
          }))
        )
          throw new ApplicationError('NOT_FOUND', 'referral not found');
        const rows = await tx.serviceReferral.findMany({
          include: { referralCode: { select: { groupMembershipId: true } } },
          where: whereScope(s),
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: 101,
          ...(after ? { cursor: { id: after }, skip: 1 } : {}),
        });
        return {
          canSetHeadquartersPolicy,
          policy: latest ? policyView(latest) : null,
          headquartersPolicy: headquarters ? policyView(headquarters) : null,
          referrals: rows.slice(0, 100).map((row) => ({
            ...confirmation(row),
            referredMembershipId: row.referredMembershipId,
            referrerMembershipId: row.referralCode.groupMembershipId,
          })),
          hasMore: rows.length > 100,
        };
      },
      { ...transactionOptions, isolationLevel: 'RepeatableRead' },
    );
  }

  async savePolicy(
    input: ReferralManagementScope,
    value: Parameters<ServiceReferralManagementRepository['savePolicy']>[1],
  ): Promise<ReferralPolicyView> {
    const s = scopeSnapshot(input);
    // Snapshot all client data before any await; no arbitrary profile or executable conditions.
    const v = structuredClone(value);
    if (
      !['HEADQUARTERS', 'SERVICE'].includes(v.authority) ||
      !['ACTIVE', 'SUSPENDED'].includes(v.status) ||
      typeof v.reason !== 'string' ||
      !v.reason.trim() ||
      v.reason.length > 1000 ||
      (v.expectedPolicyVersionId !== null && !uuid.test(v.expectedPolicyVersionId))
    )
      throw fail();
    const selectedConditions = conditions(v.conditions);
    normalizeSocialServiceReferralQualificationRule({
      scope: s,
      ruleKey: 'social-referral',
      version: 1,
      status: v.status,
      timezone: v.timezone,
      ...selectedConditions,
    });
    return this.writeTransaction(async (tx) => {
      await lockService(tx, s);
      const isHq = await authorize(tx, s, this.now());
      const { latest, headquarters } = await policies(tx, s);
      if ((latest?.id ?? null) !== v.expectedPolicyVersionId) throw fail();
      if (v.authority === 'HEADQUARTERS' && !isHq)
        throw new ApplicationError('FORBIDDEN', 'headquarters required');
      if (v.authority === 'SERVICE') {
        if (!headquarters || headquarters.status !== 'ACTIVE') throw fail();
        const floor = rule(headquarters);
        if (
          v.timezone !== floor.timezone ||
          selectedConditions.minimumActiveDays < floor.minimumActiveDays ||
          (floor.requireNewRegistration && !selectedConditions.requireNewRegistration) ||
          (floor.requireOnboarding && !selectedConditions.requireOnboarding) ||
          (floor.requireFirstUserGeneration && !selectedConditions.requireFirstUserGeneration)
        )
          throw fail();
      }
      const created = await tx.serviceReferralQualificationPolicyVersion.create({
        data: {
          ...whereScope(s),
          version: (latest?.version ?? 0) + 1,
          authority: v.authority,
          status: v.status,
          profileKey: 'SOCIAL_REFERRAL',
          profileRevision: SOCIAL_SERVICE_REFERRAL_QUALIFICATION_VERSION,
          conditions: { ...v.conditions },
          timezone: v.timezone,
          reason: v.reason.trim(),
          createdByUserId: s.actorUserId,
          createdAt: this.now(),
        },
      });
      // Touch the locked parent so a transaction waiting on a pre-change snapshot
      // cannot confirm against the previous policy. Its serialization conflict is retried.
      await tx.group.update({ where: { id: s.serviceId }, data: { updatedAt: this.now() } });
      return policyView(created);
    });
  }

  async execute(
    input: ReferralManagementScope,
    value: ReferralManagementCommand,
  ): Promise<ServiceReferralConfirmation> {
    const s = scopeSnapshot(input);
    const v = structuredClone(value);
    if (
      !uuid.test(v.commandId) ||
      !uuid.test(v.referralId) ||
      !Number.isSafeInteger(v.expectedRevision) ||
      v.expectedRevision < 0 ||
      typeof v.reason !== 'string' ||
      !v.reason.trim() ||
      v.reason.length > 1000 ||
      !['REVIEW', 'CONFIRM', 'REVOKE'].includes(v.kind) ||
      (v.kind === 'REVIEW' && !['UNKNOWN', 'REQUIRED', 'CLEAR'].includes(v.review)) ||
      (v.kind === 'CONFIRM' && !uuid.test(v.expectedPolicyVersionId))
    )
      throw fail();
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          actor: s.actorUserId,
          referral: v.referralId,
          kind: v.kind,
          reason: v.reason,
          revision: v.expectedRevision,
          review: v.kind === 'REVIEW' ? v.review : null,
          policy: v.kind === 'CONFIRM' ? v.expectedPolicyVersionId : null,
        }),
      )
      .digest('hex');
    return this.writeTransaction(async (tx) => {
      await lockService(tx, s);
      const now = this.now();
      await authorize(tx, s, now);
      const replay = await tx.serviceReferralQualificationAudit.findUnique({
        where: { workspaceId_groupId_commandId: { ...whereScope(s), commandId: v.commandId } },
      });
      if (replay) {
        if (replay.fingerprint !== fingerprint) throw fail();
        const stored = replay.result;
        if (!stored || typeof stored !== 'object' || Array.isArray(stored) || !stored['after'])
          throw new ApplicationError('DATABASE_UNAVAILABLE', 'referral audit result unavailable');
        return stored['after'] as unknown as ServiceReferralConfirmation;
      }
      await tx.$queryRaw`SELECT id FROM service_referrals WHERE workspace_id=${s.workspaceId}::uuid AND group_id=${s.serviceId}::uuid AND id=${v.referralId}::uuid FOR UPDATE`;
      const row = await tx.serviceReferral.findFirst({
        where: { ...whereScope(s), id: v.referralId },
      });
      if (!row) throw new ApplicationError('NOT_FOUND', 'referral not found');
      const current = confirmation(row);
      const base = {
        scope: current.scope,
        referralId: row.id,
        expectedRevision: v.expectedRevision,
        actorUserId: s.actorUserId,
        reason: v.reason.trim(),
      };
      let command: ServiceReferralConfirmationCommand;
      if (v.kind === 'CONFIRM') {
        const { latest, headquarters } = await policies(tx, s);
        if (
          !latest ||
          !headquarters ||
          headquarters.status !== 'ACTIVE' ||
          latest.id !== v.expectedPolicyVersionId
        )
          throw fail();
        const evidence = await readSocialReferralEvidenceInTransaction(
          tx,
          {
            scope: {
              ...current.scope,
              groupMembershipId: row.referredMembershipId,
              userId: row.referredUserId,
            },
            timezone: latest.timezone,
            asOf: now,
          },
          now,
          true,
        );
        if (!evidence || evidence.referralId !== row.id) throw fail();
        const decision = evaluateSocialServiceReferralQualification(
          rule(latest),
          { ...evidence, review: current.review },
          now,
        );
        command = {
          ...base,
          kind: 'CONFIRM',
          policy: { scope: current.scope, id: latest.id, active: latest.status === 'ACTIVE' },
          proof: {
            scope: current.scope,
            referralId: row.id,
            policyVersionId: latest.id,
            observedRevision: current.revision,
            asOf: now.toISOString(),
            decision: decision.decision,
          },
        };
      } else
        command =
          v.kind === 'REVIEW'
            ? { ...base, kind: 'REVIEW', review: v.review }
            : { ...base, kind: 'REVOKE' };
      const result = transitionServiceReferralConfirmation(current, command, now);
      if (result.changed) {
        const updated = await tx.serviceReferral.updateMany({
          where: {
            ...whereScope(s),
            id: row.id,
            qualificationRevision: current.revision,
          },
          data: {
            qualificationState: result.value.state,
            qualificationReview: result.value.review,
            qualificationRevision: result.value.revision,
            confirmedPolicyVersionId: result.value.confirmedPolicyVersionId,
            confirmedAt: result.value.confirmedAt ? new Date(result.value.confirmedAt) : null,
            revokedAt: result.value.revokedAt ? new Date(result.value.revokedAt) : null,
          },
        });
        if (updated.count !== 1) throw fail();
      }
      await tx.serviceReferralQualificationAudit.create({
        data: {
          ...whereScope(s),
          referralId: row.id,
          commandId: v.commandId,
          actorUserId: s.actorUserId,
          kind: v.kind,
          reason: v.reason.trim(),
          fingerprint,
          beforeRevision: current.revision,
          result: { before: current, after: result.value } as unknown as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });
      if (result.changed && v.kind === 'CONFIRM') {
        await grantReferralMilestonesInTransaction(tx, {
          workspaceId: s.workspaceId,
          groupId: s.serviceId,
          referredUserId: row.referredUserId,
          now,
        });
      }
      return result.value;
    });
  }
}
