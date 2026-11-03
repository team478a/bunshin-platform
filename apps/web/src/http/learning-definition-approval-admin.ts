import 'server-only';
import { z } from 'zod';
import {
  personalLearningPreparationAccess,
  recheckPersonalLearningPreparationAccess,
} from '../services/personal-learning-preparation-access';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { requestIdFromHeader } from '@bunshin/observability';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveManagedServiceContext } from '../services/public-service';

const common = {
  operationId: z.uuid(),
  definitionKey: z.string().min(1).max(80),
  version: z.string().min(1).max(80),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  reviewDigest: z.string().regex(/^[a-f0-9]{64}$/),
  reviewedCommitSha: z.string().regex(/^[a-f0-9]{40}$/),
  reviewEvidenceKey: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/)
    .optional(),
  provenanceMode: z.literal('SERVER_V1').optional(),
};
const command = z.discriminatedUnion('action', [
  z
    .object({
      ...common,
      action: z.literal('APPROVE'),
      confirmation: z.literal('CONFIRM_DEFINITION_APPROVAL'),
      reviewChecklist: z
        .object({
          objective: z.literal(true),
          prerequisites: z.literal(true),
          concepts: z.literal(true),
          safety: z.literal(true),
          mistakes: z.literal(true),
          practice: z.literal(true),
          rubricAndMission: z.literal(true),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal('DEPRECATE'),
      confirmation: z.literal('CONFIRM_DEFINITION_WITHDRAWAL'),
    })
    .strict(),
]);
const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
function serverCommitSha() {
  const sha = process.env['VERCEL_GIT_COMMIT_SHA']?.toLowerCase() ?? '';
  return /^[a-f0-9]{40}$/.test(sha) ? sha : null;
}
export async function learningDefinitionApprovalAdminResponse(
  request: Request,
  serviceSlug: string,
): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    if (!['GET', 'POST'].includes(request.method))
      return Response.json(
        { requestId },
        { status: 405, headers: { ...headers, allow: 'GET, POST' } },
      );
    if (request.method === 'POST') requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const authority = personalLearningPreparationAccess('PERSONAL_LEARNING_DEFINITION_ADMIN');
    if (new URL(request.url).search)
      throw new ApplicationError('VALIDATION_ERROR', 'query parameters not accepted');
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch((error) => {
      if (error instanceof Error && error.message === 'SERVICE_NOT_FOUND')
        throw new ApplicationError('NOT_FOUND', 'managed service unavailable');
      throw error;
    });
    const scope = {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
    };
    if (
      authority &&
      (authority.workspaceId !== scope.workspaceId || authority.groupId !== scope.groupId)
    )
      throw new ApplicationError('NOT_FOUND', 'learning preparation unavailable');
    const db = await import('@bunshin/database');
    recheckPersonalLearningPreparationAccess('PERSONAL_LEARNING_DEFINITION_ADMIN', authority);
    const repository = new db.PrismaLearningDefinitionApprovalAdminRepository(
      db.prisma,
      undefined,
      authority,
    );
    if (request.method === 'GET') {
      const provenance = { mode: 'SERVER_V1', reviewedCommitSha: serverCommitSha() };
      const data = (await repository.list(scope)).map((item) => ({ ...item, provenance }));
      return Response.json({ data, requestId }, { headers });
    }
    if (!request.headers.get('content-type')?.startsWith('application/json') || !request.body)
      throw new ApplicationError('VALIDATION_ERROR', 'JSON required');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 4096) {
          await reader.cancel();
          return Response.json({ requestId }, { status: 413, headers });
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    let json: unknown;
    try {
      json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new ApplicationError('VALIDATION_ERROR', 'valid JSON required');
    }
    const parsed = command.safeParse(json);
    if (
      !parsed.success ||
      (parsed.data.provenanceMode === 'SERVER_V1'
        ? parsed.data.reviewEvidenceKey !== undefined
        : parsed.data.reviewEvidenceKey === undefined)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'valid review confirmation required');
    recheckPersonalLearningPreparationAccess('PERSONAL_LEARNING_DEFINITION_ADMIN', authority);
    const input = parsed.data;
    const { provenanceMode, ...fields } = input;
    const normalized = {
      ...fields,
      ...(provenanceMode ? { provenanceMode } : {}),
      reviewEvidenceKey:
        input.provenanceMode === 'SERVER_V1'
          ? `definition-review:${input.operationId}`
          : input.reviewEvidenceKey!,
    };
    return Response.json(
      {
        data:
          input.provenanceMode === 'SERVER_V1'
            ? await repository.change(scope, normalized, serverCommitSha())
            : await repository.change(scope, normalized),
        requestId,
      },
      { headers },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
