import 'server-only';
import {
  ActivateGroupLineConfiguration,
  CreateGroupLineConfigurationVersion,
  ListGroupLineConfigurations,
  SetGroupLineRoutingPolicy,
  TestGroupLineConfigurationConnection,
  type GroupLineChannelConfiguration,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { getServerEnvironment } from '@bunshin/config';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import {
  AesGcmLineSecretCrypto,
  currentLineEnvironment,
  lineEndpointUrls,
  LineConnectionTestAdapter,
} from '../line/secure-configuration';
import { renderDefaultLineRichMenu } from '../line/default-rich-menu';
import { publishDefaultGroupRichMenu } from '../line/group-rich-menu-provider';

const uuid = z.string().uuid();
const createSchema = z
  .object({
    workspaceId: z.string().uuid(),
    reason: z.string().min(3).max(500),
    loginChannelId: z.string().min(1).max(64),
    loginChannelSecret: z.string().min(8).max(500),
    messagingChannelId: z.string().min(1).max(64),
    messagingChannelSecret: z.string().min(8).max(500),
    channelAccessToken: z.string().min(8).max(2000),
    liffId: z.string().max(128).nullable().optional(),
    quotaWarningPercent: z.number().int().min(1).max(99),
    quotaLowPriorityStop: z.number().int().min(2).max(100),
  })
  .strict();
const policySchema = z
  .object({
    workspaceId: z.string().uuid(),
    mode: z.enum(['SHARED', 'DEDICATED', 'DISABLED']),
    reason: z.string().min(3).max(500),
  })
  .strict();
const actionSchema = z
  .object({ workspaceId: z.string().uuid(), reason: z.string().min(3).max(500) })
  .strict();

async function actor() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return user.userId;
}
async function body(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
  return request
    .text()
    .then((text): unknown => {
      try {
        return JSON.parse(text) as unknown;
      } catch (error) {
        throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
      }
    })
    .catch((error: unknown) => {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
    });
}
async function repository() {
  const db = await import('@bunshin/database');
  return new db.PrismaGroupLineConfigurationRepository();
}
async function respond(request: Request, operation: () => Promise<unknown>, status = 200) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    return Response.json(
      { data: await operation(), requestId },
      { status, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
const dto = (value: GroupLineChannelConfiguration) => ({
  ...value,
  lastVerifiedAt: value.lastVerifiedAt?.toISOString() ?? null,
  createdAt: value.createdAt.toISOString(),
  updatedAt: value.updatedAt.toISOString(),
});

export function listGroupLineConfigurationsResponse(request: Request, groupIdValue: string) {
  return respond(request, async () => {
    const groupId = uuid.parse(groupIdValue);
    const workspaceId = uuid.parse(new URL(request.url).searchParams.get('workspaceId'));
    const result = await new ListGroupLineConfigurations(await repository()).execute({
      actorUserId: await actor(),
      workspaceId,
      groupId,
      environment: currentLineEnvironment(),
    });
    return {
      ...result,
      environment: currentLineEnvironment(),
      configurations: result.configurations.map(dto),
    };
  });
}
export function createGroupLineConfigurationResponse(request: Request, groupIdValue: string) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const groupId = uuid.parse(groupIdValue);
      const input = createSchema.parse(await body(request));
      return dto(
        await new CreateGroupLineConfigurationVersion(
          await repository(),
          new AesGcmLineSecretCrypto(),
        ).execute({
          actorUserId: await actor(),
          groupId,
          environment: currentLineEnvironment(),
          ...input,
          liffId: input.liffId ?? null,
        }),
      );
    },
    201,
  );
}
export function setGroupLinePolicyResponse(request: Request, groupIdValue: string) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const groupId = uuid.parse(groupIdValue);
    const input = policySchema.parse(await body(request));
    return new SetGroupLineRoutingPolicy(await repository()).execute({
      actorUserId: await actor(),
      groupId,
      environment: currentLineEnvironment(),
      ...input,
      pilotEnabled: input.mode === 'DEDICATED',
    });
  });
}
export function testGroupLineConfigurationResponse(
  request: Request,
  groupIdValue: string,
  configurationIdValue: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const groupId = uuid.parse(groupIdValue);
    const configurationId = uuid.parse(configurationIdValue);
    const input = actionSchema.pick({ workspaceId: true }).parse(await body(request));
    return new TestGroupLineConfigurationConnection(
      await repository(),
      new AesGcmLineSecretCrypto(),
      new LineConnectionTestAdapter(),
    ).execute({
      actorUserId: await actor(),
      groupId,
      configurationId,
      environment: currentLineEnvironment(),
      callbackUrl: lineEndpointUrls().callbackUrl,
      ...input,
    });
  });
}
export function activateGroupLineConfigurationResponse(
  request: Request,
  groupIdValue: string,
  configurationIdValue: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const groupId = uuid.parse(groupIdValue);
    const configurationId = uuid.parse(configurationIdValue);
    const input = actionSchema.parse(await body(request));
    return dto(
      await new ActivateGroupLineConfiguration(await repository()).execute({
        actorUserId: await actor(),
        groupId,
        configurationId,
        environment: currentLineEnvironment(),
        ...input,
      }),
    );
  });
}

export function publishDefaultGroupRichMenuResponse(request: Request, groupIdValue: string) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const groupId = uuid.parse(groupIdValue);
    const input = actionSchema.parse(await body(request));
    const reason = input.reason.trim();
    if (reason.length < 3)
      throw new ApplicationError('VALIDATION_ERROR', '公開理由を3文字以上で入力してください');
    const actorUserId = await actor();
    const environment = currentLineEnvironment();
    const repo = await repository();
    const available = await new ListGroupLineConfigurations(repo).execute({
      actorUserId,
      workspaceId: input.workspaceId,
      groupId,
      environment,
    });
    if (available.mode !== 'DEDICATED')
      throw new ApplicationError('CONFLICT', 'このグループは専用LINEを使用していません');
    const active = available.configurations.find(
      (item) => item.status === 'ACTIVE' && item.lastVerifiedAt && !item.lastErrorCategory,
    );
    if (!active)
      throw new ApplicationError('CONFLICT', '先に専用LINEの接続確認と使用開始を完了してください');
    const db = await import('@bunshin/database');
    const stored = await db.prisma.groupLineChannelConfiguration.findFirst({
      where: {
        id: active.id,
        workspaceId: input.workspaceId,
        groupId,
        environment,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        encryptedAccessToken: true,
        group: {
          select: {
            name: true,
            serviceConfiguration: { select: { slug: true } },
          },
        },
      },
    });
    if (!stored) throw new ApplicationError('CONFLICT', '使用中の専用LINE設定が見つかりません');
    const published = await publishDefaultGroupRichMenu({
      accessToken: new AesGcmLineSecretCrypto().decrypt(stored.encryptedAccessToken),
      groupId,
      groupName: stored.group.name,
      appUrl: getServerEnvironment().APP_URL,
      serviceSlug: stored.group.serviceConfiguration?.slug ?? null,
      image: await renderDefaultLineRichMenu(),
    });
    await db.prisma.groupLineConfigurationAudit.create({
      data: {
        workspaceId: input.workspaceId,
        groupId,
        configurationId: stored.id,
        environment,
        actorUserId,
        action: 'RICH_MENU_PUBLISH',
        reason,
        afterData: { lineRichMenuId: published.lineRichMenuId, template: 'DEFAULT_V1' },
      },
    });
    return { ...published, name: '標準リッチメニュー' };
  });
}
