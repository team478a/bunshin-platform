import 'server-only';
import {
  CreateLegalDocumentDraft,
  LEGAL_DOCUMENT_TYPES,
  ListLegalDocuments,
  PublishLegalDocument,
  type LegalDocument,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const createSchema = z
  .object({ type: z.enum(LEGAL_DOCUMENT_TYPES), title: z.string(), content: z.string() })
  .strict();
const publishSchema = z.object({ effectiveAt: z.iso.datetime() }).strict();
const uuidSchema = z.string().uuid();

async function actor() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return user.userId;
}
async function body(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json is required');
  try {
    return (await request.json()) as unknown;
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}
const dto = (value: LegalDocument) => ({
  ...value,
  effectiveAt: value.effectiveAt?.toISOString() ?? null,
  publishedAt: value.publishedAt?.toISOString() ?? null,
  createdAt: value.createdAt.toISOString(),
  updatedAt: value.updatedAt.toISOString(),
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
async function repository() {
  const db = await import('@bunshin/database');
  return new db.PrismaLegalDocumentRepository();
}

export function listLegalDocumentsResponse(request: Request) {
  return respond(request, async () =>
    (await new ListLegalDocuments(await repository()).execute(await actor())).map(dto),
  );
}
export function createLegalDocumentResponse(request: Request) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = createSchema.safeParse(await body(request));
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
      return dto(
        await new CreateLegalDocumentDraft(await repository()).execute({
          actorUserId: await actor(),
          ...parsed.data,
        }),
      );
    },
    201,
  );
}
export function publishLegalDocumentResponse(request: Request, documentId: string) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const id = uuidSchema.safeParse(documentId);
    const parsed = publishSchema.safeParse(await body(request));
    if (!id.success || !parsed.success)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    return dto(
      await new PublishLegalDocument(await repository()).execute({
        actorUserId: await actor(),
        documentId: id.data,
        effectiveAt: new Date(parsed.data.effectiveAt),
      }),
    );
  });
}
