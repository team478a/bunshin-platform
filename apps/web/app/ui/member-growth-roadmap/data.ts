import { z } from 'zod';
import { HASSY_MEMBER_ROADMAP_MILESTONES } from '../../../src/services/hassy-growth-policy';

const count = z.number().int().nonnegative().safe();
const stageId = z.enum(['STEP_1', 'STEP_2', 'STEP_3', 'STEP_4', 'STEP_5']);
const milestoneId = z.enum(HASSY_MEMBER_ROADMAP_MILESTONES);
const display = z.enum(['COMPLETED', 'AVAILABLE', 'PREPARING']);
const timestamp = z.iso.datetime();
const timezone = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('ja-JP', { timeZone: value }).format(0);
      return true;
    } catch {
      return false;
    }
  });
const milestone = z.object({
  id: milestoneId,
  title: z.string().min(1).max(120),
  status: display,
  achievement: z.enum(['COMPLETED', 'INCOMPLETE', 'UNKNOWN']),
  availability: z.object({ state: z.enum(['AVAILABLE', 'UNAVAILABLE', 'PREPARING']) }),
  progress: z.object({ current: count.nullable(), target: count.positive() }),
});
const roadmapSchema = z
  .object({
    version: z.literal('member-roadmap-api-v1'),
    definitionVersion: z.string().min(1).max(120),
    asOf: timestamp,
    timezone,
    currentStageId: stageId.nullable(),
    nextRecommended: z.object({ stageId, milestoneId }).nullable(),
    stages: z
      .array(
        z.object({
          id: stageId,
          title: z.string().min(1).max(120),
          status: display,
          progress: z.object({ completed: count, total: count.positive(), unknown: count }),
          milestones: z.array(milestone).min(1).max(16),
        }),
      )
      .length(5),
  })
  .refine((value) =>
    value.stages.every(
      (stage, index) =>
        stage.id === `STEP_${index + 1}` &&
        stage.progress.total === stage.milestones.length &&
        stage.progress.completed ===
          stage.milestones.filter((item) => item.achievement === 'COMPLETED').length &&
        stage.progress.unknown ===
          stage.milestones.filter((item) => item.achievement === 'UNKNOWN').length &&
        new Set(stage.milestones.map((item) => item.id)).size === stage.milestones.length,
    ),
  );
const metrics = z.object({
  generated: count,
  unknownTriggerGenerations: count,
  accepted: count,
  rejected: count,
  selfReportedPosts: count,
  activeDays: count,
});
const usageSchema = z.object({
  version: z.literal('member-usage-api-v1'),
  asOf: timestamp,
  timezone,
  allTime: metrics,
  last7Days: z.object({ activeDays: count.max(7) }),
  last30Days: z.object({ activeDays: count.max(30) }),
});
export type RoadmapDisplay = z.infer<typeof roadmapSchema>;
export type GrowthSnapshot = { roadmap: RoadmapDisplay; usage: z.infer<typeof usageSchema> };

export class GrowthReadError extends Error {
  constructor(readonly status: number) {
    super('growth data unavailable');
  }
}

/** Fixed relative endpoint supplied by the owner-scoped server view. Never use response URLs. */
export async function readGrowthSnapshot(
  base: string,
  signal: AbortSignal,
): Promise<GrowthSnapshot> {
  async function read(path: string): Promise<unknown> {
    const response = await fetch(`${base}/${path}`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
    });
    if (!response.ok) throw new GrowthReadError(response.status);
    const body: unknown = await response.json();
    return z.object({ data: z.unknown() }).parse(body).data;
  }
  const { roadmap, usage } = z
    .object({
      version: z.literal('member-growth-api-v1'),
      roadmap: roadmapSchema,
      usage: usageSchema,
    })
    .parse(await read('member-growth'));
  if (roadmap.timezone !== usage.timezone || roadmap.asOf !== usage.asOf)
    throw new GrowthReadError(503);
  const next = roadmap.nextRecommended;
  if (next) {
    const item = roadmap.stages
      .find((stage) => stage.id === next.stageId)
      ?.milestones.find((entry) => entry.id === next.milestoneId);
    if (
      !item ||
      item.achievement !== 'INCOMPLETE' ||
      item.status !== 'AVAILABLE' ||
      item.availability.state !== 'AVAILABLE'
    )
      throw new GrowthReadError(503);
  }
  return { roadmap, usage };
}
