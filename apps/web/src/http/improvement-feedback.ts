import 'server-only';
import {
  RecordImprovementFeedback,
  IMPROVEMENT_FEEDBACK_CATEGORIES,
  IMPROVEMENT_FEEDBACK_SURFACES,
  IMPROVEMENT_FEEDBACK_IMPACTS,
  type ImprovementFeedbackRepository,
} from '@bunshin/application';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveMemberServiceContext } from '../services/public-service';

const schema = z
  .object({
    submissionKey: z.string().uuid(),
    category: z.enum(IMPROVEMENT_FEEDBACK_CATEGORIES),
    surface: z.enum(IMPROVEMENT_FEEDBACK_SURFACES),
    impact: z.enum(IMPROVEMENT_FEEDBACK_IMPACTS),
  })
  .strict();

async function boundedBody(request: Request): Promise<unknown> {
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json' ||
    !request.body
  )
    throw new ApplicationError('VALIDATION_ERROR', 'JSON required');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 2048) {
        await reader.cancel();
        throw new ApplicationError('VALIDATION_ERROR', 'feedback body too large');
      }
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw new ApplicationError('VALIDATION_ERROR', 'invalid feedback JSON');
  } finally {
    reader.releaseLock();
  }
}
interface Dependencies {
  actor(): Promise<string | null>;
  scope(slug: string, actor: string): Promise<{ workspaceId: string; serviceId: string }>;
  repository(): Promise<ImprovementFeedbackRepository>;
}
const defaults: Dependencies = {
  actor: async () => (await (await currentUserProvider()).getCurrentUser())?.userId ?? null,
  scope: resolveMemberServiceContext,
  repository: async () => {
    const db = await import('@bunshin/database');
    return new db.PrismaImprovementFeedbackRepository();
  },
};
export async function improvementFeedbackResponse(
  request: Request,
  slug: string,
  bunshinId: string,
  dependencies: Dependencies = defaults,
): Promise<Response> {
  const headers = { 'cache-control': 'no-store' };
  try {
    requireSameOrigin(request);
    const actorUserId = await dependencies.actor();
    if (!actorUserId) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    if (!z.string().uuid().safeParse(bunshinId).success)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid bunshin id');
    const parsed = schema.safeParse(await boundedBody(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid feedback');
    const scope = await dependencies.scope(slug, actorUserId);
    const receipt = await new RecordImprovementFeedback(await dependencies.repository()).execute({
      ...scope,
      bunshinId,
      actorUserId,
      packageKey: 'SOCIAL',
      ...parsed.data,
    });
    return Response.json(
      { data: { id: receipt.id, createdAt: receipt.createdAt.toISOString() } },
      { status: 200, headers },
    );
  } catch (error) {
    const mapped = toApiError(error, 'improvement-feedback');
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
