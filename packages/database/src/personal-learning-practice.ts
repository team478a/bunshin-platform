import { randomUUID, createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { ApplicationError } from '@bunshin/shared';
import {
  LEARNING_CANDIDATE_POLICY,
  PERSONAL_LEARNING_PRACTICE_VERSION,
  PERSONAL_LEARNING_PRACTICE_MISSION,
  validatePersonalLearningPracticeNote,
  parseStoredPersonalLearningEvidenceSubmission,
  validatePersonalLearningEvidenceReview,
  type PersonalLearningPracticeRepository,
  type PersonalLearningPractice,
  type PersonalLearningActor,
  type SavedPersonalLearningRequest,
} from '@bunshin/application';
import { PrismaLearningCandidateRepository } from './personal-learning-lesson-candidate';
import { readPracticeSupportHistory } from './personal-learning-practice-support-history';

const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const conflict = (): never => {
  throw new ApplicationError('CONFLICT', 'practice changed');
};
type Tx = Prisma.TransactionClient;
type Assignment = Prisma.ProgramMissionAssignmentGetPayload<object>;

/** Normal enrollment path; saved lesson material is not a legacy approved fixture. */
export class PrismaPersonalLearningPracticeRepository
  extends PrismaLearningCandidateRepository
  implements PersonalLearningPracticeRepository
{
  protected async policy(tx: Tx, actor: PersonalLearningActor) {
    const enrollment = await tx.programEnrollment.findUniqueOrThrow({
      where: { id: actor.scope.programEnrollmentId },
    });
    const program = await tx.serviceProgram.findUniqueOrThrow({
      where: { id: enrollment.serviceProgramId },
    });
    const policy = object(object(program.settings).personalLearningPracticePolicy);
    return {
      program,
      allowed: policy.enabled === true && policy.version === LEARNING_CANDIDATE_POLICY,
    };
  }
  protected async current(tx: Tx, actor: PersonalLearningActor) {
    const rows = await tx.programMissionAssignment.findMany({
      where: {
        workspaceId: actor.scope.workspaceId,
        groupId: actor.scope.groupId,
        programEnrollmentId: actor.scope.programEnrollmentId,
        ruleVersion: PERSONAL_LEARNING_PRACTICE_VERSION,
        status: { in: ['PRESENTED', 'STARTED'] },
      },
      orderBy: { sequence: 'desc' },
      take: 2,
    });
    if (rows.length > 1) return conflict();
    return rows[0] ?? null;
  }
  protected async projectPractice(
    tx: Tx,
    actor: PersonalLearningActor,
    row: Assignment,
  ): Promise<PersonalLearningPractice> {
    const data = object(object(row.displaySnapshot).dynamicPractice);
    const scope = object(data.scope);
    if (
      !row.targetResourceId ||
      data.version !== PERSONAL_LEARNING_PRACTICE_VERSION ||
      row.targetResourceType !== 'PERSONAL_LEARNING_PLAN' ||
      row.missionDefinitionKey !== PERSONAL_LEARNING_PRACTICE_MISSION ||
      data.planId !== row.targetResourceId ||
      !Number.isSafeInteger(data.planRevision) ||
      Number(data.planRevision) < 1 ||
      typeof data.goalId !== 'string' ||
      Object.entries(actor.scope).some(([key, value]) => scope[key] !== value) ||
      !row.startedAt
    )
      return conflict();
    const candidate = this.project(data.candidate as Prisma.JsonValue, null);
    const saved = object(data.candidate);
    if (typeof saved.confirmedAt !== 'string' || candidate.proposal.status !== 'READY')
      return conflict();
    const environment = object(data.environment);
    if (
      !['PC', 'SMARTPHONE', 'BOTH'].includes(String(environment.deviceType)) ||
      typeof environment.toolDescription !== 'string' ||
      !environment.toolDescription.trim() ||
      ![environment.experienceDescription, environment.currentPosition].every(
        (v) => v === null || typeof v === 'string',
      )
    )
      return conflict();
    const plan = await tx.personalLearningPlanRevision.findFirst({
      where: {
        ...actor.scope,
        planId: row.targetResourceId,
        revision: Number(data.planRevision),
        status: 'CONFIRMED',
        programMemberGoalId: data.goalId,
      },
      include: { goalConfirmation: { include: { goal: true } } },
    });
    if (!plan || plan.goalConfirmation.goal.status !== 'ACTIVE') return conflict();
    const notes = await tx.programActionEvent.findMany({
      where: {
        workspaceId: row.workspaceId,
        groupId: row.groupId,
        programEnrollmentId: row.programEnrollmentId,
        missionAssignmentId: row.id,
        actorUserId: actor.actorUserId,
        eventType: 'PERSONAL_LEARNING_PRACTICE_NOTE',
      },
      orderBy: { occurredAt: 'desc' },
      take: 1001,
    });
    if (notes.length > 1000) return conflict();
    const latest = notes
      .map((n) => object(n.metadata))
      .sort((a, b) => Number(b.revision) - Number(a.revision))[0];
    let note: PersonalLearningPractice['note'] = null;
    if (latest) {
      if (
        typeof latest.text !== 'string' ||
        typeof latest.revision !== 'number' ||
        typeof latest.reportedAt !== 'string' ||
        latest.evidenceLevel !== 'SELF_REPORT'
      )
        return conflict();
      validatePersonalLearningPracticeNote(latest.text, latest.revision - 1);
      note = {
        revision: latest.revision,
        text: latest.text,
        reportedAt: latest.reportedAt,
        evidenceLevel: 'SELF_REPORT',
      };
    }
    const answers = await tx.trainingMissionAnswer.findMany({
      where: {
        workspaceId: row.workspaceId,
        groupId: row.groupId,
        programEnrollmentId: row.programEnrollmentId,
        missionAssignmentId: row.id,
        userId: actor.actorUserId,
      },
      orderBy: { createdAt: 'desc' },
      take: 101,
      select: { id: true, answer: true, evaluationStatus: true, evaluation: true, createdAt: true },
    });
    if (answers.length > 100) return conflict();
    const answersWithSubmission = answers.map((answer) => ({
      answer,
      submitted: parseStoredPersonalLearningEvidenceSubmission(answer.answer),
    }));
    answersWithSubmission.sort(
      (left, right) => (left.submitted?.revision ?? 0) - (right.submitted?.revision ?? 0),
    );
    const submissions = answersWithSubmission.map(({ answer, submitted }, index) => {
      if (
        !submitted ||
        submitted.candidateId !== candidate.id ||
        submitted.materialVersion !== candidate.materialVersion ||
        submitted.revision !== index + 1
      )
        return conflict();
      const stored = object(answer.evaluation);
      const reviewValue =
        stored.schemaVersion === 'PERSONAL_LEARNING_EVIDENCE_REVIEW_V1' ? stored.review : null;
      if (
        answer.evaluationStatus === 'READY' &&
        !validatePersonalLearningEvidenceReview(reviewValue)
      )
        return conflict();
      const review =
        answer.evaluationStatus === 'READY' && validatePersonalLearningEvidenceReview(reviewValue)
          ? reviewValue
          : null;
      return {
        answerId: answer.id,
        revision: submitted.revision,
        kind: submitted.kind,
        content: submitted.content,
        status: answer.evaluationStatus,
        review,
        createdAt: answer.createdAt.toISOString(),
      };
    });
    const lastVerified = submissions.at(-1);
    const proposalEvent =
      lastVerified?.status === 'READY' && lastVerified.review?.state === 'CURRENT_STEP_EVIDENCE'
        ? await tx.programActionEvent.findFirst({
            where: {
              workspaceId: row.workspaceId,
              groupId: row.groupId,
              programEnrollmentId: row.programEnrollmentId,
              missionAssignmentId: row.id,
              actorUserId: actor.actorUserId,
              eventType: 'PERSONAL_LEARNING_NEXT_TASK_PROPOSED',
              idempotencyKey: `practice-next-proposal:${row.id}:${lastVerified.answerId}`,
            },
          })
        : null;
    const proposalRequestId = object(proposalEvent?.metadata).requestId;
    const proposalRequest =
      typeof proposalRequestId === 'string'
        ? await tx.personalLearningRequest.findFirst({
            where: { ...actor.scope, id: proposalRequestId },
          })
        : null;
    const nextCandidate = proposalRequest?.lessonCandidate
      ? this.project(proposalRequest.lessonCandidate, proposalRequest.candidateConfirmedAt)
      : null;
    return {
      assignmentId: row.id,
      goalId: data.goalId,
      planId: row.targetResourceId,
      planRevision: Number(data.planRevision),
      startedAt: row.startedAt.toISOString(),
      candidate: { ...candidate, confirmedAt: saved.confirmedAt },
      environment: {
        deviceType: environment.deviceType as PersonalLearningPractice['environment']['deviceType'],
        toolDescription: environment.toolDescription,
        experienceDescription: environment.experienceDescription as string | null,
        currentPosition: environment.currentPosition as string | null,
      },
      note,
      support: await readPracticeSupportHistory(tx, actor, row.id, candidate.id),
      submissions,
      nextCandidate,
    };
  }
  createNextPracticeRequest(
    input: Parameters<PersonalLearningPracticeRepository['createNextPracticeRequest']>[0],
  ): Promise<SavedPersonalLearningRequest> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.operationId))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid operation');
    return this.authorized(input.actor, true, async (tx, now) => {
      const actor = input.actor;
      await this.normalLearner(tx, actor);
      if (!(await this.policy(tx, actor)).allowed)
        throw new ApplicationError('CONFIGURATION_ERROR', 'practice policy unavailable');
      const row = await this.current(tx, actor);
      if (!row || row.id !== input.assignmentId) return conflict();
      const practice = await this.projectPractice(tx, actor, row);
      const verified = practice.submissions.at(-1);
      if (
        !verified ||
        verified.status !== 'READY' ||
        verified.review?.state !== 'CURRENT_STEP_EVIDENCE'
      )
        return conflict();
      const eventKey = `practice-next-proposal:${row.id}:${verified.answerId}`;
      const priorEvent = await tx.programActionEvent.findUnique({
        where: {
          workspaceId_groupId_idempotencyKey: {
            workspaceId: actor.scope.workspaceId,
            groupId: actor.scope.groupId,
            idempotencyKey: eventKey,
          },
        },
      });
      if (priorEvent) {
        const priorId = object(priorEvent.metadata).requestId;
        if (
          priorEvent.actorUserId !== actor.actorUserId ||
          priorEvent.programEnrollmentId !== actor.scope.programEnrollmentId ||
          priorEvent.missionAssignmentId !== row.id ||
          typeof priorId !== 'string'
        )
          return conflict();
        const existing = await tx.personalLearningRequest.findFirst({
          where: { ...actor.scope, id: priorId },
        });
        if (!existing) return conflict();
        return {
          id: existing.id,
          revision: existing.revision,
          createdAt: existing.createdAt.toISOString(),
          originalText: existing.originalText,
          deviceType: existing.deviceType as SavedPersonalLearningRequest['deviceType'],
          toolDescription: existing.toolDescription,
          experienceDescription: existing.experienceDescription,
          currentPosition: existing.currentPosition,
        };
      }
      const previousRequest = await tx.personalLearningRequest.findFirst({
        where: { ...actor.scope, id: practice.candidate.requestId },
      });
      const latestRequest = await tx.personalLearningRequest.findFirst({
        where: actor.scope,
        orderBy: { revision: 'desc' },
      });
      if (!previousRequest || latestRequest?.id !== previousRequest.id) return conflict();
      const review = verified.review;
      if (!review) return conflict();
      const progress = [
        `前の実践で確認できた点: ${review.observed.join('／').slice(0, 140)}`,
        `まだ確認できていない点: ${review.notEstablished.join('／').slice(0, 100)}`,
        `次の小さな行動の参考: ${review.nextAction.slice(0, 120)}`,
        previousRequest.currentPosition
          ? `これまでの本人申告: ${previousRequest.currentPosition.slice(0, 100)}`
          : 'これまでの本人申告: 未入力',
      ]
        .join('。')
        .slice(0, 500);
      const revision = previousRequest.revision + 1;
      const requestId = randomUUID();
      const saved = await tx.personalLearningRequest.create({
        data: {
          ...actor.scope,
          id: requestId,
          revision,
          originalText: previousRequest.originalText,
          deviceType: previousRequest.deviceType,
          toolDescription: previousRequest.toolDescription,
          experienceDescription: previousRequest.experienceDescription,
          currentPosition: progress,
          idempotencyKey: `next-${row.id}-${verified.answerId}`,
          digest: createHash('sha256')
            .update(`${row.id}:${verified.answerId}:${practice.candidate.id}:${progress}`)
            .digest('hex'),
          createdAt: now,
        },
      });
      await tx.programActionEvent.create({
        data: {
          workspaceId: actor.scope.workspaceId,
          groupId: actor.scope.groupId,
          programEnrollmentId: actor.scope.programEnrollmentId,
          missionAssignmentId: row.id,
          actorUserId: actor.actorUserId,
          eventType: 'PERSONAL_LEARNING_NEXT_TASK_PROPOSED',
          sourceResourceType: 'PERSONAL_LEARNING_REQUEST',
          sourceResourceId: saved.id,
          idempotencyKey: eventKey,
          occurredAt: now,
          metadata: {
            requestId: saved.id,
            requestRevision: saved.revision,
            sourceCandidateId: practice.candidate.id,
            sourceAnswerId: verified.answerId,
          },
        },
      });
      return {
        id: saved.id,
        revision: saved.revision,
        createdAt: saved.createdAt.toISOString(),
        originalText: saved.originalText,
        deviceType: saved.deviceType as SavedPersonalLearningRequest['deviceType'],
        toolDescription: saved.toolDescription,
        experienceDescription: saved.experienceDescription,
        currentPosition: saved.currentPosition,
      };
    });
  }
  readPractice(actor: PersonalLearningActor) {
    return this.authorized(actor, true, async (tx) => {
      await this.normalLearner(tx, actor);
      const policy = await this.policy(tx, actor);
      const row = await this.current(tx, actor);
      return {
        allowed: policy.allowed,
        current: row ? await this.projectPractice(tx, actor, row) : null,
      };
    });
  }
  startPractice(input: Parameters<PersonalLearningPracticeRepository['startPractice']>[0]) {
    return this.authorized(input.actor, true, async (tx, now) => {
      const actor = input.actor,
        s = actor.scope;
      await this.normalLearner(tx, actor);
      const { program, allowed } = await this.policy(tx, actor);
      if (!allowed)
        throw new ApplicationError('CONFIGURATION_ERROR', 'practice policy unavailable');
      const running = await this.current(tx, actor);
      if (running) {
        const current = await this.projectPractice(tx, actor, running);
        if (!input.previousAssignmentId) {
          if (
            current.candidate.id !== input.candidateId ||
            current.candidate.requestId !== input.requestId ||
            current.candidate.requestRevision !== input.requestRevision
          )
            return conflict();
          return current;
        }
        if (running.id !== input.previousAssignmentId) {
          const context = object(object(running.displaySnapshot).dynamicPractice);
          if (
            context.previousAssignmentId !== input.previousAssignmentId ||
            current.candidate.id !== input.candidateId ||
            current.candidate.requestId !== input.requestId ||
            current.candidate.requestRevision !== input.requestRevision
          )
            return conflict();
          return current;
        }
      }
      const row = await tx.personalLearningRequest.findFirst({
        where: s,
        orderBy: { revision: 'desc' },
      });
      if (
        row?.id !== input.requestId ||
        row.revision !== input.requestRevision ||
        !row.lessonCandidate ||
        !row.candidateConfirmedAt
      )
        return conflict();
      const candidate = this.project(row.lessonCandidate, row.candidateConfirmedAt);
      if (candidate.id !== input.candidateId || candidate.proposal.status !== 'READY')
        return conflict();
      if (input.previousAssignmentId) {
        const priorStart = await tx.programActionEvent.findUnique({
          where: {
            workspaceId_groupId_idempotencyKey: {
              workspaceId: s.workspaceId,
              groupId: s.groupId,
              idempotencyKey: `practice-next-start:${input.previousAssignmentId}:${candidate.id}`,
            },
          },
        });
        const assignmentId = object(priorStart?.metadata).assignmentId;
        if (
          priorStart?.actorUserId === actor.actorUserId &&
          priorStart.programEnrollmentId === s.programEnrollmentId &&
          typeof assignmentId === 'string'
        ) {
          const alreadyStarted = await tx.programMissionAssignment.findFirst({
            where: {
              id: assignmentId,
              workspaceId: s.workspaceId,
              groupId: s.groupId,
              programEnrollmentId: s.programEnrollmentId,
              status: 'STARTED',
            },
          });
          if (alreadyStarted) return this.projectPractice(tx, actor, alreadyStarted);
          return conflict();
        }
      }
      if (running) {
        const current = await this.projectPractice(tx, actor, running);
        if (!input.previousAssignmentId) {
          if (
            current.candidate.id !== input.candidateId ||
            current.candidate.requestId !== input.requestId ||
            current.candidate.requestRevision !== input.requestRevision
          )
            return conflict();
          return current;
        }
        if (
          input.previousAssignmentId !== running.id ||
          current.candidate.originalText !== candidate.originalText ||
          current.candidate.id === candidate.id
        )
          return conflict();
        const verified = current.submissions.at(-1);
        if (
          !verified ||
          verified.status !== 'READY' ||
          verified.review?.state !== 'CURRENT_STEP_EVIDENCE'
        )
          return conflict();
        const proposalEvent = await tx.programActionEvent.findUnique({
          where: {
            workspaceId_groupId_idempotencyKey: {
              workspaceId: s.workspaceId,
              groupId: s.groupId,
              idempotencyKey: `practice-next-proposal:${running.id}:${verified.answerId}`,
            },
          },
        });
        const proposalMetadata = object(proposalEvent?.metadata);
        if (
          proposalEvent?.actorUserId !== actor.actorUserId ||
          proposalEvent.missionAssignmentId !== running.id ||
          proposalMetadata.requestId !== row.id ||
          proposalMetadata.sourceCandidateId !== current.candidate.id ||
          proposalMetadata.sourceAnswerId !== verified.answerId
        )
          return conflict();
        const previousPlan = await tx.personalLearningPlanRevision.findFirst({
          where: {
            ...s,
            planId: current.planId,
            revision: current.planRevision,
            status: 'CONFIRMED',
          },
        });
        if (!previousPlan || previousPlan.programMemberGoalId !== current.goalId) return conflict();
        const activeOther = await tx.programMissionAssignment.count({
          where: {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            programEnrollmentId: s.programEnrollmentId,
            id: { not: running.id },
            status: { in: ['PRESENTED', 'STARTED'] },
          },
        });
        if (activeOther) return conflict();
        const version = await tx.programTemplateVersion.findFirst({
          where: {
            id: program.programTemplateVersionId,
            workspaceId: s.workspaceId,
            status: 'PUBLISHED',
          },
        });
        if (!version)
          throw new ApplicationError('CONFIGURATION_ERROR', 'published program required');
        const planRevision = current.planRevision + 1;
        await tx.personalLearningPlanRevision.update({
          where: { planId_revision: { planId: current.planId, revision: current.planRevision } },
          data: { status: 'SUPERSEDED' },
        });
        await tx.personalLearningPlanRevision.create({
          data: {
            ...s,
            planId: current.planId,
            revision: planRevision,
            previousRevision: current.planRevision,
            revisionReason: 'LEARNER_REQUEST',
            programMemberGoalId: current.goalId,
            contractVersion: 'PERSONAL_LEARNING_PLAN_V1',
            ruleVersion: PERSONAL_LEARNING_PRACTICE_VERSION,
            status: 'CONFIRMED',
            confirmedAt: now,
            steps: [
              {
                definition: {
                  packageKey: 'AI_TRAINING_V1',
                  definitionKey: 'LESSON_' + candidate.id.replaceAll('-', '').toUpperCase(),
                  version: 'MATERIAL_V1',
                },
                prerequisites: [],
                selectionReason: 'LEARNER_REQUEST',
              },
            ],
          },
        });
        const completed = await tx.programMissionAssignment.updateMany({
          where: {
            id: running.id,
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            programEnrollmentId: s.programEnrollmentId,
            status: 'STARTED',
          },
          data: { status: 'COMPLETED', completedAt: now },
        });
        if (completed.count !== 1) return conflict();
        const latest = await tx.programMissionAssignment.findFirst({
          where: {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            programEnrollmentId: s.programEnrollmentId,
          },
          orderBy: { sequence: 'desc' },
        });
        const assignment = await tx.programMissionAssignment.create({
          data: {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            programEnrollmentId: s.programEnrollmentId,
            programTemplateVersionId: version.id,
            sequence: (latest?.sequence ?? 0) + 1,
            routeKey: 'PERSONAL_LEARNING',
            phaseKey: 'PRACTICE',
            missionDefinitionKey: PERSONAL_LEARNING_PRACTICE_MISSION,
            targetResourceType: 'PERSONAL_LEARNING_PLAN',
            targetResourceId: current.planId,
            actionMode: 'WORK',
            status: 'STARTED',
            presentedAt: now,
            startedAt: now,
            ruleVersion: PERSONAL_LEARNING_PRACTICE_VERSION,
            displaySnapshot: json({
              dynamicPractice: {
                version: PERSONAL_LEARNING_PRACTICE_VERSION,
                scope: s,
                goalId: current.goalId,
                planId: current.planId,
                planRevision,
                previousAssignmentId: running.id,
                candidate: { ...candidate, confirmedAt: row.candidateConfirmedAt.toISOString() },
                environment: {
                  deviceType: row.deviceType,
                  toolDescription: row.toolDescription,
                  experienceDescription: row.experienceDescription,
                  currentPosition: row.currentPosition,
                },
              },
            }),
          },
        });
        await tx.programActionEvent.create({
          data: {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            programEnrollmentId: s.programEnrollmentId,
            missionAssignmentId: assignment.id,
            actorUserId: s.userId,
            eventType: 'PERSONAL_LEARNING_NEXT_TASK_STARTED',
            sourceResourceType: 'PERSONAL_LEARNING_PLAN',
            sourceResourceId: current.planId,
            idempotencyKey: `practice-next-start:${running.id}:${candidate.id}`,
            occurredAt: now,
            metadata: {
              previousAssignmentId: running.id,
              assignmentId: assignment.id,
              candidateId: candidate.id,
              planRevision,
            },
          },
        });
        await tx.programProgressSnapshot.upsert({
          where: { programEnrollmentId: s.programEnrollmentId },
          create: {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            programEnrollmentId: s.programEnrollmentId,
            programTemplateVersionId: version.id,
            currentAssignmentId: assignment.id,
            routeKey: 'PERSONAL_LEARNING',
            phaseKey: 'PRACTICE',
            stateKey: 'ACTIVE',
            ruleVersion: PERSONAL_LEARNING_PRACTICE_VERSION,
            calculatedAt: now,
            nextEvaluationAt: null,
          },
          update: {
            currentAssignmentId: assignment.id,
            routeKey: 'PERSONAL_LEARNING',
            phaseKey: 'PRACTICE',
            stateKey: 'ACTIVE',
            ruleVersion: PERSONAL_LEARNING_PRACTICE_VERSION,
            calculatedAt: now,
            nextEvaluationAt: null,
            revision: { increment: 1 },
          },
        });
        return this.projectPractice(tx, actor, assignment);
      }
      if (!row.deviceType || !row.toolDescription) return conflict();
      // Never switch an executing plan or unfinished assignment implicitly.
      if (
        (await tx.programMissionAssignment.count({
          where: {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            programEnrollmentId: s.programEnrollmentId,
            status: { in: ['PRESENTED', 'STARTED'] },
          },
        })) ||
        (await tx.personalLearningPlanRevision.count({ where: { ...s, status: 'CONFIRMED' } }))
      )
        return conflict();
      const version = await tx.programTemplateVersion.findFirst({
        where: {
          id: program.programTemplateVersionId,
          workspaceId: s.workspaceId,
          status: 'PUBLISHED',
        },
      });
      if (!version) throw new ApplicationError('CONFIGURATION_ERROR', 'published program required');
      const goal = await tx.programMemberGoal.create({
        data: {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
          groupMembershipId: s.groupMembershipId,
          title: row.originalText.slice(0, 160),
          metricType: 'ACTION',
          targetValue: 1,
          currentValue: 0,
          unit: '本人の学習目標',
          startsAt: now,
          createdByUserId: s.userId,
          updatedByUserId: s.userId,
        },
      });
      const semantic = 'FREE_INTENT_' + row.id.replaceAll('-', '').toUpperCase();
      await tx.personalLearningGoalConfirmation.create({
        data: {
          ...s,
          programMemberGoalId: goal.id,
          packageKey: 'AI_TRAINING_V1',
          goalKey: semantic,
          semanticVersion: 'V1',
          consultationRuleVersion: PERSONAL_LEARNING_PRACTICE_VERSION,
          scopeRuleVersion: LEARNING_CANDIDATE_POLICY,
          confirmedAt: now,
        },
      });
      const planId = randomUUID();
      await tx.personalLearningPlanRevision.create({
        data: {
          ...s,
          planId,
          revision: 1,
          revisionReason: 'INITIAL',
          programMemberGoalId: goal.id,
          contractVersion: 'PERSONAL_LEARNING_PLAN_V1',
          ruleVersion: PERSONAL_LEARNING_PRACTICE_VERSION,
          status: 'CONFIRMED',
          confirmedAt: now,
          steps: [
            {
              definition: {
                packageKey: 'AI_TRAINING_V1',
                definitionKey: 'LESSON_' + candidate.id.replaceAll('-', '').toUpperCase(),
                version: 'MATERIAL_V1',
              },
              prerequisites: [],
              selectionReason: 'LEARNER_REQUEST',
            },
          ],
        },
      });
      const latest = await tx.programMissionAssignment.findFirst({
        where: {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
        },
        orderBy: { sequence: 'desc' },
      });
      const environment = {
        deviceType: row.deviceType,
        toolDescription: row.toolDescription,
        experienceDescription: row.experienceDescription,
        currentPosition: row.currentPosition,
      };
      const assignment = await tx.programMissionAssignment.create({
        data: {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
          programTemplateVersionId: version.id,
          sequence: (latest?.sequence ?? 0) + 1,
          routeKey: 'PERSONAL_LEARNING',
          phaseKey: 'PRACTICE',
          missionDefinitionKey: PERSONAL_LEARNING_PRACTICE_MISSION,
          targetResourceType: 'PERSONAL_LEARNING_PLAN',
          targetResourceId: planId,
          actionMode: 'WORK',
          status: 'STARTED',
          presentedAt: now,
          startedAt: now,
          ruleVersion: PERSONAL_LEARNING_PRACTICE_VERSION,
          displaySnapshot: json({
            dynamicPractice: {
              version: PERSONAL_LEARNING_PRACTICE_VERSION,
              scope: s,
              goalId: goal.id,
              planId,
              planRevision: 1,
              candidate,
              environment,
            },
          }),
        },
      });
      await tx.programActionEvent.create({
        data: {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
          missionAssignmentId: assignment.id,
          actorUserId: s.userId,
          eventType: 'PERSONAL_LEARNING_PRACTICE_STARTED',
          sourceResourceType: 'PERSONAL_LEARNING_PLAN',
          sourceResourceId: planId,
          idempotencyKey: 'practice-start:' + candidate.id,
          occurredAt: now,
          metadata: json({
            goalId: goal.id,
            planId,
            planRevision: 1,
            candidateId: candidate.id,
            requestId: row.id,
            requestRevision: row.revision,
            policyVersion: LEARNING_CANDIDATE_POLICY,
          }),
        },
      });
      const progress = {
        currentAssignmentId: assignment.id,
        routeKey: 'PERSONAL_LEARNING',
        phaseKey: 'PRACTICE',
        stateKey: 'ACTIVE',
        ruleVersion: PERSONAL_LEARNING_PRACTICE_VERSION,
        calculatedAt: now,
        nextEvaluationAt: null,
      };
      await tx.programProgressSnapshot.upsert({
        where: { programEnrollmentId: s.programEnrollmentId },
        create: {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
          programTemplateVersionId: version.id,
          ...progress,
        },
        update: { ...progress, revision: { increment: 1 } },
      });
      return this.projectPractice(tx, actor, assignment);
    });
  }
  recordPracticeNote(
    input: Parameters<PersonalLearningPracticeRepository['recordPracticeNote']>[0],
  ) {
    validatePersonalLearningPracticeNote(input.text, input.expectedRevision);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.operationId))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid operation');
    return this.authorized(input.actor, true, async (tx, now) => {
      const actor = input.actor,
        s = actor.scope;
      await this.normalLearner(tx, actor);
      if (!(await this.policy(tx, actor)).allowed)
        throw new ApplicationError('CONFIGURATION_ERROR', 'practice policy unavailable');
      const row = await this.current(tx, actor);
      if (!row || row.id !== input.assignmentId) return conflict();
      const current = await this.projectPractice(tx, actor, row);
      const key = 'practice-note:' + input.operationId;
      const digest = createHash('sha256')
        .update(
          JSON.stringify({
            assignmentId: row.id,
            text: input.text,
            expectedRevision: input.expectedRevision,
          }),
        )
        .digest('hex');
      const prior = await tx.programActionEvent.findUnique({
        where: {
          workspaceId_groupId_idempotencyKey: {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            idempotencyKey: key,
          },
        },
      });
      if (prior) {
        if (
          prior.actorUserId !== s.userId ||
          prior.programEnrollmentId !== s.programEnrollmentId ||
          prior.missionAssignmentId !== row.id ||
          prior.eventType !== 'PERSONAL_LEARNING_PRACTICE_NOTE' ||
          object(prior.metadata).digest !== digest
        )
          return conflict();
        return current;
      }
      if ((current.note?.revision ?? 0) !== input.expectedRevision) return conflict();
      await tx.programActionEvent.create({
        data: {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
          missionAssignmentId: row.id,
          actorUserId: s.userId,
          eventType: 'PERSONAL_LEARNING_PRACTICE_NOTE',
          idempotencyKey: key,
          occurredAt: now,
          metadata: {
            digest,
            revision: input.expectedRevision + 1,
            text: input.text,
            reportedAt: now.toISOString(),
            evidenceLevel: 'SELF_REPORT',
          },
        },
      });
      // A note is not an Answer, evaluation, completion or capability score.
      return this.projectPractice(tx, actor, row);
    });
  }
}
