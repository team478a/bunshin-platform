import type { UserJob } from '@bunshin/application';
import { PrismaBrowserMaterialVideos, prisma } from '@bunshin/database';
import { BrowserRunError } from './browser';
import { browserMaterialMeiVoice, browserMaterialVideoVersion } from '@bunshin/capability-browser';
import { meiNarration, openJTalkNarration } from './material-narration';
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
    const useMei = job.payloadReference.startsWith(
      `browser-video:v${browserMaterialVideoVersion}:`,
    );
    const narrate = useMei
      ? meiNarration
      : job.payloadReference.startsWith('browser-video:v2:')
        ? openJTalkNarration
        : undefined;
    const credit = useMei
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
