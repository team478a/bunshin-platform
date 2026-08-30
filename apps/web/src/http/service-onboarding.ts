import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolvePublicServiceContext } from '../services/public-service';
import { buildServiceOnboardingAnswers } from '../services/service-onboarding-response';
import { readServiceOnboardingSettings } from '../services/service-onboarding-settings';

const answersSchema = z.object({ answers: z.array(z.string().min(1).max(1000)).max(7) }).strict();

export async function saveServiceOnboardingResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json')) {
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    }
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const [service, value] = await Promise.all([
      resolvePublicServiceContext(serviceSlug),
      answersSchema.parseAsync(await request.json()),
    ]);
    const settings = readServiceOnboardingSettings(
      service.configuration.registration.onboardingConfig,
      service.configuration.registration.surveyConfig,
    );
    if (settings.questions.length === 0 || value.answers.length !== settings.questions.length) {
      throw new ApplicationError('VALIDATION_ERROR', 'all onboarding answers are required');
    }
    const entries = buildServiceOnboardingAnswers(settings.questions, value.answers);
    const db = await import('@bunshin/database');
    const membership = await db.prisma.groupMembership.findFirst({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        userId: actor.userId,
        status: 'ACTIVE',
        group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
      },
      select: { id: true },
    });
    if (!membership) throw new ApplicationError('FORBIDDEN', 'active service membership required');
    const saved = await db.prisma.serviceOnboardingResponse.upsert({
      where: { groupMembershipId: membership.id },
      create: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        groupMembershipId: membership.id,
        userId: actor.userId,
        questionsSnapshot: settings.questions,
        answers: entries,
      },
      update: {
        questionsSnapshot: settings.questions,
        answers: entries,
        completedAt: new Date(),
      },
      select: { id: true, completedAt: true },
    });
    return Response.json(
      { data: saved, requestId },
      { status: 201, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
