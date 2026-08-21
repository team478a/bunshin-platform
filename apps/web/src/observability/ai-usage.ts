import 'server-only';
import { RecordAiUsage, type RecordAiUsageInput } from '@bunshin/application';
import { createLogger } from '@bunshin/observability';

const logger = createLogger();

export async function recordAiUsageSafely(input: RecordAiUsageInput) {
  try {
    const db = await import('@bunshin/database');
    const Repository = db.PrismaAiUsageEventRepository;
    if (!Repository) return;
    await new RecordAiUsage(new Repository()).execute(input);
  } catch (error) {
    logger.error('AI usage persistence failed', {
      workspaceId: input.workspaceId,
      bunshinId: input.bunshinId,
      taskType: input.taskType,
      status: input.status,
      errorCode: 'AI_USAGE_PERSISTENCE_FAILED',
      error,
    });
  }
}
