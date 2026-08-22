import 'server-only';
import {
  ActivateLineConfiguration,
  CreateLineConfigurationVersion,
  ListLineConfigurations,
  TestLineConfigurationConnection,
  type LineChannelConfiguration,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import {
  AesGcmLineSecretCrypto,
  currentLineEnvironment,
  lineEndpointUrls,
  LineConnectionTestAdapter,
} from '../line/secure-configuration';

const createSchema = z
  .object({
    reason: z.string().min(3).max(500),
    loginChannelId: z.string().min(1).max(64),
    loginChannelSecret: z.string().min(8).max(500),
    messagingChannelId: z.string().min(1).max(64),
    messagingChannelSecret: z.string().min(8).max(500),
    channelAccessToken: z.string().min(8).max(2000),
    liffId: z.string().max(128).nullable().optional(),
    defaultNotificationTime: z.string(),
    defaultTimezone: z.string().min(1).max(64),
    quietHoursStart: z.string(),
    quietHoursEnd: z.string(),
    globallyPaused: z.boolean(),
    quotaWarningPercent: z.number().int(),
    quotaLowPriorityStop: z.number().int(),
  })
  .strict();
const actionSchema = z.object({ reason: z.string().min(3).max(500) }).strict();
const uuid = z.string().uuid();

async function actor() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return user.userId;
}
async function json(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
  try {
    return (await request.json()) as unknown;
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}
const dto = (value: LineChannelConfiguration) => ({
  ...value,
  lastVerifiedAt: value.lastVerifiedAt?.toISOString() ?? null,
  createdAt: value.createdAt.toISOString(),
  updatedAt: value.updatedAt.toISOString(),
});
async function repository() {
  const db = await import('@bunshin/database');
  return new db.PrismaLineConfigurationRepository();
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

export function listLineConfigurationsResponse(request: Request) {
  return respond(request, async () => ({
    environment: currentLineEnvironment(),
    urls: lineEndpointUrls(),
    configurations: (
      await new ListLineConfigurations(await repository()).execute(
        await actor(),
        currentLineEnvironment(),
      )
    ).map(dto),
  }));
}

export function createLineConfigurationResponse(request: Request) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = createSchema.safeParse(await json(request));
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
      return dto(
        await new CreateLineConfigurationVersion(
          await repository(),
          new AesGcmLineSecretCrypto(),
        ).execute({
          actorUserId: await actor(),
          environment: currentLineEnvironment(),
          ...parsed.data,
          liffId: parsed.data.liffId ?? null,
        }),
      );
    },
    201,
  );
}

export function activateLineConfigurationResponse(request: Request, idValue: string) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const id = uuid.safeParse(idValue);
    const parsed = actionSchema.safeParse(await json(request));
    if (!id.success || !parsed.success)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    return dto(
      await new ActivateLineConfiguration(await repository()).execute({
        actorUserId: await actor(),
        configurationId: id.data,
        environment: currentLineEnvironment(),
        reason: parsed.data.reason,
      }),
    );
  });
}

export function testLineConfigurationResponse(request: Request, idValue: string) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const id = uuid.safeParse(idValue);
    if (!id.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid id');
    return new TestLineConfigurationConnection(
      await repository(),
      new AesGcmLineSecretCrypto(),
      new LineConnectionTestAdapter(),
    ).execute({
      actorUserId: await actor(),
      configurationId: id.data,
      environment: currentLineEnvironment(),
      callbackUrl: lineEndpointUrls().callbackUrl,
    });
  });
}
