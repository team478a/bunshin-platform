import { ProductPackService } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { requireSameOrigin } from '../../../../../src/auth/request-security';

const createSchema = z
  .object({ groupId: z.string().uuid(), name: z.string().min(1).max(160) })
  .strict();

async function context(workspaceId: string) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  const db = await import('@bunshin/database');
  return {
    scope: { workspaceId: z.string().uuid().parse(workspaceId), actorUserId: user.userId },
    service: new ProductPackService(new db.PrismaProductPackRepository()),
  };
}

async function respond(request: Request, operation: () => Promise<unknown>, status = 200) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    return Response.json({ data: await operation(), requestId }, { status });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  return respond(request, async () => {
    const { workspaceId } = await params;
    const { scope, service } = await context(workspaceId);
    return service.list(scope);
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const body = createSchema.parse(await request.json());
      const { workspaceId } = await params;
      const { scope, service } = await context(workspaceId);
      return service.createPack({ ...scope, ...body });
    },
    201,
  );
}
