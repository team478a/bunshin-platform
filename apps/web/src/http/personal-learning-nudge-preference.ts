import 'server-only';
import { z } from 'zod';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { requestIdFromHeader } from '@bunshin/observability';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolvePersonalLearningRequestActor } from '../services/personal-learning-request-access';
import { boundedLearningJson } from './personal-learning-request';
import { PrismaPersonalLearningNudgePreferenceRepository, prisma } from '@bunshin/database';
import {
  personalLearningFeatureEnabled,
  personalLearningOfferPolicy,
} from '@bunshin/capability-training';
import { aiTrainingConsentPolicy } from '../services/ai-training-consent-policy';

const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ENABLE'), accepted: z.literal(true) }).strict(),
  z
    .object({
      action: z.literal('PAUSE'),
      days: z.union([z.literal(7), z.literal(14), z.literal(30)]),
    })
    .strict(),
  z.object({ action: z.literal('STOP') }).strict(),
  z.object({ action: z.literal('RESUME') }).strict(),
]);

export async function personalLearningNudgePreferenceResponse(
  request: Request,
  slug: string,
  enrollmentId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    if (!['GET', 'POST'].includes(request.method))
      return Response.json({ error: { code: 'METHOD_NOT_ALLOWED' } }, { status: 405, headers });
    if (request.method === 'POST') {
      requireSameOrigin(request);
      if (!request.headers.get('content-type')?.startsWith('application/json'))
        throw new ApplicationError('VALIDATION_ERROR', 'JSON required');
    }
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const actor = await resolvePersonalLearningRequestActor(slug, enrollmentId, user.userId);
    const repository = new PrismaPersonalLearningNudgePreferenceRepository(prisma);
    const enrollment = await prisma.programEnrollment.findFirst({
      where: {
        id: actor.scope.programEnrollmentId,
        workspaceId: actor.scope.workspaceId,
        groupId: actor.scope.groupId,
        groupMembershipId: actor.scope.groupMembershipId,
      },
      select: { serviceProgramId: true },
    });
    const program =
      enrollment &&
      (await prisma.serviceProgram.findFirst({
        where: {
          id: enrollment.serviceProgramId,
          workspaceId: actor.scope.workspaceId,
          groupId: actor.scope.groupId,
        },
        select: { settings: true },
      }));
    if (!program) throw new ApplicationError('NOT_FOUND', 'nudge preference unavailable');
    const offerPolicy = personalLearningOfferPolicy(program.settings);
    if (!offerPolicy) throw new ApplicationError('NOT_FOUND', 'nudge preference unavailable');
    const consentPolicy = aiTrainingConsentPolicy(offerPolicy);
    if (request.method === 'GET') {
      const preference = await repository.read(actor);
      return Response.json(
        {
          data: {
            enabled: preference?.enabled ?? true,
            // Actor resolution above requires the current V3 AI consent. A new preference therefore starts ON after consent.
            consented: true,
            pausedUntil: preference?.pausedUntil?.toISOString() ?? null,
            stoppedAt: preference?.stoppedAt?.toISOString() ?? null,
            featureEnabled: personalLearningFeatureEnabled(program.settings, 'learningNudges'),
          },
          requestId,
        },
        { headers },
      );
    }
    const raw = await boundedLearningJson(request, 2048);
    const parsed = actionSchema.safeParse(raw);
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid nudge preference');
    const currentConsent = await prisma.aiTrainingUsageConsent.findFirst({
      where: {
        workspaceId: actor.scope.workspaceId,
        groupId: actor.scope.groupId,
        programEnrollmentId: actor.scope.programEnrollmentId,
        groupMembershipId: actor.scope.groupMembershipId,
        userId: actor.scope.userId,
        consentVersion: consentPolicy.version,
      },
      select: { consentedAt: true },
    });
    if (!currentConsent) throw new ApplicationError('NOT_FOUND', 'nudge preference unavailable');
    if (parsed.data.action === 'ENABLE') {
      if (!personalLearningFeatureEnabled(program.settings, 'learningNudges'))
        throw new ApplicationError('NOT_FOUND', 'nudge preference unavailable');
      const saved = await repository.update(actor, {
        action: 'ENABLE',
        now: new Date(),
        consentVersion: consentPolicy.version,
        consentedAt: currentConsent.consentedAt,
      });
      return Response.json(
        { data: { enabled: saved.enabled, consented: true }, requestId },
        { headers },
      );
    }
    const now = new Date();
    const updated = await repository.update(actor, {
      action: parsed.data.action,
      now,
      consentVersion: consentPolicy.version,
      consentedAt: currentConsent.consentedAt,
      ...(parsed.data.action === 'PAUSE'
        ? { pauseUntil: new Date(now.getTime() + parsed.data.days * 86_400_000) }
        : {}),
    });
    return Response.json(
      {
        data: {
          enabled: updated.enabled,
          pausedUntil: updated.pausedUntil?.toISOString() ?? null,
          stoppedAt: updated.stoppedAt?.toISOString() ?? null,
        },
        requestId,
      },
      { headers },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
