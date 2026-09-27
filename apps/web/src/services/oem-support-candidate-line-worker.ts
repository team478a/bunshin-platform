import 'server-only';
import { EnqueueJob } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { currentLineEnvironment } from '../line/secure-configuration';

export async function runOemSupportCandidateLineWorker(now = new Date()) {
  const db = await import('@bunshin/database');
  const environment = currentLineEnvironment();
  const result = await db.scheduleSocialActivityOemSupportCandidateLines(db.prisma, {
    baseUrl: getServerEnvironment().APP_URL,
    environment,
    now,
  });
  let queued = 0;
  for (const broadcast of result.broadcasts) {
    await new EnqueueJob(new db.PrismaJobRepository()).enqueue({
      environment,
      workspaceId: broadcast.workspaceId,
      correlationId: `oem-support-candidate-line:${broadcast.broadcastId}`,
      requestedBy: broadcast.requestedBy,
      jobType: 'SERVICE_LINE_BROADCAST_DELIVER',
      payloadReference: `service-line-broadcast:${broadcast.broadcastId}`,
      idempotencyKey: `oem-support-candidate-line:${broadcast.broadcastId}`,
      priority: 30,
      maxAttempts: 3,
      scheduledAt: broadcast.scheduledAt,
    });
    queued += 1;
  }
  return { ...result, broadcasts: undefined, queued };
}
