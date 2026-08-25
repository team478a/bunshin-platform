import 'server-only';
import { ProductPackService, type ProductPackVersionInput } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const uuid = z.string().uuid();
const nullableDate = z.string().datetime().nullable().optional();
const versionSchema = z
  .object({
    summary: z.string().min(1).max(1000),
    providerName: z.string().min(1).max(200),
    targetCustomer: z.string().min(1).max(1000),
    facts: z.record(z.string().min(1).max(100), z.string().min(1).max(2000)),
    faq: z
      .array(
        z
          .object({ question: z.string().min(1).max(500), answer: z.string().min(1).max(2000) })
          .strict(),
      )
      .max(100),
    suitableFor: z.array(z.string().min(1).max(500)).max(100),
    unsuitableFor: z.array(z.string().min(1).max(500)).max(100),
    validFrom: nullableDate,
    validUntil: nullableDate,
    rules: z
      .array(
        z
          .object({
            type: z.enum(['REQUIRED_DISCLOSURE', 'FORBIDDEN_EXPRESSION', 'CONDITIONAL_EXPRESSION']),
            value: z.string().min(1).max(1000),
            condition: z.string().min(1).max(1000).nullable().optional(),
          })
          .strict(),
      )
      .max(200),
    assets: z
      .array(
        z
          .object({
            type: z.enum(['IMAGE', 'VIDEO', 'DOCUMENT', 'LINK']),
            url: z.string().url().max(2048),
            label: z.string().min(1).max(200),
            usageTerms: z.string().min(1).max(2000),
            validUntil: nullableDate,
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
const assignmentSchema = z.object({ versionId: uuid, bunshinId: uuid }).strict();

async function service(workspaceId: string) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  const db = await import('@bunshin/database');
  return {
    scope: { workspaceId: uuid.parse(workspaceId), actorUserId: user.userId },
    value: new ProductPackService(new db.PrismaProductPackRepository()),
  };
}

async function body(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
  return request.json() as Promise<unknown>;
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

const toDate = (value: string | null | undefined) => (value ? new Date(value) : null);

export function createProductPackVersionResponse(
  request: Request,
  workspaceId: string,
  productPackId: string,
) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = versionSchema.parse(await body(request));
      const content: ProductPackVersionInput = {
        ...parsed,
        validFrom: toDate(parsed.validFrom),
        validUntil: toDate(parsed.validUntil),
        rules: parsed.rules.map((rule) => ({
          type: rule.type,
          value: rule.value,
          condition: rule.condition ?? null,
        })),
        assets: parsed.assets.map((asset) => ({ ...asset, validUntil: toDate(asset.validUntil) })),
      };
      const { scope, value } = await service(workspaceId);
      return value.createDraftVersion({
        ...scope,
        productPackId: uuid.parse(productPackId),
        content,
      });
    },
    201,
  );
}

export function publishProductPackVersionResponse(
  request: Request,
  workspaceId: string,
  productPackId: string,
  versionId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const { scope, value } = await service(workspaceId);
    return value.publishVersion({
      ...scope,
      productPackId: uuid.parse(productPackId),
      versionId: uuid.parse(versionId),
    });
  });
}

export function assignProductPackResponse(
  request: Request,
  workspaceId: string,
  productPackId: string,
) {
  return respond(
    request,
    async () => {
      requireSameOrigin(request);
      const parsed = assignmentSchema.parse(await body(request));
      const { scope, value } = await service(workspaceId);
      return value.assign({ ...scope, productPackId: uuid.parse(productPackId), ...parsed });
    },
    201,
  );
}

export function revokeProductPackAssignmentResponse(
  request: Request,
  workspaceId: string,
  assignmentId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const { scope, value } = await service(workspaceId);
    return value.revokeAssignment({ ...scope, assignmentId: uuid.parse(assignmentId) });
  });
}
