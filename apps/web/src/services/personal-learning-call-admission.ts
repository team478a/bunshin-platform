import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import {
  parsePersonalLearningCallAdmissionPolicy,
  TrainingAnswerEvaluationJobError,
  type PersonalLearningActor,
} from '@bunshin/application';
import { personalLearningPilotEnabled } from './personal-learning-pilot-access';

export async function admitPersonalLearningCall(input: {
  actor: PersonalLearningActor;
  assignmentId: string;
  answerId: string;
  jobId: string;
  attemptCount: number;
  model: string;
}) {
  const denied = () =>
    new TrainingAnswerEvaluationJobError('PERSONAL_LEARNING_CALL_ADMISSION_DENIED', false);
  let value: unknown;
  try {
    value = JSON.parse(process.env['PERSONAL_LEARNING_CALL_ADMISSION'] ?? 'null');
  } catch {
    throw denied();
  }
  const policy = parsePersonalLearningCallAdmissionPolicy(value);
  if (!policy || policy.model !== input.model || !personalLearningPilotEnabled()) throw denied();
  const db = await import('@bunshin/database');
  const repo = new db.PrismaPersonalLearningCallAdmission(db.prisma);
  const environment = {
    development: 'DEVELOPMENT',
    staging: 'STAGING',
    production: 'PRODUCTION',
  } as const;
  let permit: Awaited<ReturnType<typeof repo.admit>>;
  try {
    permit = await repo.admit({
      ...input,
      policy,
      environment: environment[getServerEnvironment().APP_ENV],
    });
  } catch {
    // No request on missing schema, failed authorization, exhausted limits or conflict.
    throw denied();
  }
  return {
    requestLimits: {
      maxRequestBytes: policy.maxRequestBytes,
      maxOutputTokens: policy.maxOutputTokens,
    },
    async settle() {
      try {
        await repo.settle(permit);
      } catch {
        // Retain the slot on DB failure; no sensitive exception/body and no resend.
        console.error('PERSONAL_LEARNING_CALL_SETTLEMENT_FAILED');
      }
    },
  };
}
