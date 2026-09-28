import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveMemberServiceContext } from '../services/public-service';
import {
  deferOnboardingRefinement,
  nextOnboardingRefinement,
  nextOnboardingRefinementAt,
  readOnboardingRefinementState,
  readServiceOnboardingAnswers,
} from '../services/service-onboarding-response';
import { readServiceOnboardingSettings } from '../services/service-onboarding-settings';

const schema = z.object({ question: z.string().trim().min(1).max(1000) }).strict();

export async function deferServiceOnboardingRefinement(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const headers = { 'cache-control': 'private, no-store' };
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json')) {
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    }
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const body: unknown = await request.json().catch(() => {
      throw new ApplicationError('VALIDATION_ERROR', 'valid JSON required');
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'valid question required');
    const value = parsed.data;
    const service = await resolveMemberServiceContext(serviceSlug, actor.userId);
    const settings = readServiceOnboardingSettings(
      service.configuration.registration.onboardingConfig,
      service.configuration.registration.surveyConfig,
    );
    const db = await import('@bunshin/database');
    const owner = {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      userId: actor.userId,
      groupMembership: {
        status: 'ACTIVE' as const,
        group: { status: 'ACTIVE' as const, workspace: { status: 'ACTIVE' as const } },
      },
    };
    const response = await db.prisma.serviceOnboardingResponse.findFirst({
      where: owner,
      select: {
        id: true,
        groupMembershipId: true,
        answers: true,
        refinementState: true,
        nextRefinementAt: true,
        updatedAt: true,
      },
    });
    if (!response) throw new ApplicationError('FORBIDDEN', 'completed service onboarding required');
    const now = new Date();
    // A retry of a committed deferral must not prolong the cooldown or append history.
    const duplicate =
      settings.questions.some((question) => question.trim() === value.question) &&
      readOnboardingRefinementState(response.refinementState).deferred.some(
        (entry) => entry.question === value.question && new Date(entry.until) > now,
      );
    if (duplicate) return Response.json({ data: { deferred: true }, requestId }, { headers });
    const candidate = nextOnboardingRefinement(
      settings.questions,
      readServiceOnboardingAnswers(response.answers),
      { state: response.refinementState, nextRefinementAt: response.nextRefinementAt, now },
    );
    if (!candidate || candidate.question.trim() !== value.question) {
      throw new ApplicationError('CONFLICT', 'refinement question changed; refresh the page');
    }
    const updated = await db.prisma.serviceOnboardingResponse.updateMany({
      where: {
        ...owner,
        id: response.id,
        groupMembershipId: response.groupMembershipId,
        updatedAt: response.updatedAt,
      },
      data: {
        refinementState: deferOnboardingRefinement(
          settings.questions,
          value.question,
          response.refinementState,
          now,
        ),
        nextRefinementAt: nextOnboardingRefinementAt(now),
      },
    });
    if (updated.count !== 1)
      throw new ApplicationError('CONFLICT', 'onboarding changed; refresh the page');
    return Response.json({ data: { deferred: true }, requestId }, { headers });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
