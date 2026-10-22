import { ApplicationError } from '@bunshin/shared';
import {
  validatePersonalLearningActor,
  type PersonalLearningActor,
} from './personal-learning-persistence';
import {
  validateAiCallMeasurement,
  type AiCallMeasurement,
  type AiTokenPricing,
} from './ai-call-observability';
import {
  parsePersonalLearningCallAdmissionPolicy,
  type PersonalLearningCallAdmissionPolicy,
} from './personal-learning-call-admission';

/** Server-only inputs, never accept these authorities/configuration from a learner HTTP body. */
export interface PersonalLearningTextOperation {
  actor: PersonalLearningActor;
  requestId: string;
  expectedRequestRevision: number;
  operationId: string;
  operationKind:
    | 'REQUEST_INTERPRETATION'
    | 'LESSON_GENERATION'
    | 'PRACTICE_SUPPORT'
    | 'CONVERSATION_TURN'
    | 'PERSONA_INFERENCE'
    | 'NUDGE_COPY'
    | 'SIDE_HUSTLE_PROPOSAL'
    | 'SIDE_HUSTLE_ROADMAP';
  /** Closed, non-identifying facts only. Never include learner text or profile data. */
  nudge?: {
    situation:
      | 'REST_RESUME'
      | 'STUCK'
      | 'NEW_LEARNER_STALLED'
      | 'PRACTICE_COMPLETE'
      | 'RETURN_INACTIVE'
      | 'NO_RESPONSE';
    ordinal: 1 | 2;
    judgmentDate: string;
  };
  practice?: {
    assignmentId: string;
    noteRevision: number;
    supportRevision: number;
    supportRequestId: string;
    imageSha256: string | null;
  };
  attempt: number;
  provider: string;
  promptVersion: string;
  policy: PersonalLearningCallAdmissionPolicy;
  pricingRegistry: readonly AiTokenPricing[];
}
export interface PersonalLearningTextPermit {
  id: string;
  operationHash: string;
  maxRequestBytes: number;
  maxOutputTokens: number;
}
export interface PersonalLearningTextOperationRepository {
  admit(input: PersonalLearningTextOperation): Promise<PersonalLearningTextPermit>;
  record(input: {
    operation: PersonalLearningTextOperation;
    permit: PersonalLearningTextPermit;
    measurement: AiCallMeasurement;
    requestFinished: boolean;
  }): Promise<void>;
}
export function validatePersonalLearningTextOperation(input: PersonalLearningTextOperation): void {
  validatePersonalLearningActor(input.actor);
  const uuid = (v: unknown) =>
    typeof v === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
  const symbol = (v: unknown) =>
    typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(v);
  const policy = parsePersonalLearningCallAdmissionPolicy(input.policy);
  if (
    !uuid(input.operationId) ||
    !uuid(input.requestId) ||
    !Number.isSafeInteger(input.expectedRequestRevision) ||
    input.expectedRequestRevision < 1 ||
    !Number.isInteger(input.attempt) ||
    input.attempt < 1 ||
    input.attempt > 3 ||
    ![
      'REQUEST_INTERPRETATION',
      'LESSON_GENERATION',
      'PRACTICE_SUPPORT',
      'CONVERSATION_TURN',
      'PERSONA_INFERENCE',
      'NUDGE_COPY',
      'SIDE_HUSTLE_PROPOSAL',
      'SIDE_HUSTLE_ROADMAP',
    ].includes(input.operationKind) ||
    (input.operationKind === 'SIDE_HUSTLE_ROADMAP'
      ? input.actor.topicId !== undefined ||
        input.nudge !== undefined ||
        input.practice !== undefined
      : input.operationKind === 'NUDGE_COPY'
        ? !input.nudge ||
          input.actor.topicId !== undefined ||
          ![
            'REST_RESUME',
            'STUCK',
            'NEW_LEARNER_STALLED',
            'PRACTICE_COMPLETE',
            'RETURN_INACTIVE',
            'NO_RESPONSE',
          ].includes(input.nudge.situation) ||
          ![1, 2].includes(input.nudge.ordinal) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(input.nudge.judgmentDate) ||
          !Number.isFinite(Date.parse(`${input.nudge.judgmentDate}T00:00:00Z`)) ||
          new Date(`${input.nudge.judgmentDate}T00:00:00Z`).toISOString().slice(0, 10) !==
            input.nudge.judgmentDate ||
          Object.keys(input).some(
            (key) =>
              ![
                'actor',
                'requestId',
                'expectedRequestRevision',
                'operationId',
                'operationKind',
                'nudge',
                'attempt',
                'provider',
                'promptVersion',
                'policy',
                'pricingRegistry',
              ].includes(key),
          )
        : input.nudge !== undefined) ||
    (input.operationKind === 'SIDE_HUSTLE_PROPOSAL' && input.actor.topicId !== undefined) ||
    (input.operationKind === 'PRACTICE_SUPPORT'
      ? !input.practice ||
        !uuid(input.practice.assignmentId) ||
        !uuid(input.practice.supportRequestId) ||
        (input.practice.imageSha256 !== null &&
          !/^[a-f0-9]{64}$/.test(input.practice.imageSha256)) ||
        !Number.isSafeInteger(input.practice.noteRevision) ||
        input.practice.noteRevision < 0 ||
        input.practice.noteRevision >= 1000 ||
        !Number.isSafeInteger(input.practice.supportRevision) ||
        input.practice.supportRevision < 1 ||
        input.practice.supportRevision > 1000
      : input.practice !== undefined) ||
    !symbol(input.provider) ||
    input.provider.length > 40 ||
    !symbol(input.promptVersion) ||
    !policy ||
    policy.workspaceId !== input.actor.scope.workspaceId ||
    policy.groupId !== input.actor.scope.groupId
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid learning text operation');
}

/** One real attempt, outside a DB transaction; never retries or applies teaching state itself. */
export async function executePersonalLearningTextOperation<T>(
  repository: PersonalLearningTextOperationRepository,
  input: PersonalLearningTextOperation,
  call: (permit: PersonalLearningTextPermit) => Promise<{
    value: T;
    measurement: AiCallMeasurement;
    requestFinished: boolean;
  }>,
): Promise<T> {
  validatePersonalLearningTextOperation(input);
  const permit = await repository.admit(input);
  let response: Awaited<ReturnType<typeof call>>;
  const startedAt = Date.now();
  try {
    response = await call(permit);
    validateAiCallMeasurement(response.measurement);
    if (
      response.measurement.provider !== input.provider ||
      response.measurement.model !== input.policy.model ||
      typeof response.requestFinished !== 'boolean'
    )
      throw new ApplicationError('VALIDATION_ERROR', 'operation response mismatch');
  } catch {
    // An opaque exception does not prove that no request started or finished. Retain the slot.
    await repository.record({
      operation: input,
      permit,
      requestFinished: false,
      measurement: {
        provider: input.provider,
        model: input.policy.model,
        inputTokens: null,
        outputTokens: null,
        cachedInputTokens: null,
        latencyMs: Math.min(2147483647, Math.max(0, Date.now() - startedAt)),
        success: false,
        errorCategory: 'UNKNOWN',
        validationResult: 'NOT_RUN',
        fallbackUsed: false,
        occurredAt: new Date().toISOString(),
      },
    });
    throw new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'learning text operation failed');
  }
  const measurement = validateAiCallMeasurement(response.measurement);
  await repository.record({
    operation: input,
    permit,
    measurement,
    requestFinished: response.requestFinished,
  });
  if (!measurement.success || !response.requestFinished)
    throw new ApplicationError(
      'AI_PROVIDER_UNAVAILABLE',
      'learning text operation did not complete',
    );
  return response.value;
}
