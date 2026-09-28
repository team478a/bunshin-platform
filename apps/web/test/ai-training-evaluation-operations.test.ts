import { describe, expect, it } from 'vitest';
import {
  buildAiTrainingEvaluationOperations,
  type AiTrainingEvaluationJobInput,
} from '../src/services/ai-training-evaluation-operations';

const now = new Date('2026-09-28T12:00:00.000Z');

function job(overrides: Partial<AiTrainingEvaluationJobInput> = {}): AiTrainingEvaluationJobInput {
  return {
    status: 'SUCCEEDED',
    attemptCount: 1,
    idempotencyKey: 'training-evaluation:answer-1:run:0',
    createdAt: new Date('2026-09-28T11:58:00.000Z'),
    completedAt: new Date('2026-09-28T11:59:00.000Z'),
    ...overrides,
  };
}

describe('AI training evaluation operations', () => {
  it('summarizes recent terminal outcomes, retries, and recovery runs', () => {
    const result = buildAiTrainingEvaluationOperations({
      now,
      jobs: [
        job(),
        job({
          attemptCount: 2,
          idempotencyKey: 'training-evaluation:answer-2:run:1',
          createdAt: new Date('2026-09-28T11:56:00.000Z'),
          completedAt: new Date('2026-09-28T11:58:00.000Z'),
        }),
        job({ status: 'DEAD', completedAt: new Date('2026-09-28T11:59:30.000Z') }),
      ],
      answerStatuses: ['READY', 'FAILED'],
    });

    expect(result).toMatchObject({
      periodDays: 7,
      requested: 3,
      succeeded: 2,
      dead: 1,
      successPercent: 67,
      retried: 1,
      reEnqueued: 1,
      averageCompletionSeconds: 90,
      activeJobs: 0,
      pendingAnswers: 0,
      failedAnswers: 1,
    });
  });

  it('reports active work including jobs older than the aggregation period', () => {
    const result = buildAiTrainingEvaluationOperations({
      now,
      jobs: [
        job({
          status: 'RETRY_SCHEDULED',
          createdAt: new Date('2026-09-18T12:00:00.000Z'),
          completedAt: null,
        }),
        job({ status: 'PENDING', completedAt: null }),
      ],
      answerStatuses: ['PENDING', 'PENDING', 'READY'],
    });

    expect(result).toMatchObject({
      requested: 1,
      activeJobs: 2,
      oldestActiveMinutes: 14_400,
      pendingAnswers: 2,
      failedAnswers: 0,
    });
  });

  it('does not divide by zero when no terminal evaluation exists', () => {
    expect(
      buildAiTrainingEvaluationOperations({ jobs: [], answerStatuses: [], now }),
    ).toMatchObject({
      requested: 0,
      successPercent: null,
      averageCompletionSeconds: null,
      oldestActiveMinutes: null,
    });
  });
});
