import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger } from '@bunshin/observability';
import { ApplicationError } from '@bunshin/shared';
import { sameImprovementScope } from '@bunshin/platform-domain';
import {
  FEEDBACK_PREVIEW_POLICY,
  projectFeedbackAdminPreview,
  type FeedbackPreviewWindow,
} from './improvement-feedback-admin-preview';

/** A scoped capability/history probe, not authorization and not a public API. */
export async function hasServiceSocialFeedbackSurface(input: {
  workspaceId: string;
  serviceId: string;
}) {
  const db = await import('@bunshin/database');
  return Boolean(
    await db.prisma.bunshin.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.serviceId,
        OR: [
          { capabilityAssignments: { some: { capabilityType: 'SOCIAL' } } },
          {
            improvementFeedback: {
              some: {
                workspaceId: input.workspaceId,
                serviceId: input.serviceId,
                packageKey: 'SOCIAL',
              },
            },
          },
        ],
      },
      select: { id: true },
    }),
  );
}

export async function loadFeedbackAdminPreview(input: {
  workspaceId: string;
  serviceId: string;
  actorUserId: string;
  window: FeedbackPreviewWindow;
}) {
  try {
    const db = await import('@bunshin/database');
    const environment = {
      development: 'DEVELOPMENT',
      staging: 'STAGING',
      production: 'PRODUCTION',
    } as const;
    const scope = {
      tenantRef: input.workspaceId,
      workspaceId: input.workspaceId,
      serviceId: input.serviceId,
      packageKey: 'SOCIAL',
      adapterKey: 'TROUBLE_FEEDBACK',
      environment: environment[getServerEnvironment().APP_ENV],
    };
    const evidence = await new db.PrismaImprovementFeedbackObservationAdapter(
      db.prisma,
      scope,
    ).reviewEvidence({
      scope,
      actorUserId: input.actorUserId,
      subject: null,
      limit: FEEDBACK_PREVIEW_POLICY.limit,
      fromInclusive: input.window.fromInclusive,
      toExclusive: input.window.toExclusive,
    });
    if (!sameImprovementScope(evidence.scope, scope) || evidence.selection.kind !== 'SERVICE')
      throw new Error('feedback preview scope mismatch');
    return {
      outcome: 'PREVIEW' as const,
      preview: projectFeedbackAdminPreview(evidence, input.window),
    };
  } catch (error) {
    if (error instanceof ApplicationError && ['NOT_FOUND', 'FORBIDDEN'].includes(error.code))
      return { outcome: 'FORBIDDEN' as const };
    createLogger().error('Feedback aggregate preview unavailable', {
      route: '/s/[serviceSlug]/manage/improvement-feedback',
      errorCode: 'FEEDBACK_PREVIEW_UNAVAILABLE',
    });
    return { outcome: 'UNAVAILABLE' as const };
  }
}
