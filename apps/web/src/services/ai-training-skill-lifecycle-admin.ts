import 'server-only';
import { createHash } from 'node:crypto';
import {
  TRAINING_SKILL_FACTORY_FEASIBILITY_AXES,
  activateTrainingSupportSkillVersionV1,
  adoptTrainingSupportSkillVersionV1,
  approveNextTrainingSupportSkillVersionV1,
  defineTrainingMissionHelpProblemV1,
  defineTrainingMissionSupportSkillDraftV1,
  defineTrainingSupportDraftArtifactV1,
  evaluateTrainingSkillDraftFeasibilityV1,
  rollbackTrainingSupportSkillVersionV1,
  suspendTrainingSupportSkillV1,
  validateTrainingSupportDraftV1,
  type TrainingBarrierReason,
  type TrainingActionKey,
  type TrainingSkillDraftFeasibilityCheckV1,
  type TrainingSkillFactoryFeasibilityAxis,
  type TrainingSkillKey,
  type TrainingSupportSkillLifecycleStateV1,
  type TrainingSupportSkillRollbackCompatibilityV1,
} from '@bunshin/capability-training';
import { ApplicationError } from '@bunshin/shared';

export interface TrainingSupportSkillReviewPackageInput {
  skillKey: string;
  problem: {
    problemId: string;
    revision: number;
    programEnrollmentId: string;
    missionAssignmentId: string;
    actionEventId: string;
    learningObjectiveKey: string;
    relevantSuccessCriteriaKeys: string[];
    barrierReasonCode: TrainingBarrierReason | null;
    evaluatedSkillKeys: TrainingSkillKey[];
  };
  feasibilityChecks: Record<
    TrainingSkillFactoryFeasibilityAxis,
    Omit<TrainingSkillDraftFeasibilityCheckV1, 'checkedAt'> & { checkedAt: string }
  >;
  skillDraft: {
    skillDraftId: string;
    revision: number;
    scopeFingerprint: string;
    requiredInputKeys: string[];
    prohibitedInputClasses: string[];
    steps: string[];
    expectedOutput: string;
    status: 'DRAFT' | 'VALIDATED' | 'APPROVED';
    expiresAt: string;
  };
  artifact: {
    artifactId: string;
    revision: number;
    createdAt: string;
    expiresAt: string;
  };
}

export type TrainingSupportSkillAdminCommand =
  | {
      action: 'PREVIEW';
      reviewPackage: TrainingSupportSkillReviewPackageInput;
    }
  | {
      action: 'APPROVE';
      reviewPackage: TrainingSupportSkillReviewPackageInput;
      expectedRevision: number;
      idempotencyKey: string;
      confirmation: 'APPROVE_PROBLEM_AND_SKILL_VERSION';
    }
  | {
      action: 'ACTIVATE';
      skillId: string;
      skillVersionId: string;
      expectedRevision: number;
      idempotencyKey: string;
      confirmation: 'ACTIVATE_SKILL_VERSION';
    }
  | {
      action: 'SUSPEND';
      skillId: string;
      expectedRevision: number;
      idempotencyKey: string;
      reasonCode: 'SAFETY_REVIEW_REQUIRED' | 'OUTCOME_REVIEW_REQUIRED' | 'MANUAL_OPERATIONAL_STOP';
      confirmation: 'SUSPEND_SKILL';
    }
  | {
      action: 'ROLLBACK';
      skillId: string;
      skillVersionId: string;
      expectedRevision: number;
      idempotencyKey: string;
      reasonCode:
        'CURRENT_VERSION_REGRESSION' | 'CURRENT_VERSION_INCOMPATIBLE' | 'MANUAL_VERSION_RESTORE';
      compatibility: TrainingSupportSkillRollbackCompatibilityV1;
      confirmation: 'ROLLBACK_SKILL_VERSION';
    };

const invalid = (message: string): never => {
  throw new ApplicationError('VALIDATION_ERROR', message);
};

const contract = <T>(operation: () => T): T => {
  try {
    return operation();
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw new ApplicationError('CONFLICT', 'skill lifecycle preconditions not met');
  }
};

const asDate = (value: string, field: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) invalid(`invalid ${field}`);
  return parsed;
};

const serialize = (state: TrainingSupportSkillLifecycleStateV1) => ({
  skill: {
    ...state.skill,
    createdAt: state.skill.createdAt.toISOString(),
    updatedAt: state.skill.updatedAt.toISOString(),
  },
  versions: state.versions.map((version) => ({
    ...version,
    approvedAt: version.approvedAt.toISOString(),
    deprecatedAt: version.deprecatedAt?.toISOString() ?? null,
    revokedAt: version.revokedAt?.toISOString() ?? null,
  })),
  events: state.events.map((event) => ({
    ...event,
    occurredAt: event.occurredAt.toISOString(),
  })),
});

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonical(child)]),
  );
};

const stableUuid = (...parts: unknown[]) => {
  const hex = createHash('sha256')
    .update(JSON.stringify(canonical(parts)))
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

export async function listTrainingSupportSkillsForAdmin(input: {
  workspaceId: string;
  serviceId: string;
}) {
  const db = await import('@bunshin/database');
  const repository = new db.PrismaTrainingSupportSkillLifecycleRepository(db.prisma);
  return (await repository.listByService(input)).map(serialize);
}

async function buildReviewEvidence(input: {
  workspaceId: string;
  serviceId: string;
  reviewPackage: TrainingSupportSkillReviewPackageInput;
  now: Date;
}) {
  const db = await import('@bunshin/database');
  const source = input.reviewPackage.problem;
  const [event, assignment, enrollment] = await Promise.all([
    db.prisma.programActionEvent.findFirst({
      where: {
        id: source.actionEventId,
        workspaceId: input.workspaceId,
        groupId: input.serviceId,
        programEnrollmentId: source.programEnrollmentId,
        missionAssignmentId: source.missionAssignmentId,
        eventType: 'HELP_REQUESTED',
        schemaVersion: 1,
      },
    }),
    db.prisma.programMissionAssignment.findFirst({
      where: {
        id: source.missionAssignmentId,
        workspaceId: input.workspaceId,
        groupId: input.serviceId,
        programEnrollmentId: source.programEnrollmentId,
      },
    }),
    db.prisma.programEnrollment.findFirst({
      where: {
        id: source.programEnrollmentId,
        workspaceId: input.workspaceId,
        groupId: input.serviceId,
      },
    }),
  ]);
  if (!event || !assignment || !enrollment)
    throw new ApplicationError('NOT_FOUND', 'review source unavailable');
  const serviceProgram = await db.prisma.serviceProgram.findFirst({
    where: {
      id: enrollment.serviceProgramId,
      workspaceId: input.workspaceId,
      groupId: input.serviceId,
      programTemplateVersionId: assignment.programTemplateVersionId,
      settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
    },
  });
  if (!serviceProgram) throw new ApplicationError('NOT_FOUND', 'review source unavailable');
  if (assignment.variantKey !== null && !['STANDARD', 'SHORT'].includes(assignment.variantKey))
    invalid('unsupported assignment variant');

  const problem = contract(() =>
    defineTrainingMissionHelpProblemV1({
      problemId: source.problemId,
      revision: source.revision,
      status: 'APPROVED',
      scope: {
        workspaceId: input.workspaceId,
        serviceId: input.serviceId,
        programEnrollmentId: source.programEnrollmentId,
        missionAssignmentId: source.missionAssignmentId,
      },
      source: {
        workspaceId: input.workspaceId,
        serviceId: input.serviceId,
        programEnrollmentId: source.programEnrollmentId,
        missionAssignmentId: source.missionAssignmentId,
        actionEventId: source.actionEventId,
        actionEventSchemaVersion: 1,
        eventType: 'HELP_REQUESTED',
        moduleKey: 'AI_TRAINING_V1',
        occurredAt: event.occurredAt,
      },
      mission: {
        programTemplateVersionId: assignment.programTemplateVersionId,
        missionDefinitionKey: assignment.missionDefinitionKey as TrainingActionKey,
        missionRuleVersion: assignment.ruleVersion,
        assignmentVariant: (assignment.variantKey ?? 'STANDARD') as 'STANDARD' | 'SHORT',
      },
      contextProjection: {
        learningObjectiveKey: source.learningObjectiveKey,
        relevantSuccessCriteriaKeys: source.relevantSuccessCriteriaKeys,
        barrierReasonCode: source.barrierReasonCode,
        evaluatedSkillKeys: source.evaluatedSkillKeys,
      },
      enrollmentEndsAt: enrollment.endsAt,
    }),
  );
  const checks = Object.fromEntries(
    TRAINING_SKILL_FACTORY_FEASIBILITY_AXES.map((axis) => {
      const check = input.reviewPackage.feasibilityChecks[axis];
      return [axis, { ...check, checkedAt: asDate(check.checkedAt, `${axis}.checkedAt`) }];
    }),
  ) as Record<TrainingSkillFactoryFeasibilityAxis, TrainingSkillDraftFeasibilityCheckV1>;
  const feasibility = contract(() => evaluateTrainingSkillDraftFeasibilityV1(checks));
  const draftInput = input.reviewPackage.skillDraft;
  const skillDraft = contract(() =>
    defineTrainingMissionSupportSkillDraftV1({
      ...draftInput,
      sourceProblemId: problem.problemId,
      sourceProblemRevision: problem.revision,
      missionDefinitionKey: problem.mission.missionDefinitionKey,
      learningObjectiveKey: problem.contextProjection.learningObjectiveKey,
      expiresAt: asDate(draftInput.expiresAt, 'skillDraft.expiresAt'),
    }),
  );
  const artifactInput = input.reviewPackage.artifact;
  const artifact = contract(() =>
    defineTrainingSupportDraftArtifactV1({
      artifactId: artifactInput.artifactId,
      revision: artifactInput.revision,
      sourceProblemId: problem.problemId,
      sourceProblemRevision: problem.revision,
      skillDraftId: skillDraft.skillDraftId,
      skillDraftRevision: skillDraft.revision,
      scopeFingerprint: skillDraft.scopeFingerprint,
      programTemplateVersionId: problem.mission.programTemplateVersionId,
      missionDefinitionKey: problem.mission.missionDefinitionKey,
      learningObjectiveKey: problem.contextProjection.learningObjectiveKey,
      successCriteriaKeys: problem.contextProjection.relevantSuccessCriteriaKeys,
      barrierReasonCode: problem.contextProjection.barrierReasonCode,
      steps: skillDraft.steps,
      expectedOutput: skillDraft.expectedOutput,
      createdAt: asDate(artifactInput.createdAt, 'artifact.createdAt'),
      expiresAt: asDate(artifactInput.expiresAt, 'artifact.expiresAt'),
    }),
  );
  const validationReceipt = contract(() =>
    validateTrainingSupportDraftV1({
      problem,
      feasibility,
      skillDraft,
      artifact,
      now: input.now,
    }),
  );
  return { problem, feasibility, skillDraft, artifact, validationReceipt };
}

export async function executeTrainingSupportSkillAdmin(input: {
  workspaceId: string;
  serviceId: string;
  actorUserId: string;
  actorServiceRole: string;
  command: TrainingSupportSkillAdminCommand;
}) {
  const db = await import('@bunshin/database');
  const repository = new db.PrismaTrainingSupportSkillLifecycleRepository(db.prisma);
  const now = new Date();
  const actor = {
    userId: input.actorUserId,
    serviceRole: input.actorServiceRole,
    active: true,
  };

  if (input.command.action === 'PREVIEW' || input.command.action === 'APPROVE') {
    const approvalCommand = input.command;
    const serviceStates = await repository.listByService({
      workspaceId: input.workspaceId,
      serviceId: input.serviceId,
    });
    const approvalIdentity =
      approvalCommand.action === 'APPROVE'
        ? [
            input.workspaceId,
            input.serviceId,
            approvalCommand.idempotencyKey,
            approvalCommand.reviewPackage,
          ]
        : null;
    const skillVersionId = approvalIdentity ? stableUuid('skill-version', approvalIdentity) : null;
    if (approvalCommand.action === 'APPROVE') {
      const replayed = serviceStates.find((candidate) =>
        candidate.events.some((event) => event.idempotencyKey === approvalCommand.idempotencyKey),
      );
      const replayEvent = replayed?.events.find(
        (event) => event.idempotencyKey === approvalCommand.idempotencyKey,
      );
      if (replayed || replayEvent) {
        if (
          !replayed ||
          !replayEvent ||
          replayed.skill.skillKey !== approvalCommand.reviewPackage.skillKey ||
          replayEvent.operation !== 'ADOPT' ||
          replayEvent.skillVersionId !== skillVersionId ||
          replayEvent.actorUserId !== input.actorUserId
        )
          throw new ApplicationError('CONFLICT', 'idempotency key conflict');
        return { outcome: 'REPLAYED' as const, state: serialize(replayed) };
      }
    }
    const evidence = await buildReviewEvidence({
      workspaceId: input.workspaceId,
      serviceId: input.serviceId,
      reviewPackage: approvalCommand.reviewPackage,
      now,
    });
    if (evidence.validationReceipt.status !== 'VALID')
      throw new ApplicationError('CONFLICT', 'review package is not valid');
    const scope = {
      workspaceId: input.workspaceId,
      serviceId: input.serviceId,
      programTemplateVersionId: evidence.problem.mission.programTemplateVersionId,
      missionDefinitionKey: evidence.problem.mission.missionDefinitionKey,
      learningObjectiveKey: evidence.problem.contextProjection.learningObjectiveKey,
      assignmentVariant: evidence.problem.mission.assignmentVariant,
    };
    const current = await repository.findByScopeAndKey({
      scope,
      skillKey: approvalCommand.reviewPackage.skillKey,
    });
    if (
      !current &&
      serviceStates.some(
        (candidate) => candidate.skill.skillKey === approvalCommand.reviewPackage.skillKey,
      )
    )
      throw new ApplicationError('CONFLICT', 'skill key already belongs to another scope');
    if (approvalCommand.action === 'PREVIEW')
      return {
        outcome: 'READY_FOR_HUMAN_APPROVAL' as const,
        receipt: {
          ...evidence.validationReceipt,
          checkedAt: evidence.validationReceipt.checkedAt.toISOString(),
        },
        scope,
        nextVersion: current ? current.versions.length + 1 : 1,
        expectedRevision: current?.skill.revision ?? 0,
      };
    if (!approvalIdentity || !skillVersionId)
      throw new ApplicationError('VALIDATION_ERROR', 'approval identity unavailable');
    const base = contract(() =>
      current
        ? approveNextTrainingSupportSkillVersionV1({
            state: current,
            skillVersionId,
            contentDigest: `sha256:${'0'.repeat(64)}`,
            expectedSkillRevision: approvalCommand.expectedRevision,
            operationId: stableUuid('operation', approvalIdentity),
            idempotencyKey: approvalCommand.idempotencyKey,
            reasonCode: 'INITIAL_HUMAN_APPROVAL',
            actor,
            ...evidence,
            now,
          })
        : adoptTrainingSupportSkillVersionV1({
            skillId: stableUuid(
              'skill',
              input.workspaceId,
              input.serviceId,
              approvalCommand.reviewPackage.skillKey,
            ),
            skillVersionId,
            skillKey: approvalCommand.reviewPackage.skillKey,
            contentDigest: `sha256:${'0'.repeat(64)}`,
            expectedSkillRevision: 0,
            operationId: stableUuid('operation', approvalIdentity),
            idempotencyKey: approvalCommand.idempotencyKey,
            reasonCode: 'INITIAL_HUMAN_APPROVAL',
            actor,
            ...evidence,
            now,
          }),
    );
    const state = {
      ...base,
      versions: base.versions.map((version) => ({
        ...version,
        contentDigest: db.computeTrainingSupportSkillVersionDigestV1(version),
      })),
    } satisfies TrainingSupportSkillLifecycleStateV1;
    const result = current
      ? await repository.saveTransition({
          previousRevision: approvalCommand.expectedRevision,
          state,
        })
      : await repository.saveAdoption({ state, expectedAbsent: true });
    if (result === 'CONFLICT') throw new ApplicationError('CONFLICT', 'skill write conflict');
    return { outcome: result, state: serialize(state) };
  }

  const transitionCommand = input.command;
  const states = await repository.listByService({
    workspaceId: input.workspaceId,
    serviceId: input.serviceId,
  });
  const current = states.find((candidate) => candidate.skill.skillId === transitionCommand.skillId);
  if (!current) throw new ApplicationError('NOT_FOUND', 'skill unavailable');
  const common = {
    state: current,
    expectedSkillRevision: transitionCommand.expectedRevision,
    operationId: stableUuid(
      'operation',
      input.workspaceId,
      input.serviceId,
      transitionCommand.action,
      transitionCommand.idempotencyKey,
    ),
    idempotencyKey: transitionCommand.idempotencyKey,
    actor,
    now,
  };
  const state = contract(() =>
    transitionCommand.action === 'ACTIVATE'
      ? activateTrainingSupportSkillVersionV1({
          ...common,
          skillVersionId: transitionCommand.skillVersionId,
          reasonCode: 'HUMAN_APPROVED_ACTIVATION',
        })
      : transitionCommand.action === 'SUSPEND'
        ? suspendTrainingSupportSkillV1({ ...common, reasonCode: transitionCommand.reasonCode })
        : rollbackTrainingSupportSkillVersionV1({
            ...common,
            skillVersionId: transitionCommand.skillVersionId,
            reasonCode: transitionCommand.reasonCode,
            compatibility: transitionCommand.compatibility,
          }),
  );
  if (
    current.events.some(
      (candidate) => candidate.idempotencyKey === transitionCommand.idempotencyKey,
    )
  )
    return { outcome: 'REPLAYED' as const, state: serialize(state) };
  const result = await repository.saveTransition({
    previousRevision: transitionCommand.expectedRevision,
    state,
  });
  if (result === 'CONFLICT') throw new ApplicationError('CONFLICT', 'skill write conflict');
  return { outcome: result, state: serialize(state) };
}
