import { createHash } from 'node:crypto';
import { AI_TRAINING_V1_MODULE_KEY } from '@bunshin/capability-training';
import {
  PERSONAL_LEARNING_PRACTICE_MISSION,
  PERSONAL_LEARNING_EVIDENCE_SUBMISSION_VERSION,
  parseStoredPersonalLearningEvidenceSubmission,
  validatePersonalLearningEvidenceSubmission,
} from '@bunshin/application';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from './index';
import { lockTrainingEnrollmentData } from './training-data-lock';
import { trainingEnrollmentPeriodWhere } from './training-enrollment-period';
import {
  requirePersonalLearningPilotSeat,
  requireTrainingLearnerRole,
} from './personal-learning-pilot-seat';

export type TrainingAnswerSubmissionResult =
  | {
      outcome: 'SUBMITTED' | 'ALREADY_SUBMITTED';
      answer: {
        id: string;
        missionAssignmentId: string;
        evaluationStatus: 'PENDING' | 'READY' | 'FAILED';
        createdAt: Date;
        updatedAt: Date;
      };
      eventId: string;
    }
  | { outcome: 'NOT_FOUND' | 'CONFLICT' };

export class PrismaTrainingAnswerRepository {
  constructor(
    private readonly client: PrismaClient = prisma,
    private readonly now = () => new Date(),
  ) {}

  async submit(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    missionAssignmentId: string;
    answer: string;
    practiceEvidence?: {
      kind: 'TEXT' | 'SELF_REPORT';
      content: string;
      expectedRevision: number;
      candidateId: string;
      materialVersion: number;
    };
    idempotencyKey: string;
    occurredAt: Date;
  }): Promise<TrainingAnswerSubmissionResult> {
    const [enrollment, membership] = await Promise.all([
      this.client.programEnrollment.findFirst({
        where: {
          id: input.programEnrollmentId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'ACTIVE',
          startsAt: { not: null },
          AND: [trainingEnrollmentPeriodWhere(this.now())],
        },
        select: { id: true, groupMembershipId: true, serviceProgramId: true },
      }),
      this.client.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          serviceRole: { in: ['PARTICIPANT', 'SERVICE_OWNER'] },
          status: 'ACTIVE',
        },
        select: { id: true, serviceRole: true },
      }),
    ]);
    if (!enrollment || !membership || enrollment.groupMembershipId !== membership.id)
      return { outcome: 'NOT_FOUND' };
    const program = await this.client.serviceProgram.findFirst({
      where: {
        id: enrollment.serviceProgramId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status: 'ACTIVE',
        settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY },
      },
      select: { id: true, settings: true },
    });
    if (!program) return { outcome: 'NOT_FOUND' };
    const capped = Object.hasOwn(
      (program.settings as { personalLearningPilot?: object })?.personalLearningPilot ?? {},
      'participantControl',
    );
    const seatScope = {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      programEnrollmentId: input.programEnrollmentId,
      userId: input.actorUserId,
    };
    if (membership.serviceRole !== 'PARTICIPANT')
      await this.client.$transaction((tx) =>
        requireTrainingLearnerRole(tx, seatScope, membership.serviceRole),
      );
    if (capped)
      await this.client.$transaction((tx) => requirePersonalLearningPilotSeat(tx, seatScope, true));

    const eventWhere = {
      workspaceId_groupId_idempotencyKey: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        idempotencyKey: input.idempotencyKey,
      },
    };
    const existingEvent = await this.client.programActionEvent.findUnique({ where: eventWhere });
    if (existingEvent) return this.resultForExistingEvent(input, existingEvent);

    try {
      return await this.client.$transaction(async (tx) => {
        await lockTrainingEnrollmentData(tx, input);
        await requireTrainingLearnerRole(tx, seatScope, membership.serviceRole);
        if (capped) await requirePersonalLearningPilotSeat(tx, seatScope, true);
        const active = await tx.programEnrollment.findFirst({
          where: {
            id: enrollment.id,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: membership.id,
            status: 'ACTIVE',
            AND: [trainingEnrollmentPeriodWhere(this.now())],
          },
          select: { id: true },
        });
        if (!active) return { outcome: 'NOT_FOUND' } as const;
        const assignment = await tx.programMissionAssignment.findFirst({
          where: {
            id: input.missionAssignmentId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: enrollment.id,
            actionMode: 'WORK',
            status: { in: ['PRESENTED', 'STARTED'] },
          },
          select: {
            id: true,
            missionDefinitionKey: true,
            targetResourceType: true,
            status: true,
            displaySnapshot: true,
          },
        });
        if (!assignment) return { outcome: 'NOT_FOUND' } as const;

        const dynamic = assignment.missionDefinitionKey === PERSONAL_LEARNING_PRACTICE_MISSION;
        let answerValue = input.answer;
        let evidenceRevision: number | null = null;
        if (dynamic) {
          const evidence = input.practiceEvidence;
          const snapshot = assignment.displaySnapshot as {
            dynamicPractice?: { candidate?: { id?: string; materialVersion?: number } };
          };
          if (!evidence) return { outcome: 'NOT_FOUND' } as const;
          if (
            input.answer !== evidence.content ||
            evidence.candidateId !== snapshot.dynamicPractice?.candidate?.id ||
            evidence.materialVersion !== snapshot.dynamicPractice?.candidate?.materialVersion
          )
            return { outcome: 'CONFLICT' } as const;
          validatePersonalLearningEvidenceSubmission(evidence);
          const history = await tx.trainingMissionAnswer.findMany({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              programEnrollmentId: enrollment.id,
              missionAssignmentId: assignment.id,
              userId: input.actorUserId,
            },
            orderBy: { createdAt: 'asc' },
            take: 101,
            select: { evaluationStatus: true, answer: true },
          });
          const historyWithRevision = history.map((row) => ({
            row,
            submitted: parseStoredPersonalLearningEvidenceSubmission(row.answer),
          }));
          historyWithRevision.sort(
            (left, right) => (left.submitted?.revision ?? 0) - (right.submitted?.revision ?? 0),
          );
          if (
            history.length > 100 ||
            history.length !== evidence.expectedRevision ||
            historyWithRevision.some(
              ({ row, submitted }, index) =>
                row.evaluationStatus === 'PENDING' ||
                submitted?.revision !== index + 1 ||
                submitted.candidateId !== evidence.candidateId ||
                submitted.materialVersion !== evidence.materialVersion,
            )
          )
            return { outcome: 'CONFLICT' } as const;
          evidenceRevision = history.length + 1;
          answerValue = JSON.stringify({
            schemaVersion: PERSONAL_LEARNING_EVIDENCE_SUBMISSION_VERSION,
            kind: evidence.kind,
            content: evidence.content,
            candidateId: evidence.candidateId,
            materialVersion: evidence.materialVersion,
            revision: evidenceRevision,
          });
        } else {
          if (input.practiceEvidence) return { outcome: 'NOT_FOUND' } as const;
          const existingAnswer = await tx.trainingMissionAnswer.findFirst({
            where: { missionAssignmentId: assignment.id },
            select: { id: true },
          });
          if (existingAnswer) return { outcome: 'CONFLICT' } as const;
        }

        // Pilot submission is itself a real start fact, not a fabricated HINT/HELP interaction.
        // Legacy V1 remains unchanged. Enrollment lock keeps this atomic with the answer.
        if (
          assignment.targetResourceType === 'PERSONAL_LEARNING_PLAN' &&
          assignment.status === 'PRESENTED'
        ) {
          await tx.programMissionAssignment.update({
            where: { id: assignment.id },
            data: {
              status: 'STARTED',
              startedAt: input.occurredAt,
            },
          });
        }

        const answer = await tx.trainingMissionAnswer.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: enrollment.id,
            missionAssignmentId: assignment.id,
            userId: input.actorUserId,
            answer: answerValue,
            evaluationStatus: 'PENDING',
          },
          select: {
            id: true,
            missionAssignmentId: true,
            evaluationStatus: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        const event = await tx.programActionEvent.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: enrollment.id,
            missionAssignmentId: assignment.id,
            eventType: 'ANSWER_SUBMITTED',
            sourceResourceType: 'TRAINING_MISSION_ANSWER',
            sourceResourceId: answer.id,
            idempotencyKey: input.idempotencyKey,
            schemaVersion: 1,
            metadata: {
              missionDefinitionKey: assignment.missionDefinitionKey,
              answerLength: input.answer.length,
              answerDigest: createHash('sha256').update(answerValue).digest('hex'),
              ...(dynamic && input.practiceEvidence
                ? {
                    evidenceKind: input.practiceEvidence.kind,
                    evidenceRevision,
                    candidateId: input.practiceEvidence.candidateId,
                    materialVersion: input.practiceEvidence.materialVersion,
                  }
                : {}),
            },
            actorUserId: input.actorUserId,
            occurredAt: input.occurredAt,
          },
          select: { id: true },
        });
        return { outcome: 'SUBMITTED', answer, eventId: event.id } as const;
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
      if (error.code !== 'P2002') throw error;
      const event = await this.client.programActionEvent.findUnique({ where: eventWhere });
      if (event) return this.resultForExistingEvent(input, event);
      return { outcome: 'CONFLICT' };
    }
  }

  private async resultForExistingEvent(
    input: {
      workspaceId: string;
      groupId: string;
      actorUserId: string;
      programEnrollmentId: string;
      missionAssignmentId: string;
      answer: string;
      practiceEvidence?: {
        kind: 'TEXT' | 'SELF_REPORT';
        content: string;
        expectedRevision: number;
        candidateId: string;
        materialVersion: number;
      };
    },
    event: {
      id: string;
      programEnrollmentId: string;
      missionAssignmentId: string | null;
      eventType: string;
      sourceResourceType: string | null;
      sourceResourceId: string | null;
      actorUserId: string | null;
      metadata: unknown;
    },
  ): Promise<TrainingAnswerSubmissionResult> {
    if (
      event.programEnrollmentId !== input.programEnrollmentId ||
      event.missionAssignmentId !== input.missionAssignmentId ||
      event.eventType !== 'ANSWER_SUBMITTED' ||
      event.sourceResourceType !== 'TRAINING_MISSION_ANSWER' ||
      event.sourceResourceId === null ||
      event.actorUserId !== input.actorUserId
    ) {
      return { outcome: 'CONFLICT' };
    }
    const answerValue = input.practiceEvidence
      ? JSON.stringify({
          schemaVersion: PERSONAL_LEARNING_EVIDENCE_SUBMISSION_VERSION,
          kind: input.practiceEvidence.kind,
          content: input.practiceEvidence.content,
          candidateId: input.practiceEvidence.candidateId,
          materialVersion: input.practiceEvidence.materialVersion,
          revision: input.practiceEvidence.expectedRevision + 1,
        })
      : input.answer;
    const answerDigest = createHash('sha256').update(answerValue).digest('hex');
    const storedDigest = (event.metadata as { answerDigest?: unknown } | null)?.answerDigest;
    if (
      (typeof storedDigest === 'string' && storedDigest !== answerDigest) ||
      (input.practiceEvidence && typeof storedDigest !== 'string')
    )
      return { outcome: 'CONFLICT' };
    const answer = await this.client.trainingMissionAnswer.findFirst({
      where: {
        id: event.sourceResourceId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        programEnrollmentId: input.programEnrollmentId,
        missionAssignmentId: input.missionAssignmentId,
        userId: input.actorUserId,
      },
      select: {
        id: true,
        missionAssignmentId: true,
        evaluationStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return answer
      ? { outcome: 'ALREADY_SUBMITTED', answer, eventId: event.id }
      : { outcome: 'CONFLICT' };
  }
}
