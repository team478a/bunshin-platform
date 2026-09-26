import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import {
  EnqueueJob,
  ServiceLineBroadcastAudienceService,
  ServiceLineBroadcastOperationsService,
} from '@bunshin/application';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { currentLineEnvironment } from '../line/secure-configuration';
import { resolveManagedServiceContext } from '../services/public-service';

const segmentSchema = z
  .object({
    industryIds: z.array(z.string().uuid()).max(20).default([]),
    purposes: z
      .array(z.enum(['ATTRACT', 'RESERVATION', 'SALES', 'RECRUITING', 'AWARENESS', 'RETENTION']))
      .max(6)
      .default([]),
  })
  .strict();

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(5000),
  reason: z.string().trim().min(1).max(1000),
  scheduledAt: z.string().datetime().optional(),
  confirmed: z.literal(true),
  expectedRecipientCount: z.number().int().positive().max(500),
  segment: segmentSchema,
});

const retrySchema = z.object({ reason: z.string().trim().min(1).max(1000) });
const cancelSchema = z.object({ reason: z.string().trim().min(1).max(1000) });

export async function previewServiceLineBroadcastResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const segment = segmentSchema.parse(await request.json());
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const preview = await new ServiceLineBroadcastAudienceService(
      new db.PrismaServiceLineBroadcastAudienceRepository(),
    ).preview({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      segment,
    });
    return Response.json(
      {
        data: { eligibleRecipientCount: preview.recipientCount, capped: preview.capped },
        requestId,
      },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}

async function enqueueBroadcastJob(input: {
  workspaceId: string;
  broadcastId: string;
  actorUserId: string;
  scheduledAt: Date;
  attempt: number;
}) {
  const db = await import('@bunshin/database');
  await new EnqueueJob(new db.PrismaJobRepository()).enqueue({
    environment: currentLineEnvironment(),
    workspaceId: input.workspaceId,
    correlationId: `service-line-broadcast:${input.broadcastId}`,
    requestedBy: input.actorUserId,
    jobType: 'SERVICE_LINE_BROADCAST_DELIVER',
    payloadReference: `service-line-broadcast:${input.broadcastId}`,
    idempotencyKey: `service-line-broadcast:${input.broadcastId}:attempt:${input.attempt}`,
    priority: 40,
    maxAttempts: 3,
    scheduledAt: input.scheduledAt,
  });
}

export async function listServiceLineBroadcastsResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const result = await new ServiceLineBroadcastOperationsService(
      new db.PrismaServiceLineBroadcastOperationsRepository(),
    ).list({
      environment: currentLineEnvironment(),
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
    });
    return Response.json({
      data: result.broadcasts.map((row) => ({
        id: row.id,
        title: row.title,
        message: row.message,
        status: row.status,
        scheduledAt: row.scheduledAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        completedAt: row.completedAt?.toISOString() ?? null,
        segment: row.segment,
        recipients: row.recipientCounts,
        operationalStatus: row.operationalStatus,
        failureRate: row.failureRate,
        totalRecipients: row.totalRecipients,
        recoveryAttempts: row.recoveryAttempts,
      })),
      health: result.health,
      options: { industries: result.industries },
      requestId,
    });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}

export async function sendServiceLineBroadcastResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const value = createSchema.parse(await request.json());
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const environment = currentLineEnvironment();
    const scheduledAt = value.scheduledAt ? new Date(value.scheduledAt) : new Date();
    const broadcast = await new ServiceLineBroadcastAudienceService(
      new db.PrismaServiceLineBroadcastAudienceRepository(),
    ).schedule({
      environment,
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      title: value.title,
      message: value.message,
      reason: value.reason,
      scheduledAt,
      expectedRecipientCount: value.expectedRecipientCount,
      segment: value.segment,
    });
    await enqueueBroadcastJob({
      workspaceId: service.workspaceId,
      broadcastId: broadcast.broadcastId,
      actorUserId: actor.userId,
      scheduledAt,
      attempt: 1,
    });
    return Response.json({
      data: {
        broadcastId: broadcast.broadcastId,
        requested: broadcast.recipientCount,
        scheduledAt: scheduledAt.toISOString(),
      },
      requestId,
    });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}

export async function retryServiceLineBroadcastResponse(
  request: Request,
  serviceSlug: string,
  broadcastId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const value = retrySchema.parse(await request.json());
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const retried = await new ServiceLineBroadcastOperationsService(
      new db.PrismaServiceLineBroadcastOperationsRepository(),
    ).retry({
      environment: currentLineEnvironment(),
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      broadcastId,
      actorUserId: actor.userId,
      reason: value.reason,
    });
    await enqueueBroadcastJob({
      workspaceId: service.workspaceId,
      broadcastId,
      actorUserId: actor.userId,
      scheduledAt: retried.scheduledAt,
      attempt: retried.scheduledAt.getTime(),
    });
    return Response.json(
      { data: { broadcastId, retried: retried.recipientCount }, requestId },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}

export async function cancelServiceLineBroadcastResponse(
  request: Request,
  serviceSlug: string,
  broadcastId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const value = cancelSchema.parse(await request.json());
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const cancelled = await new ServiceLineBroadcastOperationsService(
      new db.PrismaServiceLineBroadcastOperationsRepository(),
    ).cancel({
      environment: currentLineEnvironment(),
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      broadcastId,
      actorUserId: actor.userId,
      reason: value.reason,
    });
    return Response.json(
      { data: { broadcastId, cancelledAt: cancelled.cancelledAt.toISOString() }, requestId },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}

export async function exportServiceLineBroadcastsResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const csv = await new ServiceLineBroadcastOperationsService(
      new db.PrismaServiceLineBroadcastOperationsRepository(),
    ).exportCsv({
      environment: currentLineEnvironment(),
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
    });
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="line-broadcasts.csv"',
        'x-request-id': requestId,
      },
    });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}
