import type { MissionActivity } from '@bunshin/capability-social';
import type { Prisma } from './client';

export function missionActivity(row: Prisma.MissionActivityGetPayload<object>): MissionActivity {
  return {
    ...row,
    metadata: row.metadata as Record<string, unknown> | null,
  };
}
