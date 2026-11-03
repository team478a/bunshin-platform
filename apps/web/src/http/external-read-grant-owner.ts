import 'server-only';
import { EXTERNAL_READ_CONSENT_VERSION, ManageExternalReadGrants } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { MemberUsageReadLimit } from './member-usage-read-limit';
import {
  externalReadGrantOwner,
  externalGrantOwnerManager,
  externalGrantOwnerView,
} from '../services/external-read-grant-owner';
const headers = { 'cache-control': 'private, no-store', vary: 'Cookie, Authorization' };
export const externalGrantOwnerLimit = new MemberUsageReadLimit(10);
const issueSchema = z
  .object({
    commandId: z.uuid(),
    clientId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    operation: z.literal('member-usage:read'),
    expiresInMinutes: z.number().int().min(5).max(1440),
    consentVersion: z.literal(EXTERNAL_READ_CONSENT_VERSION),
  })
  .strict();
const revokeSchema = z
  .object({
    connectionId: z.uuid(),
    expectedRevision: z.number().int().positive().max(2_147_483_645),
  })
  .strict();
async function jsonBody(request: Request): Promise<unknown> {
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  )
    throw new ApplicationError('VALIDATION_ERROR', 'JSON required');
  const reader = request.body?.getReader();
  if (!reader) throw new ApplicationError('VALIDATION_ERROR', 'body required');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        throw new ApplicationError('VALIDATION_ERROR', 'body too large');
      }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON');
  } finally {
    reader.releaseLock();
  }
}
export async function externalGrantOwnerResponse(
  request: Request,
  slug: string,
  bunshinId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  let release: (() => void) | undefined;
  try {
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    if (!['GET', 'POST', 'DELETE'].includes(request.method))
      return Response.json(
        { error: { code: 'METHOD_NOT_ALLOWED' } },
        { status: 405, headers: { ...headers, allow: 'GET, POST, DELETE' } },
      );
    if (new URL(request.url).searchParams.size)
      throw new ApplicationError('VALIDATION_ERROR', 'unexpected query');
    if (request.method !== 'GET') requireSameOrigin(request);
    const permit = externalGrantOwnerLimit.reserve(actor.userId);
    if (!permit.allowed)
      return Response.json(
        { error: { code: 'RATE_LIMITED', message: '少し時間をおいてください。', requestId } },
        { status: 429, headers: { ...headers, 'retry-after': String(permit.retryAfterSeconds) } },
      );
    release = permit.release;
    const target = await externalReadGrantOwner(slug, bunshinId, actor.userId);
    if (request.method === 'GET')
      return Response.json({ data: await externalGrantOwnerView(target), requestId }, { headers });
    const parsed = (request.method === 'POST' ? issueSchema : revokeSchema).safeParse(
      await jsonBody(request),
    );
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid command');
    const repository = await externalGrantOwnerManager();
    if (!repository)
      throw new ApplicationError('CONFIGURATION_ERROR', 'external grant management unavailable');
    const manager = new ManageExternalReadGrants(repository);
    const grant =
      request.method === 'POST'
        ? await manager.issue(target.owner, parsed.data)
        : await manager.revoke(target.owner, parsed.data);
    // Return only an acknowledgment: a separate GET refresh cannot turn a committed write into an error.
    return Response.json(
      { data: { saved: true, connectionId: grant.connectionId }, requestId },
      { headers },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status, headers });
  } finally {
    release?.();
  }
}
