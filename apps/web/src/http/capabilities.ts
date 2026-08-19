import 'server-only';
import {
  ActivateBunshinCapability,
  AssignCapabilityToBunshin,
  ListBunshinCapabilityAssignments,
  SuspendBunshinCapability,
} from '@bunshin/application';
import type { BunshinCapabilityAssignment } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const assignSchema = z.object({ capabilityType: z.literal('SOCIAL') }).strict();
const emptySchema = z.object({}).strict();

async function actorUserId(): Promise<string> {
  const currentUser = await (await currentUserProvider()).getCurrentUser();
  if (currentUser === null) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return currentUser.userId;
}

async function jsonBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new ApplicationError('VALIDATION_ERROR', 'application/json is required');
  }
  try {
    return await request.json();
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}

async function repository() {
  const { PrismaBunshinCapabilityAssignmentRepository } = await import('@bunshin/database');
  return new PrismaBunshinCapabilityAssignmentRepository();
}

const dto = (value: BunshinCapabilityAssignment) => ({
  id: value.id,
  workspaceId: value.workspaceId,
  bunshinId: value.bunshinId,
  capabilityType: value.capabilityType,
  status: value.status,
  activatedAt: value.activatedAt,
  createdAt: value.createdAt,
  updatedAt: value.updatedAt,
});

async function respond(request: Request, operation: () => Promise<unknown>) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    return Response.json(
      { data: await operation(), requestId },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'no-store' },
    });
  }
}

export function listCapabilitiesResponse(request: Request, workspaceId: string, bunshinId: string) {
  return respond(request, async () => {
    const values = await new ListBunshinCapabilityAssignments(await repository()).execute({
      workspaceId,
      bunshinId,
      actorUserId: await actorUserId(),
    });
    return values.map(dto);
  });
}

export function assignCapabilityResponse(request: Request, workspaceId: string, bunshinId: string) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = assignSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    return dto(
      await new AssignCapabilityToBunshin(await repository()).execute({
        workspaceId,
        bunshinId,
        actorUserId: await actorUserId(),
        capabilityType: parsed.data.capabilityType,
      }),
    );
  });
}

export function setSocialCapabilityStatusResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  active: boolean,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = emptySchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'empty body required');
    const input = {
      workspaceId,
      bunshinId,
      actorUserId: await actorUserId(),
      capabilityType: 'SOCIAL' as const,
    };
    return dto(
      active
        ? await new ActivateBunshinCapability(await repository()).execute(input)
        : await new SuspendBunshinCapability(await repository()).execute(input),
    );
  });
}
