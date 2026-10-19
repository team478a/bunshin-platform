import 'server-only';
import { createHash } from 'node:crypto';
import {
  executePersonalLearningTextOperation,
  parsePersonalLearningCallAdmissionPolicy,
  type PersonalLearningActor,
} from '@bunshin/application';
import type { PersonalLearningNudgeSituation } from '@bunshin/capability-training';
import { createLogger } from '@bunshin/observability';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { personalLearningPricingRegistry } from '../observability/personal-learning-ai-call';
import {
  generateLearningNudge,
  LEARNING_NUDGE_PROMPT_VERSION,
  learningNudgeBody,
} from '../providers/openai-learning-nudge';
import { requireAiTrainingUsageConsent } from './ai-training-consent';

const logger = createLogger();

function stableNudgeOperationId(input: {
  enrollmentId: string;
  situation: PersonalLearningNudgeSituation;
  judgmentDate: string;
}) {
  const bytes = createHash('sha256')
    .update(
      `personal-learning-nudge:${input.enrollmentId}:${input.situation}:${input.judgmentDate}`,
    )
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** One bounded, consent-gated AI attempt. Any unavailable/failed path returns null for N-1 copy. */
export async function generatePersonalLearningNudgeCopy(input: {
  actor: PersonalLearningActor;
  situation: PersonalLearningNudgeSituation;
  ordinal: 1 | 2;
  judgmentDate: string;
}): Promise<string | null> {
  let policy;
  try {
    policy = parsePersonalLearningCallAdmissionPolicy(
      JSON.parse(process.env['PERSONAL_LEARNING_LESSON_ADMISSION'] ?? 'null'),
    );
  } catch {
    logger.error('personal learning nudge admission unavailable', {
      errorCode: 'PERSONAL_LEARNING_NUDGE_ADMISSION_UNAVAILABLE',
    });
    return null;
  }
  if (
    !policy ||
    policy.workspaceId !== input.actor.scope.workspaceId ||
    policy.groupId !== input.actor.scope.groupId
  )
    return null;
  try {
    await requireAiTrainingUsageConsent({
      workspaceId: input.actor.scope.workspaceId,
      groupId: input.actor.scope.groupId,
      enrollmentId: input.actor.scope.programEnrollmentId,
      userId: input.actor.scope.userId,
    });
    const runtime = await resolveOpenAiRuntimeConfiguration(undefined, 'LEARNING_NUDGE');
    if (runtime.model !== policy.model) return null;
    const pricingRegistry = personalLearningPricingRegistry();
    const db = await import('@bunshin/database');
    // Nudge identity is enrollment + situation + Tokyo judgment date; theme/text are excluded.
    const operationId = stableNudgeOperationId({
      enrollmentId: input.actor.scope.programEnrollmentId,
      situation: input.situation,
      judgmentDate: input.judgmentDate,
    });
    const actor: PersonalLearningActor = {
      actorUserId: input.actor.actorUserId,
      scope: input.actor.scope,
    };
    const operation = {
      actor,
      requestId: operationId,
      expectedRequestRevision: 1,
      operationId,
      operationKind: 'NUDGE_COPY' as const,
      nudge: {
        situation: input.situation,
        ordinal: input.ordinal,
        judgmentDate: input.judgmentDate,
      },
      attempt: 1,
      provider: 'openai',
      promptVersion: LEARNING_NUDGE_PROMPT_VERSION,
      policy,
      pricingRegistry,
    };
    return await executePersonalLearningTextOperation(
      new db.PrismaPersonalLearningTextOperationRepository(db.prisma),
      operation,
      async (permit) =>
        generateLearningNudge({
          apiKey: runtime.apiKey,
          model: runtime.model,
          body: learningNudgeBody({
            situation: input.situation,
            ordinal: input.ordinal,
            model: policy.model,
            permit,
          }),
        }),
    );
  } catch {
    // Admission/provider/output errors are deliberately opaque; the caller uses the fixed copy.
    logger.error('personal learning nudge AI unavailable; fixed copy will be used', {
      errorCode: 'PERSONAL_LEARNING_NUDGE_AI_UNAVAILABLE',
      promptVersion: LEARNING_NUDGE_PROMPT_VERSION,
    });
    return null;
  }
}
