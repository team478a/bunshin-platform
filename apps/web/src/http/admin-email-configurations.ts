import 'server-only';
import {
  ActivateAdminEmailConfiguration,
  CreateAdminEmailConfiguration,
  ListAdminEmailConfigurations,
  PauseAdminEmailConfiguration,
  TestAdminEmailConfiguration,
  type AdminEmailConfiguration,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import {
  AesGcmAdminEmailSecretCrypto,
  currentAdminEmailEnvironment,
  ResendAdminEmailConnectionTestAdapter,
} from '../email/secure-admin-email-configuration';

const createSchema = z
  .object({
    apiKey: z.string().min(16).max(2000),
    fromEmail: z.email(),
    recipientEmails: z.array(z.email()).min(1).max(10),
    reason: z.string().min(3).max(500),
  })
  .strict();
const actionSchema = z.object({ reason: z.string().min(3).max(500) }).strict();
const dto = (value: AdminEmailConfiguration) => ({
  ...value,
  lastVerifiedAt: value.lastVerifiedAt?.toISOString() ?? null,
  createdAt: value.createdAt.toISOString(),
  updatedAt: value.updatedAt.toISOString(),
});
async function actor() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return user.userId;
}
async function repository() {
  return new (await import('@bunshin/database')).PrismaAdminEmailConfigurationRepository();
}
async function json(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
  return request.json() as Promise<unknown>;
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

export const listAdminEmailConfigurationsResponse = (request: Request) =>
  respond(request, async () => ({
    environment: currentAdminEmailEnvironment(),
    configurations: (
      await new ListAdminEmailConfigurations(await repository()).execute(
        await actor(),
        currentAdminEmailEnvironment(),
      )
    ).map(dto),
  }));
export const createAdminEmailConfigurationResponse = (request: Request) =>
  respond(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = createSchema.safeParse(await json(request));
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
      return dto(
        await new CreateAdminEmailConfiguration(
          await repository(),
          new AesGcmAdminEmailSecretCrypto(),
        ).execute({
          actorUserId: await actor(),
          environment: currentAdminEmailEnvironment(),
          ...parsed.data,
        }),
      );
    },
    201,
  );
export const testAdminEmailConfigurationResponse = (request: Request, id: string) =>
  respond(request, async () => {
    requireSameOrigin(request);
    if (!z.string().uuid().safeParse(id).success)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid id');
    return new TestAdminEmailConfiguration(
      await repository(),
      new AesGcmAdminEmailSecretCrypto(),
      new ResendAdminEmailConnectionTestAdapter(),
    ).execute({
      actorUserId: await actor(),
      configurationId: id,
      environment: currentAdminEmailEnvironment(),
    });
  });
async function status(request: Request, id: string, action: 'activate' | 'pause') {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = actionSchema.safeParse(await json(request));
    if (!z.string().uuid().safeParse(id).success || !parsed.success)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const input = {
      actorUserId: await actor(),
      configurationId: id,
      environment: currentAdminEmailEnvironment(),
      reason: parsed.data.reason,
    };
    return dto(
      action === 'activate'
        ? await new ActivateAdminEmailConfiguration(await repository()).execute(input)
        : await new PauseAdminEmailConfiguration(await repository()).execute(input),
    );
  });
}
export const activateAdminEmailConfigurationResponse = (request: Request, id: string) =>
  status(request, id, 'activate');
export const pauseAdminEmailConfigurationResponse = (request: Request, id: string) =>
  status(request, id, 'pause');
