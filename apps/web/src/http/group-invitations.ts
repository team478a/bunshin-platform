import 'server-only';
import { GroupParticipationService } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const uuid = z.uuid();
const bodySchema = z.object({ role: z.enum(['MANAGER', 'PARTICIPANT']) }).strict();

export function groupInvitationTokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function createGroupInvitationResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const value = bodySchema.parse(await request.json());
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const db = await import('@bunshin/database');
    await new GroupParticipationService(
      new db.PrismaGroupParticipationRepository(),
    ).createInvitation({
      workspaceId: uuid.parse(workspaceId),
      groupId: uuid.parse(groupId),
      actorUserId: actor.userId,
      tokenHash: groupInvitationTokenHash(token),
      role: value.role,
      expiresAt,
      maxUses: 1,
    });
    const invitationUrl = new URL(`/groups/invitations/${token}`, getServerEnvironment().APP_URL);
    return Response.json(
      { data: { invitationUrl: invitationUrl.toString(), expiresAt }, requestId },
      { status: 201, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
