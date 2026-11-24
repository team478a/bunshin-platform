import type { UserJob } from '@bunshin/application';
import { PrismaBrowserMaterialVideos, prisma } from '@bunshin/database';
import { BrowserRunError } from './browser';
import { openJTalkNarration } from './material-narration';
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
    const narrate = job.payloadReference.startsWith('browser-video:v2:')
      ? openJTalkNarration
      : undefined;
    const video = steps.length ? await renderMaterialVideo(steps, signal, narrate) : undefined;
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
