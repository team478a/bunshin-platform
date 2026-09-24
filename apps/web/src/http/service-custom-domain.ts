import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import {
  type VercelCustomDomainProvider,
  vercelCustomDomainProviderFromEnvironment,
} from '../services/vercel-custom-domain';

const uuid = z.string().uuid();

const customDomainSchema = z
  .object({
    hostname: z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(253)
      .regex(/^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/),
    status: z.enum(['DRAFT', 'VERIFIED', 'ACTIVE', 'DISABLED']),
    verificationNote: z.union([z.literal(''), z.string().trim().max(1000)]),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export async function updateServiceCustomDomainResponse(request: Request, configurationId: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    if (!uuid.safeParse(configurationId).success)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid service id');
    const value = customDomainSchema.parse(await request.json());
    if (['ACTIVE', 'VERIFIED'].includes(value.status))
      throw new ApplicationError(
        'VALIDATION_ERROR',
        '独自ドメインの公開機能は準備中です。準備中として保存してください。',
      );
    if (
      ['localhost', 'vercel.app'].some(
        (suffix) => value.hostname === suffix || value.hostname.endsWith(`.${suffix}`),
      )
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid custom domain');
    if (
      process.env.APP_URL &&
      value.hostname === new URL(process.env.APP_URL).hostname.toLowerCase()
    )
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'システム本体のドメインはサービス専用に設定できません。',
      );

    const db = await import('@bunshin/database');
    const saved = await db.prisma.$transaction(async (tx) => {
      const admin = await tx.platformAdmin.findFirst({
        where: { userId: user.userId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      });
      if (admin === null)
        throw new ApplicationError('FORBIDDEN', 'platform administrator required');
      const configuration = await tx.serviceConfiguration.findUnique({
        where: { id: configurationId },
        include: { customDomain: true },
      });
      if (configuration === null) throw new ApplicationError('NOT_FOUND', 'service not found');
      const entitlement = await tx.organizationEntitlement.findUnique({
        where: { workspaceId: configuration.workspaceId },
        select: { customDomainEnabled: true, suspended: true },
      });
      if (entitlement?.suspended)
        throw new ApplicationError('FORBIDDEN', 'organization operations are suspended');
      if (entitlement && !entitlement.customDomainEnabled && value.status !== 'DISABLED')
        throw new ApplicationError(
          'FORBIDDEN',
          'custom domain is not included in the organization contract',
        );
      if (value.status === 'ACTIVE' && configuration.customDomain?.status !== 'VERIFIED')
        throw new ApplicationError('VALIDATION_ERROR', 'domain must be verified before activation');
      const now = new Date();
      const customDomain = await tx.serviceCustomDomain.upsert({
        where: { groupId: configuration.groupId },
        create: {
          workspaceId: configuration.workspaceId,
          groupId: configuration.groupId,
          configurationId: configuration.id,
          hostname: value.hostname,
          status: value.status,
          verificationNote: value.verificationNote || null,
          verifiedAt: value.status === 'VERIFIED' ? now : null,
          activatedAt: null,
        },
        update: {
          hostname: value.hostname,
          status: value.status,
          verificationNote: value.verificationNote || null,
          verifiedAt: null,
          activatedAt: null,
        },
      });
      await tx.serviceConfigurationAudit.create({
        data: {
          workspaceId: configuration.workspaceId,
          groupId: configuration.groupId,
          configurationId: configuration.id,
          action: 'CUSTOM_DOMAIN_UPDATED',
          beforeData: configuration.customDomain
            ? {
                hostname: configuration.customDomain.hostname,
                status: configuration.customDomain.status,
                verificationNote: configuration.customDomain.verificationNote,
              }
            : {},
          afterData: {
            hostname: customDomain.hostname,
            status: customDomain.status,
            verificationNote: customDomain.verificationNote,
          },
          reason: value.reason,
          performedByUserId: user.userId,
        },
      });
      return {
        hostname: customDomain.hostname,
        status: customDomain.status,
        verificationNote: customDomain.verificationNote,
        verifiedAt: customDomain.verifiedAt?.toISOString() ?? null,
        activatedAt: customDomain.activatedAt?.toISOString() ?? null,
      };
    });
    return Response.json(
      { data: saved, requestId },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}

export async function synchronizeServiceCustomDomainResponse(
  request: Request,
  configurationId: string,
  provider?: Pick<VercelCustomDomainProvider, 'synchronize'>,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    if (!uuid.safeParse(configurationId).success)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid service id');

    const db = await import('@bunshin/database');
    const [admin, configuration] = await Promise.all([
      db.prisma.platformAdmin.findFirst({
        where: { userId: user.userId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      }),
      db.prisma.serviceConfiguration.findUnique({
        where: { id: configurationId },
        include: { customDomain: true },
      }),
    ]);
    if (!admin) throw new ApplicationError('FORBIDDEN', 'platform administrator required');
    if (!configuration?.customDomain)
      throw new ApplicationError('NOT_FOUND', 'custom domain not found');
    const entitlement = await db.prisma.organizationEntitlement.findUnique({
      where: { workspaceId: configuration.workspaceId },
      select: { customDomainEnabled: true, suspended: true },
    });
    if (entitlement?.suspended)
      throw new ApplicationError('FORBIDDEN', 'organization operations are suspended');
    if (entitlement && !entitlement.customDomainEnabled)
      throw new ApplicationError(
        'FORBIDDEN',
        'custom domain is not included in the organization contract',
      );
    if (configuration.customDomain.status === 'DISABLED')
      throw new ApplicationError('CONFLICT', '停止中の独自ドメインは確認できません。');

    const connection = await (provider ?? vercelCustomDomainProviderFromEnvironment()).synchronize(
      configuration.customDomain.hostname,
    );
    const now = new Date();
    const saved = await db.prisma.$transaction(async (tx) => {
      const current = await tx.serviceCustomDomain.findUnique({
        where: { id: configuration.customDomain!.id },
      });
      if (!current || current.hostname !== configuration.customDomain!.hostname)
        throw new ApplicationError(
          'CONFLICT',
          '確認中にドメインが変更されました。画面を更新してください。',
        );
      const customDomain = await tx.serviceCustomDomain.update({
        where: { id: current.id },
        data: {
          status: connection.status,
          verificationNote: connection.note,
          verifiedAt: connection.status === 'DRAFT' ? null : (current.verifiedAt ?? now),
          activatedAt: connection.status === 'ACTIVE' ? (current.activatedAt ?? now) : null,
        },
      });
      await tx.serviceConfigurationAudit.create({
        data: {
          workspaceId: configuration.workspaceId,
          groupId: configuration.groupId,
          configurationId: configuration.id,
          action: 'CUSTOM_DOMAIN_CONNECTION_SYNCHRONIZED',
          beforeData: {
            hostname: current.hostname,
            status: current.status,
            verificationNote: current.verificationNote,
          },
          afterData: {
            hostname: customDomain.hostname,
            status: customDomain.status,
            verificationNote: customDomain.verificationNote,
          },
          reason: 'VercelとDNSの接続状態を確認',
          performedByUserId: user.userId,
        },
      });
      return customDomain;
    });
    return Response.json(
      {
        data: {
          hostname: saved.hostname,
          status: saved.status,
          verificationNote: saved.verificationNote,
          verifiedAt: saved.verifiedAt?.toISOString() ?? null,
          activatedAt: saved.activatedAt?.toISOString() ?? null,
        },
        requestId,
      },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
