import { ProductPackService } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { requireSameOrigin } from '../../../../../src/auth/request-security';
import { resolveServiceContentContext } from '../../../../../src/http/service-content-context';

const createSchema = z.object({ groupId: z.uuid(), name: z.string().min(1).max(160) }).strict();

async function context(serviceSlug: string) {
  const { actorUserId, service } = await resolveServiceContentContext(serviceSlug);
  const db = await import('@bunshin/database');
  return {
    scope: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId,
    },
    value: new ProductPackService(new db.PrismaProductPackRepository()),
  };
}

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  return respond(request, async () => {
    const { scope, value } = await context((await params).serviceSlug);
    return value.list(scope);
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const { scope, value } = await context((await params).serviceSlug);
      const body = createSchema.parse(await request.json());
      if (body.groupId !== scope.groupId)
        throw new ApplicationError('FORBIDDEN', 'service boundary mismatch');
      return value.createPack({ ...scope, name: body.name });
    },
    201,
  );
}
