import 'server-only';
import { randomUUID } from 'node:crypto';
import { BROWSER_FIXTURE_JOB_TYPE, RecordAiUsage } from '@bunshin/application';
import {
  browserFixtureSelectionRequestSchema,
  browserPilotEnvironment,
} from '@bunshin/capability-browser';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { AesGcmAiProviderSecretCrypto } from '../ai/secure-provider-configuration';
import { synthesizeAzureSpeech } from '../ai/azure-speech';
import { authorizeCronRequest } from './cron-security';

export async function browserMaterialNarrationResponse(request: Request) {
  const secret = process.env['BROWSER_FIXTURE_MODEL_SECRET'];
  const environment = browserPilotEnvironment(getServerEnvironment().APP_ENV);
  if (!secret || !environment) return new Response(null, { status: 404 });
  const missing = () => new ApplicationError('NOT_FOUND', 'browser narration job unavailable');
  try {
    authorizeCronRequest(request, secret);
    const identity = browserFixtureSelectionRequestSchema.safeParse({
      jobId: request.headers.get('x-browser-job-id'),
      workerId: request.headers.get('x-browser-worker-id'),
    });
    const ordinal = Number(request.headers.get('x-browser-step-ordinal'));
    if (!identity.success || !Number.isInteger(ordinal) || ordinal < 1 || ordinal > 30)
      throw missing();
    const db = await import('@bunshin/database');
    const job = await db.prisma.job.findFirst({
      where: {
        id: identity.data.jobId,
        environment,
        jobType: BROWSER_FIXTURE_JOB_TYPE,
        leaseOwner: identity.data.workerId,
        status: 'LEASED',
        leaseExpiresAt: { gt: new Date() },
        workspace: { status: 'ACTIVE' },
      },
      select: {
        id: true,
        requestedBy: true,
        workspaceId: true,
        environment: true,
        jobType: true,
        bunshinId: true,
        capabilityType: true,
        payloadReference: true,
        leaseExpiresAt: true,
      },
    });
    if (!job?.requestedBy || !job.leaseExpiresAt) throw missing();
    const narration = await new db.PrismaBrowserMaterialVideos(db.prisma).narrationInstruction(
      { ...job, requestedBy: job.requestedBy },
      ordinal,
    );
    const remainingLease = job.leaseExpiresAt.getTime() - Date.now();
    if (!narration || remainingLease <= 0) throw missing();
    const connection = {
      region: narration.region,
      key: new AesGcmAiProviderSecretCrypto().decrypt(narration.encryptedKey),
    };
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(Math.min(30_000, remainingLease)),
    ]);
    const occurredAt = new Date();
    const key = `browser-azure-narration:${job.id}:${randomUUID()}`;
    let status: 'SUCCESS' | 'FAILED' = 'FAILED';
    try {
      const audio = await synthesizeAzureSpeech(
        connection,
        narration.model,
        narration.instruction,
        signal,
      );
      status = 'SUCCESS';
      return new Response(audio, {
        headers: { 'content-type': 'audio/wav', 'cache-control': 'private, no-store' },
      });
    } finally {
      const latencyMs = Date.now() - occurredAt.getTime();
      console.log(
        JSON.stringify({
          operation: key,
          model: narration.model,
          characters: Array.from(narration.instruction).length,
          latencyMs,
          status,
        }),
      );
      await new RecordAiUsage(new db.PrismaAiUsageEventRepository(db.prisma)).execute({
        workspaceId: job.workspaceId,
        actorUserId: job.requestedBy,
        bunshinId: null,
        taskType: 'BROWSER_MATERIAL_NARRATION',
        provider: 'azure-speech',
        model: narration.model,
        promptVersion: 'browser-material-ssml-v1',
        status,
        inputTokens: null,
        outputTokens: null,
        latencyMs,
        estimatedCostUsdMicros: null,
        errorCode: status === 'FAILED' ? 'SYNTHESIS_FAILED' : null,
        idempotencyKey: key,
        occurredAt,
      });
    }
  } catch (error) {
    const { body, status } = toApiError(error, randomUUID());
    return Response.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
  }
}
