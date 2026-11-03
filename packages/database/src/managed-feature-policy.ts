import { createHash } from 'node:crypto';
import { ApplicationError } from '@bunshin/shared';
import { prisma, type Prisma, type PrismaClient } from './client';
import {
  lockFeaturePolicyGroup,
  MANAGED_FEATURE_POLICY_CONFIG_KEY,
} from './group-feature-entitlement';

export interface ManagedFeaturePolicyScope {
  workspaceId: string;
  serviceId: string;
  actorUserId: string;
}
export interface ManagedFeaturePolicyCommand extends ManagedFeaturePolicyScope {
  commandId: string;
  expectedRevision: number;
  authority: 'HEADQUARTERS' | 'SERVICE';
  settings: unknown;
  reason: string;
}
export interface ManagedFeaturePolicy<S> {
  version: string;
  revision: number;
  headquarters: S | null;
  service: S | null;
  lastRequest?: { commandId: string; fingerprint: string };
}
export interface ManagedFeaturePolicyDefinition<S, P extends ManagedFeaturePolicy<S>> {
  featureKey: string;
  configKey: string;
  auditKey?: string;
  requiredOnboardingTemplate?: string;
  read(raw: unknown): P;
  normalize(value: unknown): S;
  effective(policy: P): S;
  assertService(settings: S, headquarters: S | null): void;
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
/** Storage projection only. Callers must establish current member/administrator authorization. */
export async function readManagedFeaturePolicyValue(
  client: Pick<PrismaClient, 'groupFeaturePolicy'>,
  scope: { workspaceId: string; serviceId: string },
  descriptor: { featureKey: string; configKey: string },
): Promise<unknown> {
  const row = await client.groupFeaturePolicy.findUnique({
    where: { groupId_featureKey: { groupId: scope.serviceId, featureKey: descriptor.featureKey } },
    select: { workspaceId: true, config: true },
  });
  if (row && row.workspaceId !== scope.workspaceId)
    throw new ApplicationError('FORBIDDEN', 'invalid managed policy scope');
  return managedValue(row?.config, descriptor.configKey);
}
function managedValue(config: unknown, key: string): unknown {
  if (config !== undefined && !isRecord(config))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid managed feature configuration');
  const managed = isRecord(config) ? config[MANAGED_FEATURE_POLICY_CONFIG_KEY] : undefined;
  if (managed !== undefined && !isRecord(managed))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid managed feature policy');
  return managed?.[key];
}
function validateScope(scope: ManagedFeaturePolicyScope) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    ![scope.workspaceId, scope.serviceId, scope.actorUserId].every(
      (id) => typeof id === 'string' && uuid.test(id),
    )
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid managed policy scope');
}
async function permissions(
  tx: Prisma.TransactionClient,
  scope: ManagedFeaturePolicyScope,
  template?: string,
) {
  const [group, admin, member] = await Promise.all([
    tx.group.findFirst({
      where: {
        id: scope.serviceId,
        workspaceId: scope.workspaceId,
        status: 'ACTIVE',
        workspace: { status: 'ACTIVE' },
        serviceConfiguration: { isNot: null },
      },
      select: {
        id: true,
        serviceConfiguration: { select: { registration: { select: { onboardingConfig: true } } } },
      },
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
  const onboarding = group?.serviceConfiguration?.registration?.onboardingConfig;
  if (
    !group ||
    (!admin && !member) ||
    (template !== undefined && (!isRecord(onboarding) || onboarding['templateKey'] !== template))
  )
    throw new ApplicationError('NOT_FOUND', 'managed policy not found');
  return { headquarters: Boolean(admin), service: Boolean(admin || member) };
}
export class PrismaManagedFeaturePolicyRepository<S, P extends ManagedFeaturePolicy<S>> {
  constructor(
    private readonly definition: ManagedFeaturePolicyDefinition<S, P>,
    private readonly client: PrismaClient = prisma,
  ) {}
  private view(policy: P, allowed: { headquarters: boolean; service: boolean }) {
    return {
      version: policy.version as P['version'],
      revision: policy.revision,
      headquarters: policy.headquarters,
      service: policy.service,
      effective: this.definition.effective(policy),
      permissions: allowed,
    };
  }
  async read(input: ManagedFeaturePolicyScope) {
    const scope = structuredClone(input);
    validateScope(scope);
    return this.client.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const allowed = await permissions(tx, scope, this.definition.requiredOnboardingTemplate);
        return this.view(
          this.definition.read(await readManagedFeaturePolicyValue(tx, scope, this.definition)),
          allowed,
        );
      },
      { isolationLevel: 'RepeatableRead', timeout: 20_000 },
    );
  }
  async save(input: ManagedFeaturePolicyCommand) {
    const command = structuredClone(input);
    validateScope(command);
    const settings = this.definition.normalize(command.settings);
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
        await lockFeaturePolicyGroup(tx, {
          workspaceId: command.workspaceId,
          groupId: command.serviceId,
        });
        const allowed = await permissions(tx, command, this.definition.requiredOnboardingTemplate);
        if (!(command.authority === 'HEADQUARTERS' ? allowed.headquarters : allowed.service))
          throw new ApplicationError('FORBIDDEN', '本部設定の変更権限がありません。');
        const row = await tx.groupFeaturePolicy.findUnique({
          where: {
            groupId_featureKey: {
              groupId: command.serviceId,
              featureKey: this.definition.featureKey,
            },
          },
        });
        if (row && row.workspaceId !== command.workspaceId)
          throw new ApplicationError('FORBIDDEN', 'invalid managed policy scope');
        const before = this.definition.read(managedValue(row?.config, this.definition.configKey));
        if (before.lastRequest?.commandId === command.commandId) {
          if (before.lastRequest.fingerprint !== fingerprint)
            throw new ApplicationError('CONFLICT', '同じ要求番号の内容が変更されています。');
          return this.view(before, allowed);
        }
        if (before.revision !== command.expectedRevision)
          throw new ApplicationError(
            'CONFLICT',
            '設定が更新されています。最新の設定を取得してください。',
          );
        if (command.authority === 'SERVICE')
          this.definition.assertService(settings, before.headquarters);
        const feature = await tx.featureDefinition.findFirst({
          where: { key: this.definition.featureKey, status: 'ACTIVE' },
          select: { key: true },
        });
        if (!feature) throw new ApplicationError('NOT_FOUND', 'managed feature unavailable');
        const rootConfig = row ? row.config : {};
        if (!isRecord(rootConfig))
          throw new ApplicationError('VALIDATION_ERROR', '既存の機能設定を確認してください。');
        const managedConfig = rootConfig[MANAGED_FEATURE_POLICY_CONFIG_KEY];
        if (managedConfig !== undefined && !isRecord(managedConfig))
          throw new ApplicationError('VALIDATION_ERROR', 'invalid managed feature configuration');
        const after = {
          ...before,
          revision: before.revision + 1,
          headquarters: command.authority === 'HEADQUARTERS' ? settings : before.headquarters,
          service: command.authority === 'SERVICE' ? settings : before.service,
          lastRequest: { commandId: command.commandId, fingerprint },
        } as P;
        const config = {
          ...rootConfig,
          [MANAGED_FEATURE_POLICY_CONFIG_KEY]: {
            ...(managedConfig ?? {}),
            [this.definition.configKey]: after,
          },
        } as unknown as Prisma.InputJsonValue;
        await tx.groupFeaturePolicy.upsert({
          where: {
            groupId_featureKey: {
              groupId: command.serviceId,
              featureKey: this.definition.featureKey,
            },
          },
          create: {
            workspaceId: command.workspaceId,
            groupId: command.serviceId,
            featureKey: this.definition.featureKey,
            status: 'DISABLED',
            config,
            setByUserId: command.actorUserId,
          },
          update: { config, setByUserId: command.actorUserId },
        });
        const safe = (policy: P) => ({
          version: policy.version,
          revision: policy.revision,
          headquarters: policy.headquarters,
          service: policy.service,
        });
        await tx.groupFeatureAuditLog.create({
          data: {
            workspaceId: command.workspaceId,
            groupId: command.serviceId,
            featureKey: this.definition.featureKey,
            action: 'GROUP_POLICY_SET',
            beforeData: {
              [this.definition.auditKey ?? this.definition.configKey]: safe(before),
            } as unknown as Prisma.InputJsonValue,
            afterData: {
              [this.definition.auditKey ?? this.definition.configKey]: safe(after),
              authority: command.authority,
            } as unknown as Prisma.InputJsonValue,
            reason: command.reason,
            performedByUserId: command.actorUserId,
          },
        });
        return this.view(after, allowed);
      },
      { timeout: 20_000 },
    );
  }
}
