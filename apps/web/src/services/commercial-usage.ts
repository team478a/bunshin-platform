import 'server-only';
import type { CommercialUsageEventType } from '@bunshin/application';
import { createLogger } from '@bunshin/observability';

export async function recordCommercialUsageSafely(input: {
  workspaceId: string;
  groupId: string;
  userId: string;
  eventType: CommercialUsageEventType;
  source: string;
  idempotencyKey: string;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  try {
    const db = await import('@bunshin/database');
    await new db.PrismaCommercialUsageService().record(input);
  } catch (error) {
    createLogger().error('commercial usage recording failed', {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      actorUserId: input.userId,
      eventType: input.eventType,
      error: error instanceof Error ? error.message : 'unknown error',
    });
  }
}
