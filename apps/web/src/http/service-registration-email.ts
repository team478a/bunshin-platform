import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import {
  ServiceEmailSecretCrypto,
  ServiceRegistrationResendAdapter,
  serviceEmailApiKey,
} from '../email/service-registration-email';
import { resolveManagedServiceContext } from '../services/public-service';

const schema = z
  .object({
    enabled: z.boolean(),
    providerMode: z.enum(['PLATFORM', 'DEDICATED_RESEND']),
    apiKey: z.string().max(2000).optional(),
    fromName: z.string().trim().min(1).max(120),
    fromEmail: z.email().max(320),
    replyToEmail: z.union([z.literal(''), z.email().max(320)]),
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(10_000),
  })
  .strict();

async function context(serviceSlug: string) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return { actor, service: await resolveManagedServiceContext(serviceSlug, actor.userId) };
}

function response(request: Request, operation: () => Promise<unknown>) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  return operation()
    .then((data) =>
      Response.json({ data, requestId }, { headers: { 'cache-control': 'no-store' } }),
    )
    .catch((error) => {
      const mapped = toApiError(error, requestId);
      return Response.json(mapped.body, { status: mapped.status });
    });
}

export function saveServiceRegistrationEmailResponse(request: Request, serviceSlug: string) {
  return response(request, async () => {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const value = schema.parse(await request.json());
    const { actor, service } = await context(serviceSlug);
    const db = await import('@bunshin/database');
    const existing = await db.prisma.serviceRegistrationEmailConfiguration.findUnique({
      where: { groupId: service.serviceId },
    });
    let secret = existing
      ? {
          encryptedApiKey: existing.encryptedApiKey,
          apiKeyMask: existing.apiKeyMask,
          keyVersion: existing.keyVersion,
        }
      : { encryptedApiKey: null, apiKeyMask: null, keyVersion: 1 };
    if (value.apiKey?.trim()) {
      const encrypted = new ServiceEmailSecretCrypto().encrypt(
        value.apiKey,
        service.workspaceId,
        service.serviceId,
      );
      secret = {
        encryptedApiKey: encrypted.encryptedValue,
        apiKeyMask: encrypted.mask,
        keyVersion: encrypted.keyVersion,
      };
    }
    if (value.providerMode === 'DEDICATED_RESEND' && !secret.encryptedApiKey)
      throw new ApplicationError('VALIDATION_ERROR', '専用Resend APIキーを入力してください');
    const saved = await db.prisma.serviceRegistrationEmailConfiguration.upsert({
      where: { groupId: service.serviceId },
      create: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        configurationId: service.configuration.id,
        updatedByUserId: actor.userId,
        enabled: value.enabled,
        providerMode: value.providerMode,
        fromName: value.fromName,
        fromEmail: value.fromEmail,
        subject: value.subject,
        body: value.body,
        replyToEmail: value.replyToEmail || null,
        ...secret,
      },
      update: {
        enabled: value.enabled,
        providerMode: value.providerMode,
        fromName: value.fromName,
        fromEmail: value.fromEmail,
        replyToEmail: value.replyToEmail || null,
        subject: value.subject,
        body: value.body,
        updatedByUserId: actor.userId,
        lastVerifiedAt: null,
        lastErrorCategory: null,
        ...secret,
      },
    });
    return { id: saved.id, apiKeyMask: saved.apiKeyMask, verified: false };
  });
}

export function testServiceRegistrationEmailResponse(request: Request, serviceSlug: string) {
  return response(request, async () => {
    requireSameOrigin(request);
    const { actor, service } = await context(serviceSlug);
    const db = await import('@bunshin/database');
    const [configuration, user] = await Promise.all([
      db.prisma.serviceRegistrationEmailConfiguration.findUnique({
        where: { groupId: service.serviceId },
      }),
      db.prisma.user.findUnique({ where: { id: actor.userId }, select: { email: true } }),
    ]);
    if (!configuration || !user?.email)
      throw new ApplicationError('CONFLICT', '設定保存と管理者メールアドレスが必要です');
    try {
      await new ServiceRegistrationResendAdapter().send({
        apiKey: await serviceEmailApiKey(configuration),
        fromName: configuration.fromName,
        fromEmail: configuration.fromEmail,
        replyToEmail: configuration.replyToEmail,
        to: user.email,
        subject: `【テスト】${configuration.subject}`,
        body: configuration.body
          .replaceAll('{{name}}', '管理者')
          .replaceAll('{{serviceName}}', service.configuration.displayName),
        idempotencyKey: `service-email-test:${configuration.id}:${Date.now()}`,
      });
      await db.prisma.serviceRegistrationEmailConfiguration.update({
        where: { id: configuration.id },
        data: { lastVerifiedAt: new Date(), lastErrorCategory: null },
      });
      return { success: true };
    } catch (error) {
      await db.prisma.serviceRegistrationEmailConfiguration.update({
        where: { id: configuration.id },
        data: {
          lastVerifiedAt: null,
          lastErrorCategory: error instanceof Error ? error.message.slice(0, 80) : 'UNKNOWN',
          enabled: false,
        },
      });
      throw error;
    }
  });
}
