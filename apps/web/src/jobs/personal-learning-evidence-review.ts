import 'server-only';
import type { Prisma } from '@bunshin/database';
import {
  PERSONAL_LEARNING_PRACTICE_MISSION,
  parseStoredPersonalLearningEvidenceSubmission,
  parsePersonalLearningCallAdmissionPolicy,
  validateLearningLessonProposal,
  type AiCallMeasurement,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { personalLearningOfferPolicy } from '@bunshin/capability-training';
import { personalLearningPilotExecutionAllowed } from '../services/personal-learning-pilot-access';
import { requireAiTrainingUsageConsent } from '../services/ai-training-consent';
import { admitPersonalLearningCall } from '../services/personal-learning-call-admission';
import {
  resolveLearningProviderRuntimeConfiguration,
  reserveLearningProviderRuntimeConfiguration,
  type LearningAiProvider,
} from '../ai/learning-provider-runtime';
import { recordOpenAiUsageAndSettle } from '../ai/openai-cost-admission';
import { preparePersonalLearningAiCall } from '../observability/personal-learning-ai-call';
import { withOrganizationAiGenerationQuota } from '../organization-ai-generation-quota';
import {
  generateLearningEvidenceReview,
  learningEvidenceReviewBody,
} from '../providers/openai-learning-evidence-review';
import { personalLearningOfferPromptPolicy } from '../providers/personal-learning-offer-policy';

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export async function executePersonalLearningEvidenceReview(input: {
  workspaceId: string;
  groupId: string;
  enrollmentId: string;
  answerId: string;
  actorUserId: string;
  jobId: string;
  attemptCount: number;
}) {
  const db = await import('@bunshin/database');
  const membership = await db.prisma.groupMembership.findFirst({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      userId: input.actorUserId,
      status: 'ACTIVE',
      serviceRole: { in: ['PARTICIPANT', 'SERVICE_OWNER'] },
    },
    select: { id: true, serviceRole: true },
  });
  if (!membership) throw new ApplicationError('NOT_FOUND', 'practice evaluator unavailable');
  const enrollment = await db.prisma.programEnrollment.findFirst({
    where: {
      id: input.enrollmentId,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      groupMembershipId: membership.id,
      status: 'ACTIVE',
      startsAt: { not: null },
      AND: [db.trainingEnrollmentPeriodWhere(new Date())],
    },
    select: { id: true, serviceProgramId: true },
  });
  if (!enrollment) throw new ApplicationError('NOT_FOUND', 'practice evaluator unavailable');
  const program = await db.prisma.serviceProgram.findFirst({
    where: {
      id: enrollment.serviceProgramId,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      status: 'ACTIVE',
    },
    select: { settings: true },
  });
  if (!program || !personalLearningPilotExecutionAllowed(program.settings, enrollment.id, true))
    throw new ApplicationError('NOT_FOUND', 'practice evaluator unavailable');
  const offerPolicy = personalLearningOfferPolicy(program.settings);
  if (!offerPolicy) throw new ApplicationError('NOT_FOUND', 'practice evaluator unavailable');
  const promptVersion = personalLearningOfferPromptPolicy(offerPolicy).evidenceReviewVersion;
  await requireAiTrainingUsageConsent({
    workspaceId: input.workspaceId,
    groupId: input.groupId,
    enrollmentId: enrollment.id,
    userId: input.actorUserId,
  });
  const answer = await db.prisma.trainingMissionAnswer.findFirst({
    where: {
      id: input.answerId,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      programEnrollmentId: enrollment.id,
      userId: input.actorUserId,
    },
  });
  if (!answer) throw new ApplicationError('NOT_FOUND', 'practice answer unavailable');
  if (answer.evaluationStatus === 'READY') return;
  if (answer.evaluationStatus !== 'PENDING')
    throw new ApplicationError('CONFLICT', 'practice answer is not pending');
  const assignment = await db.prisma.programMissionAssignment.findFirst({
    where: {
      id: answer.missionAssignmentId,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      programEnrollmentId: enrollment.id,
      missionDefinitionKey: PERSONAL_LEARNING_PRACTICE_MISSION,
      status: 'STARTED',
    },
    select: { displaySnapshot: true },
  });
  if (!assignment) throw new ApplicationError('NOT_FOUND', 'practice assignment unavailable');
  const dynamic = object(object(assignment.displaySnapshot).dynamicPractice);
  const candidate = object(dynamic.candidate);
  const proposal = validateLearningLessonProposal(candidate.proposal);
  const originalWish = candidate.originalText;
  const submission = parseStoredPersonalLearningEvidenceSubmission(answer.answer);
  if (
    dynamic.version !== 'PERSONAL_LEARNING_PRACTICE_V1' ||
    proposal.status !== 'READY' ||
    typeof originalWish !== 'string' ||
    !submission ||
    submission.candidateId !== candidate.id ||
    submission.materialVersion !== candidate.materialVersion
  )
    throw new ApplicationError('CONFLICT', 'practice evidence context changed');

  const operationKey = `training-evaluation:${answer.id}:${input.jobId}:attempt:${input.attemptCount}`;
  let rawAdmission: unknown;
  try {
    rawAdmission = JSON.parse(process.env['PERSONAL_LEARNING_CALL_ADMISSION'] ?? 'null');
  } catch {
    throw new ApplicationError('CONFIGURATION_ERROR', 'practice review admission unavailable');
  }
  const admissionPolicy = parsePersonalLearningCallAdmissionPolicy(rawAdmission);
  if (!admissionPolicy)
    throw new ApplicationError('CONFIGURATION_ERROR', 'practice review admission unavailable');
  const provider: LearningAiProvider = admissionPolicy.provider ?? 'openai';
  const configuredRuntime = await resolveLearningProviderRuntimeConfiguration(
    provider,
    'TRAINING_ASSESSMENT',
  );
  if (configuredRuntime.model !== admissionPolicy.model)
    throw new ApplicationError('CONFIGURATION_ERROR', 'practice review model mismatch');
  const runtime = await reserveLearningProviderRuntimeConfiguration(
    operationKey,
    provider,
    'TRAINING_ASSESSMENT',
    configuredRuntime.requestCostUsdMicros,
  );
  if (runtime.model !== admissionPolicy.model)
    throw new ApplicationError('CONFIGURATION_ERROR', 'practice review model mismatch');
  const actor = {
    actorUserId: input.actorUserId,
    scope: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      programEnrollmentId: enrollment.id,
      groupMembershipId: membership.id,
      userId: input.actorUserId,
    },
  };
  const pilot = await preparePersonalLearningAiCall(actor, answer.missionAssignmentId, answer.id);
  const observed: { measurement: AiCallMeasurement | null } = { measurement: null };
  let providerAttempted = false;
  let usageRecorded = false;
  let success = false;
  const started = Date.now();
  try {
    const evaluated = await withOrganizationAiGenerationQuota({
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      operationKey,
      generate: async () => {
        const policy = personalLearningPilotExecutionAllowed(program.settings, enrollment.id, true);
        if (!policy) throw new ApplicationError('FORBIDDEN', 'practice evaluator unavailable');
        await requireAiTrainingUsageConsent({
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          enrollmentId: enrollment.id,
          userId: input.actorUserId,
        });
        const admission = await admitPersonalLearningCall({
          actor,
          assignmentId: answer.missionAssignmentId,
          answerId: answer.id,
          jobId: input.jobId,
          attemptCount: input.attemptCount,
          provider,
          model: runtime.model,
        });
        let requestStarted = false;
        let requestFinished = false;
        try {
          providerAttempted = true;
          requestStarted = true;
          const result = await generateLearningEvidenceReview({
            apiKey: runtime.apiKey,
            model: runtime.model,
            provider: runtime.provider,
            modelCapabilities: runtime.modelCapabilities,
            material: { originalWish, outcome: proposal.outcome, criteria: proposal.criteria },
            kind: submission.kind,
            content: submission.content,
            body: learningEvidenceReviewBody({
              material: { originalWish, outcome: proposal.outcome, criteria: proposal.criteria },
              kind: submission.kind,
              content: submission.content,
              model: runtime.model,
              maxRequestBytes: admission.requestLimits.maxRequestBytes,
              maxOutputTokens: admission.requestLimits.maxOutputTokens,
              offerPolicy,
            }),
          });
          observed.measurement = result.measurement;
          requestFinished = result.requestFinished;
          if (!result.value)
            throw new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'practice review unavailable');
          success = true;
          return result.value;
        } finally {
          if (!requestStarted || requestFinished) await admission.settle();
        }
      },
    });
    const cost = pilot.cost(
      observed.measurement ?? {
        provider: runtime.provider,
        model: runtime.model,
        inputTokens: null,
        outputTokens: null,
        cachedInputTokens: null,
        latencyMs: Date.now() - started,
        success: false,
        errorCategory: 'UNKNOWN',
        validationResult: 'NOT_RUN',
        fallbackUsed: false,
        occurredAt: new Date(started).toISOString(),
      },
    );
    await recordOpenAiUsageAndSettle(runtime, {
      workspaceId: input.workspaceId,
      bunshinId: null,
      actorUserId: input.actorUserId,
      taskType: 'AI_TRAINING_ANSWER_EVALUATION',
      provider: runtime.provider,
      model: observed.measurement?.model ?? runtime.model,
      promptVersion,
      status: 'SUCCESS',
      inputTokens: observed.measurement?.inputTokens ?? null,
      outputTokens: observed.measurement?.outputTokens ?? null,
      latencyMs: Math.max(0, Date.now() - started),
      estimatedCostUsdMicros: cost.totalCostUsdMicros,
      pricingVersion: cost.pricing?.pricingVersion ?? null,
      idempotencyKey: operationKey,
    });
    usageRecorded = true;
    const answerValue = submission;
    const reviewValue: Prisma.InputJsonObject = {
      state: evaluated.state,
      observed: evaluated.observed,
      notEstablished: evaluated.notEstablished,
      feedback: evaluated.feedback,
      nextAction: evaluated.nextAction,
    };
    await new db.PrismaPersonalLearningAssessmentGate(db.prisma).authorizeAssessment(
      actor,
      answer.missionAssignmentId,
      answer.id,
    );
    await db.prisma.$transaction(async (tx) => {
      await db.lockTrainingEnrollmentData(tx, { ...actor.scope, actorUserId: input.actorUserId });
      const allowed = await tx.programEnrollment.findFirst({
        where: {
          id: enrollment.id,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: membership.id,
          status: 'ACTIVE',
          AND: [db.trainingEnrollmentPeriodWhere(new Date())],
        },
        select: { id: true },
      });
      const current = await tx.programMissionAssignment.findFirst({
        where: {
          id: answer.missionAssignmentId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: enrollment.id,
          missionDefinitionKey: PERSONAL_LEARNING_PRACTICE_MISSION,
          status: 'STARTED',
        },
        select: { id: true, displaySnapshot: true },
      });
      const latestAnswer = await tx.trainingMissionAnswer.findFirst({
        where: {
          id: answer.id,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: enrollment.id,
          userId: input.actorUserId,
          evaluationStatus: 'PENDING',
        },
        select: { id: true, answer: true },
      });
      const currentCandidate = object(
        object(object(current?.displaySnapshot).dynamicPractice).candidate,
      );
      const currentSubmission = latestAnswer
        ? parseStoredPersonalLearningEvidenceSubmission(latestAnswer.answer)
        : null;
      if (
        !allowed ||
        !current ||
        !latestAnswer ||
        currentCandidate.id !== submission.candidateId ||
        currentCandidate.materialVersion !== submission.materialVersion ||
        currentSubmission?.revision !== submission.revision
      )
        throw new ApplicationError('CONFLICT', 'practice review context changed');
      const updated = await tx.trainingMissionAnswer.updateMany({
        where: {
          id: answer.id,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: enrollment.id,
          userId: input.actorUserId,
          evaluationStatus: 'PENDING',
        },
        data: {
          evaluationStatus: 'READY',
          evaluation: {
            schemaVersion: 'PERSONAL_LEARNING_EVIDENCE_REVIEW_V1',
            candidateId: submission.candidateId,
            materialVersion: submission.materialVersion,
            revision: submission.revision,
            kind: answerValue.kind,
            review: reviewValue,
            provider: runtime.provider,
            model: observed.measurement?.model ?? runtime.model,
            promptVersion,
            inputTokens: observed.measurement?.inputTokens ?? null,
            outputTokens: observed.measurement?.outputTokens ?? null,
            latencyMs: Math.max(0, Date.now() - started),
          },
          evaluatedAt: new Date(),
        },
      });
      if (updated.count !== 1) return;
      await tx.programActionEvent.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: enrollment.id,
          missionAssignmentId: answer.missionAssignmentId,
          eventType: 'PERSONAL_LEARNING_EVIDENCE_REVIEWED',
          sourceResourceType: 'TRAINING_MISSION_ANSWER',
          sourceResourceId: answer.id,
          idempotencyKey: `personal-learning-evidence-review:${answer.id}`,
          schemaVersion: 1,
          metadata: {
            revision: submission.revision,
            kind: answerValue.kind,
            reviewState: reviewValue.state,
            promptVersion,
          },
          actorUserId: input.actorUserId,
          occurredAt: new Date(),
        },
      });
    });
  } catch (error) {
    if (!usageRecorded) {
      const measurement = observed.measurement;
      const cost = measurement ? pilot.cost(measurement) : null;
      await recordOpenAiUsageAndSettle(runtime, {
        workspaceId: input.workspaceId,
        bunshinId: null,
        actorUserId: input.actorUserId,
        taskType: 'AI_TRAINING_ANSWER_EVALUATION',
        provider: runtime.provider,
        model: measurement?.model ?? runtime.model,
        promptVersion,
        status: 'FAILED',
        inputTokens: measurement?.inputTokens ?? null,
        outputTokens: measurement?.outputTokens ?? null,
        latencyMs: Math.max(0, Date.now() - started),
        estimatedCostUsdMicros: providerAttempted ? (cost?.totalCostUsdMicros ?? null) : 0,
        pricingVersion: cost?.pricing?.pricingVersion ?? null,
        errorCode: error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR',
        idempotencyKey: operationKey,
      });
    }
    throw error;
  } finally {
    await pilot.record(
      operationKey,
      observed.measurement ?? {
        provider: runtime.provider,
        model: /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(runtime.model)
          ? runtime.model
          : 'unknown',
        inputTokens: null,
        outputTokens: null,
        cachedInputTokens: null,
        latencyMs: Math.max(0, Date.now() - started),
        success,
        errorCategory: success ? null : 'UNKNOWN',
        validationResult: success ? 'PASSED' : 'NOT_RUN',
        fallbackUsed: false,
        occurredAt: new Date(started).toISOString(),
      },
    );
  }
}
