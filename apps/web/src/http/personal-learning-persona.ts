import 'server-only';
import { z } from 'zod';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { requestIdFromHeader } from '@bunshin/observability';
import { resolvePersonalLearningRequestActor } from '../services/personal-learning-request-access';
import { boundedLearningJson } from './personal-learning-request';
import { PrismaPersonalLearningPersonaRepository, prisma } from '@bunshin/database';

const input = z
  .object({
    itemId: z.uuid(),
    value: z.string().trim().min(1).max(1000).optional(),
    status: z.enum(['CONFIRMED', 'REJECTED']).optional(),
  })
  .strict()
  .refine((value) => value.value !== undefined || value.status !== undefined);
const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };

export async function personalLearningPersonaResponse(
  request: Request,
  serviceSlug: string,
  enrollmentId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    if (!['GET', 'PATCH', 'DELETE', 'POST'].includes(request.method))
      return Response.json({ error: { code: 'METHOD_NOT_ALLOWED' } }, { status: 405, headers });
    if (request.method !== 'GET') {
      requireSameOrigin(request);
      if (!request.headers.get('content-type')?.startsWith('application/json'))
        throw new ApplicationError('VALIDATION_ERROR', 'JSON required');
    }
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const actor = await resolvePersonalLearningRequestActor(
      serviceSlug,
      enrollmentId,
      user.userId,
      undefined,
      undefined,
      { allowUnselectedTopic: true },
    );
    const repository = new PrismaPersonalLearningPersonaRepository(prisma);
    if (request.method === 'GET') {
      const profile = await repository.profile(actor.scope);
      const items = await repository.list(actor.scope);
      const suppressedAttributes = await repository.listSuppressedAttributes(actor.scope);
      return Response.json(
        {
          data: items.map((item) => ({
            id: item.id,
            attributeKey: item.attributeKey,
            value: item.value,
            status: item.status,
            evidenceType: item.evidenceType,
            evidenceId: item.evidenceId,
            evidenceCreatedAt: item.evidenceCreatedAt.toISOString(),
          })),
          suppressedAttributes,
          profile: profile
            ? {
                optedIn: profile.optedIn,
                consentVersion: profile.consentVersion,
                optedInAt: profile.optedInAt?.toISOString() ?? null,
                optedOutAt: profile.optedOutAt?.toISOString() ?? null,
                dismissedUntil: profile.dismissedUntil?.toISOString() ?? null,
                companyName: profile.companyName,
                ageBand: profile.ageBand,
                industryJob: profile.industryJob,
              }
            : null,
          requestId,
        },
        { headers },
      );
    }
    const json = await boundedLearningJson(request, 4096);
    if (request.method === 'POST') {
      const action = z
        .object({
          action: z.literal('opt-in'),
          enabled: z.boolean(),
          consentVersion: z.string().trim().min(1).max(80).optional(),
          deleteSavedData: z.boolean().optional(),
        })
        .strict()
        .safeParse(json);
      if (action.success) {
        const updated = await repository.setOptIn(actor.scope, {
          enabled: action.data.enabled,
          ...(action.data.consentVersion ? { consentVersion: action.data.consentVersion } : {}),
          ...(action.data.deleteSavedData !== undefined
            ? { deleteSavedData: action.data.deleteSavedData }
            : {}),
        });
        if (!updated) throw new ApplicationError('NOT_FOUND', 'persona preference unavailable');
        return Response.json(
          {
            data: {
              optedIn: updated.profile.optedIn,
              deleted: action.data.deleteSavedData === true,
            },
            requestId,
          },
          { headers },
        );
      }
      const dismiss = z
        .object({ action: z.literal('dismiss') })
        .strict()
        .safeParse(json);
      if (dismiss.success) {
        const dismissed = await repository.dismissInvitation(actor.scope, 30);
        if (!dismissed) throw new ApplicationError('NOT_FOUND', 'persona preference unavailable');
        return Response.json({ data: { dismissed: true }, requestId }, { headers });
      }
      const parsed = z
        .object({ allowReinferenceFor: z.string().trim().min(1).max(80) })
        .strict()
        .safeParse(json);
      if (!parsed.success)
        throw new ApplicationError('VALIDATION_ERROR', 'invalid re-inference permission');
      const allowed = await repository.allowReinference(
        actor.scope,
        parsed.data.allowReinferenceFor,
      );
      if (!allowed) throw new ApplicationError('NOT_FOUND', 'suppression unavailable');
      return Response.json(
        { data: { allowed: true, attributeKey: parsed.data.allowReinferenceFor }, requestId },
        { headers },
      );
    }
    const profileInput = z
      .object({
        action: z.literal('profile'),
        companyName: z.string().trim().max(80).nullable(),
        ageBand: z.string().max(20).nullable(),
        industryJob: z.string().trim().max(80).nullable(),
      })
      .strict()
      .safeParse(json);
    if (profileInput.success) {
      const saved = await repository.saveLearnerProfile(actor.scope, profileInput.data);
      if (saved.outcome === 'NOT_FOUND')
        throw new ApplicationError('NOT_FOUND', 'persona preference unavailable');
      if (saved.outcome !== 'SAVED')
        throw new ApplicationError('VALIDATION_ERROR', 'profile contains unavailable information');
      return Response.json(
        {
          data: {
            companyName: saved.profile.companyName,
            ageBand: saved.profile.ageBand,
            industryJob: saved.profile.industryJob,
          },
          requestId,
        },
        { headers },
      );
    }
    if (request.method === 'DELETE') {
      const parsedDelete = z.object({ itemId: z.uuid() }).strict().safeParse(json);
      if (!parsedDelete.success)
        throw new ApplicationError('VALIDATION_ERROR', 'invalid persona deletion');
      const deleted = await repository.delete(actor.scope, parsedDelete.data.itemId);
      if (!deleted) throw new ApplicationError('NOT_FOUND', 'persona item unavailable');
      return Response.json({ data: { deleted: true }, requestId }, { headers });
    }
    const parsed = input.safeParse(json);
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid persona review');
    const result = await repository.review(actor.scope, parsed.data.itemId, {
      ...(parsed.data.value !== undefined ? { value: parsed.data.value } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    });
    if (result.outcome === 'NOT_FOUND')
      throw new ApplicationError('NOT_FOUND', 'persona item unavailable');
    if (result.outcome !== 'UPDATED' || !result.item)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid persona review');
    return Response.json(
      {
        data: {
          id: result.item.id,
          attributeKey: result.item.attributeKey,
          value: result.item.value,
          status: result.item.status,
          evidenceType: result.item.evidenceType,
          evidenceId: result.item.evidenceId,
          evidenceCreatedAt: result.item.evidenceCreatedAt.toISOString(),
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
