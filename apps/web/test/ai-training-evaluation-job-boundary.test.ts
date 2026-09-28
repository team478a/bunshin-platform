import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const handler = readFileSync(
  new URL('../src/jobs/training-answer-evaluation-job-handler.ts', import.meta.url),
  'utf8',
);
const http = [
  '../src/http/ai-training-evaluation.ts',
  '../src/http/ai-training-participant.ts',
  '../src/services/ai-training-evaluation-queue.ts',
]
  .map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
  .join('\n');
const worker = readFileSync(new URL('../src/http/job-worker.ts', import.meta.url), 'utf8');

describe('AI training evaluation job boundary', () => {
  it('revalidates workspace, service, participant, enrollment and answer before provider use', () => {
    expect(handler).toContain('workspaceId: input.workspaceId');
    expect(handler).toContain('groupId: input.groupId');
    expect(handler).toContain('userId: input.actorUserId');
    expect(handler).toContain("serviceRole: 'PARTICIPANT'");
    expect(handler).toContain('groupMembershipId: membership.id');
    expect(handler).toContain('programEnrollmentId: enrollment.id');
    expect(handler).toContain('AI_TRAINING_V1_MODULE_KEY');
  });

  it('records every provider attempt and finalizes progress transactionally', () => {
    expect(handler).toContain('attempt:${input.attemptCount}');
    expect(handler).toContain("taskType: 'AI_TRAINING_ANSWER_EVALUATION'");
    expect(handler).toContain('db.prisma.$transaction');
    expect(handler).toContain("evaluationStatus: 'READY'");
    expect(handler).toContain("eventType: 'ANSWER_EVALUATED'");
  });

  it('queues and polls without placing answer text in the job payload', () => {
    expect(http).toContain('TRAINING_ANSWER_EVALUATION_JOB_TYPE');
    expect(http).toContain('enqueueAiTrainingEvaluation');
    expect(http).toContain("return response({ status: 'PENDING' }");
    expect(http).toContain('getAiTrainingEvaluationResponse');
    expect(http).not.toContain('answer.answer');
    expect(worker).toContain("job.jobType === 'TRAINING_ANSWER_EVALUATE'");
    expect(worker).toContain('trainingEvaluationExecutor.execute(job, workerId)');
  });
});
