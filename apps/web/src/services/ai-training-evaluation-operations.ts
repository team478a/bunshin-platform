const DAY_MS = 86_400_000;

export type AiTrainingEvaluationJobInput = {
  status: 'PENDING' | 'LEASED' | 'RETRY_SCHEDULED' | 'SUCCEEDED' | 'DEAD' | 'CANCELLED';
  attemptCount: number;
  idempotencyKey: string;
  createdAt: Date;
  completedAt: Date | null;
};

export type AiTrainingEvaluationOperations = {
  periodDays: number;
  requested: number;
  succeeded: number;
  dead: number;
  successPercent: number | null;
  retried: number;
  reEnqueued: number;
  averageCompletionSeconds: number | null;
  activeJobs: number;
  oldestActiveMinutes: number | null;
  pendingAnswers: number;
  failedAnswers: number;
};

const activeStatuses = new Set<AiTrainingEvaluationJobInput['status']>([
  'PENDING',
  'LEASED',
  'RETRY_SCHEDULED',
]);

function isReEnqueued(idempotencyKey: string): boolean {
  const match = /:run:(\d+)$/u.exec(idempotencyKey);
  return match ? Number(match[1]) > 0 : false;
}

export function buildAiTrainingEvaluationOperations(input: {
  jobs: readonly AiTrainingEvaluationJobInput[];
  answerStatuses: readonly ('PENDING' | 'READY' | 'FAILED')[];
  now: Date;
  periodDays?: number;
}): AiTrainingEvaluationOperations {
  const periodDays = input.periodDays ?? 7;
  const periodStart = new Date(input.now.getTime() - periodDays * DAY_MS);
  const recent = input.jobs.filter((job) => job.createdAt >= periodStart);
  const active = input.jobs.filter((job) => activeStatuses.has(job.status));
  const succeeded = recent.filter((job) => job.status === 'SUCCEEDED');
  const dead = recent.filter((job) => job.status === 'DEAD').length;
  const terminalCount = succeeded.length + dead;
  const completionDurations = succeeded.flatMap((job) =>
    job.completedAt ? [Math.max(0, job.completedAt.getTime() - job.createdAt.getTime())] : [],
  );
  const oldestActiveAt = active.reduce<Date | null>(
    (oldest, job) => (!oldest || job.createdAt < oldest ? job.createdAt : oldest),
    null,
  );

  return {
    periodDays,
    requested: recent.length,
    succeeded: succeeded.length,
    dead,
    successPercent:
      terminalCount === 0 ? null : Math.round((succeeded.length / terminalCount) * 100),
    retried: recent.filter((job) => job.attemptCount > 1).length,
    reEnqueued: recent.filter((job) => isReEnqueued(job.idempotencyKey)).length,
    averageCompletionSeconds:
      completionDurations.length === 0
        ? null
        : Math.round(
            completionDurations.reduce((sum, duration) => sum + duration, 0) /
              completionDurations.length /
              1000,
          ),
    activeJobs: active.length,
    oldestActiveMinutes: oldestActiveAt
      ? Math.max(0, Math.floor((input.now.getTime() - oldestActiveAt.getTime()) / 60_000))
      : null,
    pendingAnswers: input.answerStatuses.filter((status) => status === 'PENDING').length,
    failedAnswers: input.answerStatuses.filter((status) => status === 'FAILED').length,
  };
}
