import { randomUUID } from 'node:crypto';
import { RecordAiUsage, type UserJob } from '@bunshin/application';
import {
  PrismaAiUsageEventRepository,
  PrismaBrowserMaterialVideos,
  prisma,
} from '@bunshin/database';
import { BrowserRunError } from './browser';
import {
  browserMaterialAzureProfile,
  browserMaterialMeiVoice,
  browserMaterialVideoVersion,
} from '@bunshin/capability-browser';
import { meiNarration, openJTalkNarration } from './material-narration';
import { azureMaterialNarration } from './azure-material-narration';
import { renderMaterialVideo } from './material-video';

export async function runMaterialVideo(
  job: UserJob,
  workerId: string,
  timeoutMs: number,
  cancellation: AbortSignal,
) {
  const videos = new PrismaBrowserMaterialVideos(prisma);
  const signal = AbortSignal.any([cancellation, AbortSignal.timeout(timeoutMs)]);
  try {
    const steps = await videos.renderInput(job);
    const version = Number(/^browser-video:v(\d+):/i.exec(job.payloadReference)?.[1] ?? 1);
    const azure = browserMaterialAzureProfile(version);
    const useMei = version === browserMaterialVideoVersion;
    const narrate =
      steps.length && azure
        ? azureMaterialNarration(azure.model, async (usage) => {
            const key = `browser-azure-narration:${job.id}:${randomUUID()}`;
            console.log(JSON.stringify({ operation: key, ...usage }));
            await new RecordAiUsage(new PrismaAiUsageEventRepository(prisma)).execute({
              workspaceId: job.workspaceId,
              actorUserId: job.requestedBy,
              bunshinId: null,
              taskType: 'BROWSER_MATERIAL_NARRATION',
              provider: 'azure-speech',
              model: usage.model,
              promptVersion: 'browser-material-ssml-v1',
              status: usage.success ? 'SUCCESS' : 'FAILED',
              inputTokens: null,
              outputTokens: null,
              latencyMs: usage.latencyMs,
              estimatedCostUsdMicros: null,
              errorCode: usage.success ? null : 'SYNTHESIS_FAILED',
              idempotencyKey: key,
              occurredAt: usage.occurredAt,
            });
          })
        : useMei
          ? meiNarration
          : version === 2
            ? openJTalkNarration
            : undefined;
    const credit = azure
      ? `Microsoft Azure Speech — ${azure.model}`
      : useMei
        ? `${browserMaterialMeiVoice.name} — ${browserMaterialMeiVoice.attribution}, ${browserMaterialMeiVoice.license} — ${browserMaterialMeiVoice.source}`
        : undefined;
    const video = steps.length
      ? await renderMaterialVideo(steps, signal, narrate, credit)
      : undefined;
    signal.throwIfAborted();
    await videos.finishVideo(job, workerId, video);
  } catch (error) {
    if (
      (error && typeof error === 'object' && 'code' in error && error.code === 'NOT_FOUND') ||
      error instanceof RangeError
    )
      throw new BrowserRunError('INVALID_PLAN');
    throw error;
  }
}
