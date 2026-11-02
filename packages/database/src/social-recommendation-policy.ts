import {
  lockFeaturePolicyGroup,
  MANAGED_FEATURE_POLICY_CONFIG_KEY,
} from './group-feature-entitlement';
import { createHash } from 'node:crypto';
import {
  SOCIAL_ACTIVITY_SUPPORT_FEATURE_KEY,
  SOCIAL_RECOMMENDATION_POLICY_CONFIG_KEY,
  assertServiceRecommendationSettings,
  effectiveSocialRecommendationSettings,
  isPolicyRecord,
  normalizeSocialRecommendationSettings,
  readSocialRecommendationPolicy,
  type SocialRecommendationPolicy,
  type SocialRecommendationPolicyCommand,
  type SocialRecommendationPolicyRepository,
  type SocialRecommendationPolicyScope,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import { prisma, type Prisma, type PrismaClient } from './client';

export async function lockRecommendationService(
  tx: Prisma.TransactionClient,
  scope: { workspaceId: string; serviceId: string },
) {
  await lockFeaturePolicyGroup(tx, { workspaceId: scope.workspaceId, groupId: scope.serviceId });
}
export async function readRecommendationPolicy(
  tx: Prisma.TransactionClient,
  scope: { workspaceId: string; serviceId: string },
) {
  const row = await tx.groupFeaturePolicy.findUnique({
    where: {
      groupId_featureKey: {
        groupId: scope.serviceId,
        featureKey: SOCIAL_ACTIVITY_SUPPORT_FEATURE_KEY,
      },
    },
    select: { workspaceId: true, config: true },
  });
  if (row && row.workspaceId !== scope.workspaceId)
    throw new ApplicationError('FORBIDDEN', 'invalid recommendation scope');
  return policyFromConfig(row?.config);
}
export async function readRuntimeRecommendationPolicy(
  tx: Prisma.TransactionClient,
  scope: { workspaceId: string; serviceId: string },
) {
  try {
    const policy = await readRecommendationPolicy(tx, scope);
    return {
      policy: policy as SocialRecommendationPolicy | null,
      settings: effectiveSocialRecommendationSettings(policy),
    };
  } catch (error) {
    if (!(error instanceof ApplicationError) || error.code !== 'VALIDATION_ERROR') throw error;
    console.error('SNS支援提案の保存設定が不正なため、新規提案を停止しました。');
    return {
      policy: null,
      settings: { enabled: false, minimumAccepted: 100, cooldownDays: 365, categories: [] },
    };
  }
}
function policyFromConfig(config: unknown) {
  const managed = isPolicyRecord(config) ? config[MANAGED_FEATURE_POLICY_CONFIG_KEY] : undefined;
  if (managed !== undefined && !isPolicyRecord(managed))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid managed feature policy');
  return readSocialRecommendationPolicy(managed?.[SOCIAL_RECOMMENDATION_POLICY_CONFIG_KEY]);
}
function validateScope(scope: SocialRecommendationPolicyScope) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    ![scope.workspaceId, scope.serviceId, scope.actorUserId].every(
      (id) => typeof id === 'string' && uuid.test(id),
    )
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid recommendation scope');
}
async function permissions(tx: Prisma.TransactionClient, scope: SocialRecommendationPolicyScope) {
  const [group, admin, member] = await Promise.all([
    tx.group.findFirst({
      where: {
        id: scope.serviceId,
        workspaceId: scope.workspaceId,
        status: 'ACTIVE',
        workspace: { status: 'ACTIVE' },
        serviceConfiguration: { isNot: null },
      },
      select: { id: true },
    }),
    tx.platformAdmin.findFirst({
      where: {
        userId: scope.actorUserId,
        status: 'ACTIVE',
        role: 'SUPER_ADMIN',
        user: { status: 'ACTIVE' },
      },
      select: { id: true },
    }),
    tx.groupMembership.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.serviceId,
        userId: scope.actorUserId,
        status: 'ACTIVE',
        serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
        user: { status: 'ACTIVE' },
      },
      select: { id: true },
    }),
  ]);
  if (!group || (!admin && !member))
    throw new ApplicationError('NOT_FOUND', 'recommendation policy not found');
  return { headquarters: Boolean(admin), service: Boolean(admin || member) };
}
function view(
  policy: SocialRecommendationPolicy,
  allowed: { headquarters: boolean; service: boolean },
) {
  return {
    version: policy.version,
    revision: policy.revision,
    headquarters: policy.headquarters,
    service: policy.service,
    effective: effectiveSocialRecommendationSettings(policy),
    permissions: allowed,
  };
}
export class PrismaSocialRecommendationPolicyRepository implements SocialRecommendationPolicyRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  async read(input: SocialRecommendationPolicyScope) {
    const scope = structuredClone(input);
    validateScope(scope);
    return this.client.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const allowed = await permissions(tx, scope);
        return view(await readRecommendationPolicy(tx, scope), allowed);
      },
      { isolationLevel: 'RepeatableRead', timeout: 20_000 },
    );
  }
  async save(input: SocialRecommendationPolicyCommand) {
    const command = structuredClone(input);
    validateScope(command);
    const settings = normalizeSocialRecommendationSettings(command.settings);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(command.commandId) ||
      !Number.isInteger(command.expectedRevision) ||
      command.expectedRevision < 0 ||
      command.expectedRevision >= 2_147_483_646 ||
      !['HEADQUARTERS', 'SERVICE'].includes(command.authority) ||
      typeof command.reason !== 'string' ||
      !command.reason.trim() ||
      command.reason.trim().length > 1000
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid policy command');
    command.reason = command.reason.trim();
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          workspaceId: command.workspaceId,
          serviceId: command.serviceId,
          actorUserId: command.actorUserId,
          commandId: command.commandId,
          expectedRevision: command.expectedRevision,
          authority: command.authority,
          settings,
          reason: command.reason,
        }),
      )
      .digest('hex');
    return this.client.$transaction(
      async (tx) => {
        await lockRecommendationService(tx, command);
        const allowed = await permissions(tx, command);
        if (!(command.authority === 'HEADQUARTERS' ? allowed.headquarters : allowed.service))
          throw new ApplicationError('FORBIDDEN', '本部設定の変更権限がありません。');
        const row = await tx.groupFeaturePolicy.findUnique({
          where: {
            groupId_featureKey: {
              groupId: command.serviceId,
              featureKey: SOCIAL_ACTIVITY_SUPPORT_FEATURE_KEY,
            },
          },
        });
        if (row && row.workspaceId !== command.workspaceId)
          throw new ApplicationError('FORBIDDEN', 'invalid recommendation scope');
        const before = policyFromConfig(row?.config);
        if (before.lastRequest?.commandId === command.commandId) {
          if (before.lastRequest.fingerprint !== fingerprint)
            throw new ApplicationError('CONFLICT', '同じ要求番号の内容が変更されています。');
          return view(before, allowed);
        }
        if (before.revision !== command.expectedRevision)
          throw new ApplicationError(
            'CONFLICT',
            '設定が更新されています。最新の設定を取得してください。',
          );
        if (command.authority === 'SERVICE')
          assertServiceRecommendationSettings(settings, before.headquarters);
        const feature = await tx.featureDefinition.findFirst({
          where: { key: SOCIAL_ACTIVITY_SUPPORT_FEATURE_KEY, status: 'ACTIVE' },
          select: { key: true },
        });
        if (!feature) throw new ApplicationError('NOT_FOUND', 'support feature unavailable');
        if (row && !isPolicyRecord(row.config))
          throw new ApplicationError('VALIDATION_ERROR', '既存の機能設定を確認してください。');
        const after: SocialRecommendationPolicy = {
          ...before,
          revision: before.revision + 1,
          headquarters: command.authority === 'HEADQUARTERS' ? settings : before.headquarters,
          service: command.authority === 'SERVICE' ? settings : before.service,
          lastRequest: { commandId: command.commandId, fingerprint },
        };
        const config = {
          ...(row?.config ?? {}),
          [MANAGED_FEATURE_POLICY_CONFIG_KEY]: {
            ...(isPolicyRecord(row?.config) &&
            isPolicyRecord(row.config[MANAGED_FEATURE_POLICY_CONFIG_KEY])
              ? row.config[MANAGED_FEATURE_POLICY_CONFIG_KEY]
              : {}),
            [SOCIAL_RECOMMENDATION_POLICY_CONFIG_KEY]: after,
          },
        } as unknown as Prisma.InputJsonValue;
        await tx.groupFeaturePolicy.upsert({
          where: {
            groupId_featureKey: {
              groupId: command.serviceId,
              featureKey: SOCIAL_ACTIVITY_SUPPORT_FEATURE_KEY,
            },
          },
          create: {
            workspaceId: command.workspaceId,
            groupId: command.serviceId,
            featureKey: SOCIAL_ACTIVITY_SUPPORT_FEATURE_KEY,
            status: 'DISABLED',
            config,
            setByUserId: command.actorUserId,
          },
          update: { config, setByUserId: command.actorUserId },
        });
        const safe = (policy: SocialRecommendationPolicy) => ({
          version: policy.version,
          revision: policy.revision,
          headquarters: policy.headquarters,
          service: policy.service,
        });
        await tx.groupFeatureAuditLog.create({
          data: {
            workspaceId: command.workspaceId,
            groupId: command.serviceId,
            featureKey: SOCIAL_ACTIVITY_SUPPORT_FEATURE_KEY,
            action: 'GROUP_POLICY_SET',
            beforeData: { recommendationPolicy: safe(before) } as unknown as Prisma.InputJsonValue,
            afterData: {
              recommendationPolicy: safe(after),
              authority: command.authority,
            } as unknown as Prisma.InputJsonValue,
            reason: command.reason,
            performedByUserId: command.actorUserId,
          },
        });
        return view(after, allowed);
      },
      { timeout: 20_000 },
    );
  }
}
