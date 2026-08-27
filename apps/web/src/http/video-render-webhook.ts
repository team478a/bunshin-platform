import 'server-only';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { requestIdFromHeader } from '@bunshin/observability';
import { z } from 'zod';
import { createVideoRenderJobHandler } from '../jobs/video-render-job-handler';
import { HkdfVideoRenderWebhookSigner } from '../video/video-render-webhook-signer';

const bodySchema = z
  .object({
    id: z.string().min(1).max(255),
    metadata: z.string().uuid(),
    status: z.enum(['planned', 'waiting', 'transcribing', 'rendering', 'succeeded', 'failed']),
  })
  .passthrough();

interface WebhookDependencies {
  verifyState(state: string): { workspaceId: string; renderId: string };
  findRender(input: { workspaceId: string; renderId: string }): Promise<{
    status: string;
    externalJobId: string | null;
  } | null>;
  reconcile(input: { workspaceId: string; renderId: string }): Promise<{ status: string }>;
}

async function configuredDependencies(): Promise<WebhookDependencies> {
  const signer = new HkdfVideoRenderWebhookSigner();
  const db = await import('@bunshin/database');
  const repository = new db.PrismaVideoRenderRepository();
  const handler = createVideoRenderJobHandler();
  return {
    verifyState: (state) => signer.verify(state),
    findRender: async (input) => {
      const value = await repository.findForExecution(input);
      return value
        ? { status: value.render.status, externalJobId: value.render.externalJobId }
        : null;
    },
    reconcile: (input) => handler.execute(input),
  };
}

export async function videoRenderWebhookResponse(
  request: Request,
  dependenciesFactory: () => Promise<WebhookDependencies> = configuredDependencies,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const contentLength = Number(request.headers.get('content-length') ?? '0');
    if (
      !request.headers.get('content-type')?.startsWith('application/json') ||
      contentLength > 65_536
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid webhook request');
    const state = new URL(request.url).searchParams.get('state');
    if (!state) throw new ApplicationError('FORBIDDEN', 'webhook state required');
    const dependencies = await dependenciesFactory();
    const claims = dependencies.verifyState(state);
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > 65_536)
      throw new ApplicationError('VALIDATION_ERROR', 'webhook body too large');
    const body = bodySchema.parse(JSON.parse(raw));
    if (body.metadata !== claims.renderId)
      throw new ApplicationError('FORBIDDEN', 'webhook metadata mismatch');
    const render = await dependencies.findRender(claims);
    if (!render) throw new ApplicationError('NOT_FOUND', 'video render not found');
    // The callback is only a wake-up signal. Never submit from a callback and never trust its status.
    if (!render.externalJobId || render.externalJobId !== body.id || render.status === 'QUEUED')
      return new Response(null, { status: 202 });
    if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(render.status))
      return new Response(null, { status: 204 });
    const result = await dependencies.reconcile(claims);
    return new Response(null, { status: result.status === 'PENDING' ? 202 : 204 });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
