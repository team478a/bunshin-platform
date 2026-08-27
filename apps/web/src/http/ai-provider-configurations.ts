import 'server-only';
import {
  ActivateAiProviderConfiguration,
  CreateAiProviderConfigurationVersion,
  ListAiProviderConfigurations,
  PauseAiProviderConfiguration,
  TestAiProviderConfigurationConnection,
  type AiProviderConfiguration,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import {
  AesGcmAiProviderSecretCrypto,
  AiProviderConnectionTestAdapter,
  currentAiProviderEnvironment,
} from '../ai/secure-provider-configuration';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const createSchema = z
  .object({
    provider: z.enum(['OPENAI', 'GROK', 'EXA', 'FIRECRAWL', 'CREATOMATE']),
    reason: z.string().min(3).max(500),
    model: z.string().max(120).nullable().optional(),
    dailyBudgetUsd: z.number().min(0).max(10_000),
    monthlyBudgetUsd: z.number().min(0).max(100_000),
    requestCostUsd: z.number().min(0).max(1_000).optional(),
    apiKey: z.string().min(8).max(2000).nullable().optional(),
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
const dto = (value: AiProviderConfiguration) => ({
  ...value,
  lastVerifiedAt: value.lastVerifiedAt?.toISOString() ?? null,
  createdAt: value.createdAt.toISOString(),
  updatedAt: value.updatedAt.toISOString(),
});
async function repository() {
  const db = await import('@bunshin/database');
  return new db.PrismaAiProviderConfigurationRepository();
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
const micros = (usd: number) => Math.round(usd * 1_000_000);

export function listAiProviderConfigurationsResponse(request: Request) {
  return respond(request, async () => ({
    environment: currentAiProviderEnvironment(),
    configurations: (
      await new ListAiProviderConfigurations(await repository()).execute(
        await actor(),
        currentAiProviderEnvironment(),
      )
    ).map(dto),
  }));
}

export function createAiProviderConfigurationResponse(request: Request) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = createSchema.safeParse(await json(request));
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
      return dto(
        await new CreateAiProviderConfigurationVersion(
          await repository(),
          new AesGcmAiProviderSecretCrypto(),
        ).execute({
          actorUserId: await actor(),
          environment: currentAiProviderEnvironment(),
          provider: parsed.data.provider,
          reason: parsed.data.reason,
          model: parsed.data.model ?? null,
          dailyBudgetUsdMicros: micros(parsed.data.dailyBudgetUsd),
          monthlyBudgetUsdMicros: micros(parsed.data.monthlyBudgetUsd),
          requestCostUsdMicros: micros(parsed.data.requestCostUsd ?? 0),
          apiKey: parsed.data.apiKey ?? null,
        }),
      );
    },
    201,
  );
}

export function testAiProviderConfigurationResponse(request: Request, idValue: string) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const id = uuid.safeParse(idValue);
    if (!id.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid id');
    return new TestAiProviderConfigurationConnection(
      await repository(),
      new AesGcmAiProviderSecretCrypto(),
      new AiProviderConnectionTestAdapter(),
    ).execute({
      actorUserId: await actor(),
      configurationId: id.data,
      environment: currentAiProviderEnvironment(),
    });
  });
}

async function statusAction(request: Request, idValue: string, action: 'activate' | 'pause') {
  return respond(request, async () => {
    requireSameOrigin(request);
    const id = uuid.safeParse(idValue);
    const parsed = actionSchema.safeParse(await json(request));
    if (!id.success || !parsed.success)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const input = {
      actorUserId: await actor(),
      configurationId: id.data,
      environment: currentAiProviderEnvironment(),
      reason: parsed.data.reason,
    };
    const value =
      action === 'activate'
        ? await new ActivateAiProviderConfiguration(await repository()).execute(input)
        : await new PauseAiProviderConfiguration(await repository()).execute(input);
    return dto(value);
  });
}

export function activateAiProviderConfigurationResponse(request: Request, idValue: string) {
  return statusAction(request, idValue, 'activate');
}

export function pauseAiProviderConfigurationResponse(request: Request, idValue: string) {
  return statusAction(request, idValue, 'pause');
}
