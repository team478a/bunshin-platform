import 'server-only';
import { createHmac } from 'node:crypto';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger } from '@bunshin/observability';
import { ApplicationError } from '@bunshin/shared';
import { hasServiceSocialFeedbackSurface } from './improvement-feedback-admin-data';
import {
  OVERVIEW_READ_LIMIT,
  projectOverviewPreview,
  type OverviewPackage,
} from './service-improvement-admin-preview';
import type { FeedbackPreviewWindow } from './improvement-feedback-admin-preview';

export async function hasTrainingOverviewSurface(input: {
  workspaceId: string;
  serviceId: string;
}) {
  const db = await import('@bunshin/database');
  return Boolean(
    await db.prisma.serviceProgram.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.serviceId,
        settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
      },
      select: { id: true },
    }),
  );
}
/** Capability/history probes are not authorization. Call only after managed service resolution. */
export async function availableOverviewPackages(input: {
  workspaceId: string;
  serviceId: string;
}): Promise<OverviewPackage[]> {
  const [social, training] = await Promise.all([
    hasServiceSocialFeedbackSurface(input),
    hasTrainingOverviewSurface(input),
  ]);
  return [...(social ? ['SOCIAL' as const] : []), ...(training ? ['TRAINING' as const] : [])];
}
export async function loadServiceOverviewPreview(input: {
  workspaceId: string;
  serviceId: string;
  actorUserId: string;
  window: FeedbackPreviewWindow;
  packageKey: OverviewPackage;
}) {
  const env = getServerEnvironment();
  const environment = {
    development: 'DEVELOPMENT',
    staging: 'STAGING',
    production: 'PRODUCTION',
  } as const;
  const scope = {
    tenantRef: input.workspaceId,
    workspaceId: input.workspaceId,
    serviceId: input.serviceId,
    environment: environment[env.APP_ENV],
  };
  const reference = (parts: string[]) =>
    createHmac('sha256', env.SESSION_SECRET).update(JSON.stringify(parts)).digest('hex');
  const audit = {
    route: '/api/services/[serviceSlug]/improvement-overview',
    scopeRef: reference([input.workspaceId, input.serviceId]),
    actorRef: reference([input.workspaceId, input.serviceId, input.actorUserId]),
    week: input.window.week,
    packageKey: input.packageKey,
    policyVersion: 'service-overview-preview-v1',
  };
  const logger = createLogger();
  logger.info('Service improvement overview read started', { ...audit, status: 'STARTED' });
  try {
    const db = await import('@bunshin/database');
    const overview = await new db.PrismaServiceImprovementOverviewReader(db.prisma, scope).read(
      {
        actorUserId: input.actorUserId,
        scope,
        fromInclusive: input.window.fromInclusive,
        toExclusive: input.window.toExclusive,
        limit: OVERVIEW_READ_LIMIT,
      },
      input.packageKey,
    );
    const preview = projectOverviewPreview(overview, input.window, input.packageKey);
    logger.info('Service improvement overview read finished', {
      ...audit,
      status: 'READ_COMPLETED',
    });
    return preview;
  } catch (error) {
    if (error instanceof ApplicationError && ['NOT_FOUND', 'FORBIDDEN'].includes(error.code)) {
      logger.info('Service improvement overview read denied', { ...audit, status: 'DENIED' });
      throw error;
    }
    logger.error('Service improvement overview unavailable', {
      ...audit,
      status: 'UNAVAILABLE',
      errorCode: 'OVERVIEW_UNAVAILABLE',
    });
    throw new ApplicationError(
      'DATABASE_UNAVAILABLE',
      '集計を取得できませんでした。0件とは判定していません。',
    );
  }
}
