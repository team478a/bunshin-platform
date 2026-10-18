import {
  AI_TRAINING_V1_MODULE_KEY,
  TRAINING_RETENTION_MAX_ENROLLMENTS,
  type TrainingRetentionExecutionCounts,
} from '@bunshin/capability-training';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from './index';
import { PrismaTrainingRetentionExecutionRepository } from './training-retention-execution';

export interface TrainingRetentionCronScope {
  workspaceId: string;
  groupId: string;
  serviceProgramId: string;
}

export interface TrainingRetentionCronInput {
  scopes: TrainingRetentionCronScope[];
  operatorUserId: string;
  now: Date;
  executeEnabled: boolean;
}

export type TrainingRetentionCronResult =
  | {
      outcome: 'PREVIEW' | 'APPLIED';
      enrollments: number;
      counts: TrainingRetentionExecutionCounts;
    }
  | {
      outcome:
        | 'ALREADY_RUNNING'
        | 'NOT_FOUND'
        | 'FORBIDDEN'
        | 'TOO_LARGE'
        | 'CONFLICT'
        | 'VERIFY_FAILED'
        | 'TIME_BUDGET_EXHAUSTED';
    };

const emptyCounts = (): TrainingRetentionExecutionCounts => ({
  answers: 0,
  workProfiles: 0,
  progressProfiles: 0,
  progressSnapshots: 0,
  assignmentSnapshots: 0,
  assignments: 0,
  activities: 0,
  goals: 0,
  preferences: 0,
  retainedToolkit: 0,
  learningRequests: 0,
  conversationEvents: 0,
  practiceSupportImages: 0,
  lineMessages: 0,
  toolkitDue: 0,
  dynamicTopicsDue: 0,
  personaItemsDue: 0,
  savedExamplesDue: 0,
  personaSuppressionsDue: 0,
  personaProfilesDue: 0,
});

function addCounts(
  target: TrainingRetentionExecutionCounts,
  value: TrainingRetentionExecutionCounts,
) {
  for (const key of Object.keys(target) as (keyof TrainingRetentionExecutionCounts)[]) {
    target[key] = (target[key] ?? 0) + (value[key] ?? 0);
  }
}

function hasDueCounts(counts: TrainingRetentionExecutionCounts) {
  return Object.entries(counts).some(([key, value]) => key !== 'retainedToolkit' && value > 0);
}

/**
 * Daily, exact-Program scoped retention runner. It holds one PostgreSQL advisory
 * transaction lock for the entire run, including its per-enrollment revision-CAS
 * transactions, so a second Cron invocation cannot overlap it.
 */
export class PrismaTrainingRetentionCronRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async run(input: TrainingRetentionCronInput): Promise<TrainingRetentionCronResult> {
    if (!Number.isFinite(input.now.getTime()) || input.scopes.length === 0)
      return { outcome: 'NOT_FOUND' };
    const unique = new Set(
      input.scopes.map(
        (scope) => `${scope.workspaceId}:${scope.groupId}:${scope.serviceProgramId}`,
      ),
    );
    if (unique.size !== input.scopes.length || input.scopes.length > 20)
      return { outcome: 'TOO_LARGE' };

    return this.client.$transaction(
      async (tx) => {
        const locks = await tx.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
          SELECT pg_try_advisory_xact_lock(hashtextextended('bunshin-ai-training-retention-cron-v1', 0)) AS locked
        `);
        if (!locks[0]?.locked) return { outcome: 'ALREADY_RUNNING' };

        const selected: Array<
          TrainingRetentionCronScope & { programEnrollmentId: string; groupMembershipId: string }
        > = [];
        for (const scope of input.scopes) {
          const program = await tx.serviceProgram.findFirst({
            where: {
              workspaceId: scope.workspaceId,
              groupId: scope.groupId,
              id: scope.serviceProgramId,
              settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY },
            },
            select: { id: true },
          });
          if (!program) return { outcome: 'NOT_FOUND' };
          const enrollments = await tx.programEnrollment.findMany({
            where: {
              workspaceId: scope.workspaceId,
              groupId: scope.groupId,
              serviceProgramId: scope.serviceProgramId,
            },
            select: { id: true, groupMembershipId: true },
            orderBy: { id: 'asc' },
            take: TRAINING_RETENTION_MAX_ENROLLMENTS + 1,
          });
          if (
            enrollments.length > TRAINING_RETENTION_MAX_ENROLLMENTS ||
            selected.length + enrollments.length > TRAINING_RETENTION_MAX_ENROLLMENTS
          )
            return { outcome: 'TOO_LARGE' };
          selected.push(
            ...enrollments.map(({ id, groupMembershipId }) => ({
              ...scope,
              programEnrollmentId: id,
              groupMembershipId,
            })),
          );
        }

        const retention = new PrismaTrainingRetentionExecutionRepository(this.client);
        const counts = emptyCounts();
        const countedServiceSummaries = new Set<string>();
        const previews: Array<
          TrainingRetentionCronScope & {
            programEnrollmentId: string;
            revision: string;
            counts: TrainingRetentionExecutionCounts;
          }
        > = [];
        for (const entry of selected) {
          const result = await retention.preview({
            ...entry,
            operatorUserId: input.operatorUserId,
            now: input.now,
          });
          if (
            result.outcome === 'FORBIDDEN' ||
            result.outcome === 'NOT_FOUND' ||
            result.outcome === 'TOO_LARGE'
          )
            return { outcome: result.outcome };
          if (result.outcome !== 'PREVIEW') return { outcome: 'CONFLICT' };
          const serviceSummaryAlreadyCounted = countedServiceSummaries.has(entry.groupMembershipId);
          addCounts(
            counts,
            serviceSummaryAlreadyCounted
              ? {
                  ...result.preview.counts,
                  personaItemsDue: 0,
                  personaSuppressionsDue: 0,
                  savedExamplesDue: 0,
                  personaProfilesDue: 0,
                }
              : result.preview.counts,
          );
          countedServiceSummaries.add(entry.groupMembershipId);
          previews.push({
            ...entry,
            revision: result.preview.revision,
            counts: result.preview.counts,
          });
        }

        if (!input.executeEnabled)
          return { outcome: 'PREVIEW', enrollments: selected.length, counts };
        const startedAt = Date.now();
        const verifiedCounts = emptyCounts();
        for (const item of previews) {
          if (Date.now() - startedAt > 210_000) return { outcome: 'TIME_BUDGET_EXHAUSTED' };
          // Re-preview immediately before each deletion. The execution method then
          // rechecks the revision under the enrollment lock before applying it.
          const before = await retention.preview({
            ...item,
            operatorUserId: input.operatorUserId,
            now: input.now,
            executionSource: 'CRON',
          });
          if (before.outcome !== 'PREVIEW')
            return {
              outcome:
                before.outcome === 'FORBIDDEN' ||
                before.outcome === 'NOT_FOUND' ||
                before.outcome === 'TOO_LARGE'
                  ? before.outcome
                  : 'CONFLICT',
            };
          if (!hasDueCounts(before.preview.counts)) continue;
          const applied = await retention.execute({
            ...item,
            operatorUserId: input.operatorUserId,
            now: input.now,
            executionSource: 'CRON',
            revision: before.preview.revision,
          });
          if (applied.outcome !== 'APPLIED' && applied.outcome !== 'ALREADY_APPLIED')
            return {
              outcome:
                applied.outcome === 'FORBIDDEN' ||
                applied.outcome === 'NOT_FOUND' ||
                applied.outcome === 'TOO_LARGE'
                  ? applied.outcome
                  : 'CONFLICT',
            };
          if (applied.outcome === 'APPLIED') addCounts(verifiedCounts, applied.counts);
          const after = await retention.preview({
            ...item,
            operatorUserId: input.operatorUserId,
            now: input.now,
          });
          if (after.outcome !== 'PREVIEW' || hasDueCounts(after.preview.counts))
            return { outcome: 'VERIFY_FAILED' };
        }
        return { outcome: 'APPLIED', enrollments: selected.length, counts: verifiedCounts };
      },
      { timeout: 240_000, maxWait: 10_000 },
    );
  }
}
