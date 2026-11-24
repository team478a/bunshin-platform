import 'server-only';
import { randomUUID } from 'node:crypto';
import { BROWSER_FIXTURE_JOB_TYPE } from '@bunshin/application';
import {
  BROWSER_FIXTURE_VERSION,
  browserFixtureSelectionRequestSchema,
} from '@bunshin/capability-browser';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { authorizeCronRequest } from './cron-security';
import { selectBrowserFixturePreview } from '../services/browser-fixture-selection';

export async function browserFixtureSelectionResponse(request: Request) {
  const secret = process.env['BROWSER_FIXTURE_MODEL_SECRET'];
  const workspaceId = process.env['BROWSER_FIXTURE_MODEL_WORKSPACE_ID'];
  if (!secret || !workspaceId || getServerEnvironment().APP_ENV !== 'development')
    return new Response(null, { status: 404 });

  try {
    authorizeCronRequest(request, secret);
    const identity = browserFixtureSelectionRequestSchema.safeParse({
      jobId: request.headers.get('x-browser-job-id'),
      workerId: request.headers.get('x-browser-worker-id'),
    });
    if (!identity.success)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid browser job identity');

    const { prisma } = await import('@bunshin/database');
    const job = await prisma.job.findFirst({
      where: {
        id: identity.data.jobId,
        environment: 'DEVELOPMENT',
        workspaceId,
        workspace: { status: 'ACTIVE' },
        jobType: BROWSER_FIXTURE_JOB_TYPE,
        payloadReference: {
          in: ['mobile', 'desktop'].map(
            (device) => `discover-model:${BROWSER_FIXTURE_VERSION}:${device}`,
          ),
        },
        status: 'LEASED',
        leaseOwner: identity.data.workerId,
        leaseExpiresAt: { gt: new Date() },
        bunshinId: null,
        capabilityType: null,
      },
      select: {
        id: true,
        workspaceId: true,
        requestedBy: true,
        payloadReference: true,
        leaseExpiresAt: true,
      },
    });
    const member = job?.requestedBy
      ? await prisma.workspaceMembership.findFirst({
          where: {
            workspaceId: job.workspaceId,
            userId: job.requestedBy,
            status: 'ACTIVE',
            workspace: { status: 'ACTIVE' },
            user: { status: 'ACTIVE' },
          },
          select: { id: true },
        })
      : null;
    if (!job?.requestedBy || !member)
      throw new ApplicationError('NOT_FOUND', 'browser job unavailable');

    const remainingLeaseMs = (job.leaseExpiresAt?.getTime() ?? 0) - Date.now();
    if (remainingLeaseMs <= 0) throw new ApplicationError('NOT_FOUND', 'browser job unavailable');
    const selection = await selectBrowserFixturePreview({
      jobId: job.id,
      workspaceId: job.workspaceId,
      actorId: job.requestedBy,
      device: job.payloadReference.endsWith(':mobile') ? 'mobile' : 'desktop',
      signal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(Math.min(remainingLeaseMs, 2_147_483_647)),
      ]),
    });
    return Response.json(selection);
  } catch (error) {
    const mapped = toApiError(error, randomUUID());
    return Response.json(mapped.body, { status: mapped.status });
  }
}
