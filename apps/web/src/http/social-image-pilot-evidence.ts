import 'server-only';
import {
  ListSocialImagePilotEvidence,
  RecordSocialImagePilotEvidence,
  SOCIAL_IMAGE_PILOT_EVIDENCE_CHECKS,
  type SocialImagePilotEvidenceRecord,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const scopeSchema = z.object({ workspaceId: z.uuid(), groupId: z.uuid(), pilotId: z.uuid() });
const recordSchema = scopeSchema
  .extend({
    checkKey: z.enum(SOCIAL_IMAGE_PILOT_EVIDENCE_CHECKS),
    action: z.enum(['RECORDED', 'REVOKED']),
    reason: z.string().trim().min(10).max(1000),
    evidenceUrl: z.union([z.url(), z.literal('')]).optional(),
  })
  .strict();

async function actor() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return user.userId;
}

async function repository() {
  const db = await import('@bunshin/database');
  return new db.PrismaSocialImagePilotEvidenceRepository();
}

const dto = (value: SocialImagePilotEvidenceRecord) => ({
  ...value,
  occurredAt: value.occurredAt.toISOString(),
});

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

export function listSocialImagePilotEvidenceResponse(request: Request) {
  return respond(request, async () => {
    const url = new URL(request.url);
    const parsed = scopeSchema.safeParse({
      workspaceId: url.searchParams.get('workspaceId'),
      groupId: url.searchParams.get('groupId'),
      pilotId: url.searchParams.get('pilotId'),
    });
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid scope');
    const values = await new ListSocialImagePilotEvidence(await repository()).execute({
      ...parsed.data,
      actorUserId: await actor(),
    });
    return values.map(dto);
  });
}

export function recordSocialImagePilotEvidenceResponse(request: Request) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      let body: unknown;
      try {
        body = await request.json();
      } catch (error) {
        throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
      }
      const parsed = recordSchema.safeParse(body);
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
      return dto(
        await new RecordSocialImagePilotEvidence(await repository()).execute({
          ...parsed.data,
          actorUserId: await actor(),
          evidenceUrl: parsed.data.evidenceUrl || null,
        }),
      );
    },
    201,
  );
}
