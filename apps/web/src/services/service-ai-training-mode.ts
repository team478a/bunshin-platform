import 'server-only';

import { AI_TRAINING_V1_MODULE_KEY } from '@bunshin/capability-training';

/** Service identity is independent of whether a training program is currently runnable. */
export async function hasAiTrainingServiceProgram(input: {
  workspaceId: string;
  serviceId: string;
}): Promise<boolean> {
  const db = await import('@bunshin/database');
  return Boolean(
    await db.prisma.serviceProgram.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.serviceId,
        status: { not: 'ARCHIVED' },
        settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY },
      },
      select: { id: true },
    }),
  );
}
