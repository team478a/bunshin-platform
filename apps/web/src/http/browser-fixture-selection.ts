import 'server-only';
import { randomUUID } from 'node:crypto';
import { BROWSER_FIXTURE_JOB_TYPE } from '@bunshin/application';
import {
  BROWSER_FIXTURE_VERSION,
  browserFixtureSelectionRequestSchema,
  browserObservedFixtureVersion,
  browserObservedSelectionSchema,
  trainingCatalogueDiscoveryPrefix,
} from '@bunshin/capability-browser';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { boundedLearningJson } from './personal-learning-request';
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

    const { prisma, PrismaBrowserLearningMaterials } = await import('@bunshin/database');
    const job = await prisma.job.findFirst({
      where: {
        id: identity.data.jobId,
        environment: 'DEVELOPMENT',
        workspaceId,
        workspace: { status: 'ACTIVE' },
        jobType: BROWSER_FIXTURE_JOB_TYPE,
        OR: [
          {
            payloadReference: {
              in: ['mobile', 'desktop']
                .map((device) => `discover-model:${BROWSER_FIXTURE_VERSION}:${device}`)
                .concat(
                  ['mobile', 'desktop'].map(
                    (device) =>
                      `discover-observed-model:${browserObservedFixtureVersion}:${device}`,
                  ),
                ),
            },
          },
          { payloadReference: { startsWith: trainingCatalogueDiscoveryPrefix + ':' } },
        ],
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

    const trainingCatalogue = job.payloadReference.startsWith(
      trainingCatalogueDiscoveryPrefix + ':',
    );
    const device = trainingCatalogue
      ? await new PrismaBrowserLearningMaterials(prisma).catalogueDiscovery({
          workspaceId: job.workspaceId,
          requestedBy: job.requestedBy,
          payloadReference: job.payloadReference,
          environment: 'DEVELOPMENT',
          jobType: BROWSER_FIXTURE_JOB_TYPE,
          bunshinId: null,
          capabilityType: null,
        })
      : job.payloadReference.endsWith(':mobile')
        ? 'mobile'
        : 'desktop';
    let observed;
    if (trainingCatalogue || job.payloadReference.startsWith('discover-observed-model:')) {
      const parsed = browserObservedSelectionSchema.safeParse(
        await boundedLearningJson(request, 32_000),
      );
      if (!parsed.success)
        throw new ApplicationError('VALIDATION_ERROR', 'invalid observed browser candidates');
      observed = parsed.data;
    }
    const remainingLeaseMs = (job.leaseExpiresAt?.getTime() ?? 0) - Date.now();
    if (remainingLeaseMs <= 0) throw new ApplicationError('NOT_FOUND', 'browser job unavailable');
    const selection = await selectBrowserFixturePreview({
      jobId: job.id,
      workspaceId: job.workspaceId,
      actorId: job.requestedBy,
      device,
      ...(observed ? { observed } : {}),
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
