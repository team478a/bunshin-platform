import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { PrismaClient, Prisma } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupProgramFixtures } from './program-fixture-cleanup';
import { PrismaPersonalLearningParticipantAdminRepository } from '../src/personal-learning-participant-admin';
import { PrismaPersonalLearningPilotOperations } from '../src/personal-learning-pilot-operations';
import {
  requirePersonalLearningPilotSeat,
  pilotParticipantHash,
} from '../src/personal-learning-pilot-seat';
import { PrismaTrainingPersonalDataExportRepository } from '../src/training-personal-data-export';
import {
  PERSONAL_LEARNING_PLAN_CONTRACT_VERSION,
  type PersonalLearningPlan,
  type LearningConsultationAnswer,
} from '@bunshin/application';
import {
  AI_TRAINING_LEARNING_DEFINITION_FIXTURES,
  consultAiTrainingLearning,
  projectAiTrainingLearnerProfiles,
  createAiTrainingV1Definition,
  createPersonalLearningProgramDefinition,
  AI_TRAINING_SKILL_RULE_VERSION,
  getAiTrainingMissionQuality,
} from '@bunshin/capability-training';
import { PrismaPersonalLearningPersistenceRepository } from '../src/personal-learning-persistence';
import { PrismaPersonalLearningRouterBridge } from '../src/personal-learning-router';
import { PrismaTrainingAnswerRepository } from '../src/training-answer';
import { PrismaPersonalLearningAiCallRepository } from '../src/personal-learning-ai-call';
import { PrismaLearningDefinitionApprovalAdminRepository } from '../src/learning-definition-approval-admin';
import { PrismaPersonalLearningPilotProfileRepository } from '../src/personal-learning-pilot-profile';
import { PrismaPersonalLearningAssessmentGate } from '../src/personal-learning-assessment-gate';
import { PrismaPersonalLearningCallAdmission } from '../src/personal-learning-call-admission';
import { PrismaGuidedPracticeRepository } from '../src/guided-practice';
import { PrismaTrainingPersonalDataDeletionRepository } from '../src/training-personal-data-deletion';
import {
  PrismaPersonalLearningPilotRepository,
  PrismaPersonalLearningPilotRouter,
} from '../src/personal-learning-pilot';
import { PrismaAiTrainingRuntimeCandidateRepository } from '../src/training-runtime-candidate-repository';
import { PrismaAiTrainingRuntimeStateRepository } from '../src/training-runtime-state-repository';
const now = new Date('2026-10-06T02:00:00Z');

/** Called ONLY after database.integration.test.ts live disposable preflight. */
export function registerPersonalLearningPersistenceIntegrationCases(client: PrismaClient) {
  describe('P1-C-S real PostgreSQL persistence', () => {
    afterEach(() => cleanupProgramFixtures(client));
    async function fixture(approved = true) {
      const owner = await client.user.create({
        data: { displayName: 'Synthetic learning reviewer' },
      });
      const user = await client.user.create({ data: { displayName: 'Synthetic learner' } });
      const workspace = await client.workspace.create({
        data: { type: 'ORGANIZATION', name: `learning-${randomUUID()}` },
      });
      const group = await client.group.create({
        data: { workspaceId: workspace.id, name: 'Synthetic learning service' },
      });
      await client.groupMembership.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          userId: owner.id,
          serviceRole: 'SERVICE_OWNER',
          status: 'ACTIVE',
          consentedAt: now,
        },
      });
      const member = await client.groupMembership.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          userId: user.id,
          serviceRole: 'PARTICIPANT',
          status: 'ACTIVE',
          consentedAt: now,
        },
      });
      const template = await client.programTemplate.create({
        data: {
          workspaceId: workspace.id,
          ownerGroupId: group.id,
          name: 'Synthetic',
          description: 'Synthetic',
          category: 'AI_TRAINING',
          targetAudience: 'Synthetic',
          status: 'ACTIVE',
          visibility: 'PRIVATE',
          createdByUserId: owner.id,
        },
      });
      const version = await client.programTemplateVersion.create({
        data: {
          workspaceId: workspace.id,
          programTemplateId: template.id,
          version: 1,
          status: 'PUBLISHED',
          definition: {},
          createdByUserId: owner.id,
          publishedAt: now,
        },
      });
      const program = await client.serviceProgram.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          programTemplateVersionId: version.id,
          displayName: 'Synthetic',
          description: 'Synthetic',
          status: 'ACTIVE',
          settings: { moduleKey: 'AI_TRAINING_V1' },
          createdByUserId: owner.id,
        },
      });
      const offering = await client.programOffering.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          serviceProgramId: program.id,
          version: 1,
          status: 'ACTIVE',
          seller: 'SERVICE',
          priceOwner: 'SERVICE',
          paymentOwner: 'SERVICE',
          apiCostOwner: 'PLATFORM',
          supportOwner: 'SERVICE',
          contentOwner: 'SERVICE',
          characterOwner: 'SERVICE',
          termsSnapshot: {},
          createdByUserId: owner.id,
        },
      });
      const enrollment = await client.programEnrollment.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          groupMembershipId: member.id,
          serviceProgramId: program.id,
          programOfferingId: offering.id,
          status: 'ACTIVE',
          supportMode: 'GUIDED',
          goalSnapshot: {},
          offeringSnapshot: {},
          invitedByUserId: owner.id,
          startsAt: new Date(now.getTime() - 86400000),
          endsAt: new Date(now.getTime() + 86400000),
        },
      });
      const scope = {
        workspaceId: workspace.id,
        groupId: group.id,
        programEnrollmentId: enrollment.id,
        groupMembershipId: member.id,
        userId: user.id,
      };
      if (approved)
        await client.learningDefinitionApproval.createMany({
          data: AI_TRAINING_LEARNING_DEFINITION_FIXTURES.map((definition) => ({
            workspaceId: workspace.id,
            groupId: group.id,
            ...definition.reference,
            approvalStatus: 'APPROVED',
            approvedAt: now,
            approvedByUserId: owner.id,
          })),
        });
      const ctx = {
        scope,
        ...projectAiTrainingLearnerProfiles({ scope, profile: null, goals: [] }),
        approvedDefinitionRefs: AI_TRAINING_LEARNING_DEFINITION_FIXTURES.map((d) => d.reference),
      };
      const text = 'プロンプトを学びたい';
      const answers: LearningConsultationAnswer[] = [
        { questionKey: 'AI_EXPERIENCE', answerKey: 'UNKNOWN' },
      ];
      const candidate = consultAiTrainingLearning(ctx, { scope, text, answers });
      if (candidate.status !== 'GOAL_CANDIDATE') throw new Error('missing synthetic candidate');
      answers.push({
        questionKey: 'GOAL_CONFIRMATION',
        answerKey: 'YES',
        candidateKey: candidate.question.candidateKey!,
      });
      const consultation = { scope, text, answers };
      const actor = { scope, actorUserId: user.id };
      const repo = new PrismaPersonalLearningPersistenceRepository(client, () => now);
      const confirm = { ...actor, idempotencyKey: 'confirm', consultation };
      async function plan(): Promise<PersonalLearningPlan> {
        await repo.confirmGoal(confirm);
        const state = await repo.read(actor);
        return {
          contractVersion: PERSONAL_LEARNING_PLAN_CONTRACT_VERSION,
          ruleVersion: 'PERSONAL_LEARNING_PLAN_V1',
          planId: randomUUID(),
          revision: 1,
          previousRevision: null,
          revisionReason: 'INITIAL',
          scope,
          goal: state.goals[0]!.reference,
          status: 'DRAFT',
          confirmation: null,
          steps: AI_TRAINING_LEARNING_DEFINITION_FIXTURES.map((d) => ({
            definition: d.reference,
            prerequisites: d.prerequisites,
            selectionReason: 'GOAL_ALIGNMENT',
          })),
        };
      }
      return { repo, actor, confirm, scope, enrollment, owner, group, member, plan };
    }
    async function creationFixture() {
      const f = await fixture(false);
      const group = await client.group.create({
        data: {
          workspaceId: f.scope.workspaceId,
          name: 'Synthetic open-ended Pilot service',
        },
      });
      await client.groupMembership.create({
        data: {
          workspaceId: f.scope.workspaceId,
          groupId: group.id,
          userId: f.owner.id,
          serviceRole: 'SERVICE_OWNER',
          status: 'ACTIVE',
          consentedAt: now,
        },
      });
      const authority = {
        workspaceId: f.scope.workspaceId,
        groupId: group.id,
        serviceProgramId: randomUUID(),
      };
      const ops = new PrismaPersonalLearningPilotOperations(client, authority, () => {});
      const command = {
        action: 'CREATE_PROGRAM' as const,
        operationId: randomUUID(),
        expectedStateToken: (await ops.read(f.owner.id)).stateToken,
        confirmation: 'CONFIRM_PILOT_OPERATION' as const,
        reviewEvidenceKey: 'synthetic-human-review',
      };
      return { ...f, authority, ops, command };
    }
    it('creates an open-ended stopped Program atomically without runtime or approval data', async () => {
      const f = await creationFixture();
      expect(await f.ops.read(f.owner.id)).toMatchObject({ exists: false, status: 'ABSENT' });
      const result = await f.ops.change(f.owner.id, f.command);
      expect(result).toMatchObject({
        exists: true,
        status: 'SUSPENDED',
        enabled: false,
        initialized: true,
        replayed: false,
      });
      const p = await client.serviceProgram.findUniqueOrThrow({
        where: { id: f.authority.serviceProgramId },
      });
      expect(p.settings).toMatchObject({
        supportModes: ['GUIDED'],
        personalLearningPilot: { enabled: false, enrollmentIds: [] },
        trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
      });
      const v = await client.programTemplateVersion.findUniqueOrThrow({
        where: { id: p.programTemplateVersionId },
      });
      expect(v.definition).toMatchObject({ duration: { type: 'OPEN_ENDED' } });
      const t = await client.programTemplate.findUniqueOrThrow({
        where: { id: v.programTemplateId },
      });
      expect(t).toMatchObject({ visibility: 'PRIVATE', ownerGroupId: f.authority.groupId });
      expect(
        await client.programOffering.findUniqueOrThrow({
          where: { id: result.programOfferingId! },
        }),
      ).toMatchObject({
        isFree: true,
        endsAt: null,
        startsAt: null,
        termsSnapshot: { supportModes: ['GUIDED'], participation: 'INVITATION_ONLY' },
      });
      expect(await client.programEnrollment.count({ where: f.authority })).toBe(0);
      expect(await client.personalLearningPilotSeat.count({ where: f.authority })).toBe(0);
      expect(
        await client.learningDefinitionApproval.count({
          where: { workspaceId: f.authority.workspaceId, groupId: f.authority.groupId },
        }),
      ).toBe(0);
      expect(
        await client.serviceProgram.findUniqueOrThrow({
          where: { id: f.enrollment.serviceProgramId },
        }),
      ).toMatchObject({ status: 'ACTIVE', settings: { moduleKey: 'AI_TRAINING_V1' } });
      expect(await f.ops.change(f.owner.id, f.command)).toMatchObject({
        replayed: true,
        programOfferingId: result.programOfferingId,
      });
      expect(await client.programOffering.count({ where: f.authority })).toBe(1);
      await expect(
        f.ops.change(f.owner.id, { ...f.command, operationId: randomUUID() }),
      ).rejects.toThrow('PILOT_PROGRAM_ALREADY_EXISTS');
      await expect(
        f.ops.change(f.owner.id, { ...f.command, reviewEvidenceKey: 'changed-review' }),
      ).rejects.toThrow('PILOT_PROGRAM_ALREADY_EXISTS');
    });
    it('rejects stale state, foreign actors and occupied authority without creating data', async () => {
      const f = await creationFixture();
      await expect(
        f.ops.change(f.owner.id, { ...f.command, expectedStateToken: 'a'.repeat(64) }),
      ).rejects.toThrow('PILOT_STATE_CHANGED');
      await expect(f.ops.change(f.scope.userId, f.command)).rejects.toThrow(
        'pilot operation unavailable',
      );
      const foreign = new PrismaPersonalLearningPilotOperations(
        client,
        { ...f.authority, serviceProgramId: f.enrollment.serviceProgramId },
        () => {},
      );
      await expect(foreign.read(f.owner.id)).rejects.toThrow('pilot operation unavailable');
      expect(await client.serviceProgram.count({ where: { groupId: f.authority.groupId } })).toBe(
        0,
      );
    });
    it('rolls creation back if operation authority is revoked before commit', async () => {
      const f = await creationFixture();
      let checks = 0;
      const ops = new PrismaPersonalLearningPilotOperations(client, f.authority, () => {
        if (++checks >= 3) throw new Error('synthetic authority revoked');
      });
      await expect(ops.change(f.owner.id, f.command)).rejects.toThrow(
        'synthetic authority revoked',
      );
      expect(await client.serviceProgram.count({ where: { groupId: f.authority.groupId } })).toBe(
        0,
      );
      expect(
        await client.programTemplate.count({ where: { ownerGroupId: f.authority.groupId } }),
      ).toBe(0);
    });
    it('serializes simultaneous creation and refuses adoption over existing training', async () => {
      const f = await creationFixture();
      const results = await Promise.allSettled([
        f.ops.change(f.owner.id, f.command),
        f.ops.change(f.owner.id, { ...f.command, operationId: randomUUID() }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await client.serviceProgram.count({ where: { groupId: f.authority.groupId } })).toBe(
        1,
      );
      expect(
        await client.programTemplate.count({ where: { ownerGroupId: f.authority.groupId } }),
      ).toBe(1);
      const authority = {
        ...f.authority,
        groupId: f.scope.groupId,
        serviceProgramId: randomUUID(),
      };
      const ops = new PrismaPersonalLearningPilotOperations(client, authority, () => {});
      await expect(
        ops.change(f.owner.id, {
          ...f.command,
          expectedStateToken: (await ops.read(f.owner.id)).stateToken,
        }),
      ).rejects.toThrow('PILOT_EMPTY_DEDICATED_PROGRAM_REQUIRED');
    });
    it('prepares an Enrollment without a fixed end date while leaving the Pilot stopped', async () => {
      const f = await creationFixture();
      const created = await f.ops.change(f.owner.id, f.command);
      const seats = new PrismaPersonalLearningParticipantAdminRepository(client, f.authority);
      await seats.change(f.owner.id, {
        action: 'CONFIGURE',
        operationId: randomUUID(),
        expectedRevision: 0,
        confirmation: 'CONFIRM_PILOT_PARTICIPANT_OPERATION',
        reviewEvidenceKey: 'synthetic-human-review',
        externalParticipantCap: 100,
        internalParticipantCap: 2,
        currentWave: 0,
      });
      const member = await client.groupMembership.create({
        data: {
          workspaceId: f.authority.workspaceId,
          groupId: f.authority.groupId,
          userId: f.scope.userId,
          serviceRole: 'PARTICIPANT',
          status: 'ACTIVE',
          consentedAt: now,
        },
      });
      const result = await f.ops.change(f.owner.id, {
        ...f.command,
        action: 'PREPARE_ENROLLMENT',
        operationId: randomUUID(),
        expectedStateToken: (await f.ops.read(f.owner.id)).stateToken,
        groupMembershipId: member.id,
        programOfferingId: created.programOfferingId!,
      });
      expect(
        await client.programEnrollment.findUniqueOrThrow({
          where: { id: result.programEnrollmentId! },
        }),
      ).toMatchObject({
        endsAt: null,
        supportMode: 'GUIDED',
        status: 'ACTIVE',
      });
      expect(await f.ops.read(f.owner.id)).toMatchObject({ status: 'SUSPENDED', enabled: false });
      expect(await client.personalLearningPilotSeat.count({ where: f.authority })).toBe(0);
    });
    async function operationsFixture() {
      const f = await fixture(false);
      const authority = {
        workspaceId: f.scope.workspaceId,
        groupId: f.scope.groupId,
        serviceProgramId: f.enrollment.serviceProgramId,
      };
      await client.programEnrollment.delete({ where: { id: f.enrollment.id } });
      const program = await client.serviceProgram.findUniqueOrThrow({
        where: { id: authority.serviceProgramId },
      });
      await client.programTemplateVersion.update({
        where: { id: program.programTemplateVersionId },
        data: {
          definition: JSON.parse(
            JSON.stringify(createAiTrainingV1Definition()),
          ) as Prisma.InputJsonValue,
        },
      });
      await client.programOffering.update({
        where: { id: f.enrollment.programOfferingId },
        data: { termsSnapshot: { participation: 'INVITATION_ONLY', supportModes: ['GUIDED'] } },
      });
      const admission = {
        ...authority,
        model: 'synthetic-model',
        dailyAttemptLimit: 12,
        maxConcurrent: 1,
        maxOutputTokens: 512,
        maxRequestBytes: 2048,
      };
      const ops = new PrismaPersonalLearningPilotOperations(client, authority, () => {}, admission);
      async function command(action: 'INITIALIZE' | 'START' | 'STOP') {
        return {
          action,
          operationId: randomUUID(),
          expectedStateToken: (await ops.read(f.owner.id)).stateToken,
          confirmation: 'CONFIRM_PILOT_OPERATION' as const,
          reviewEvidenceKey: 'synthetic-human-review',
        };
      }
      async function initialize() {
        await ops.change(f.owner.id, await command('INITIALIZE'));
        const seats = new PrismaPersonalLearningParticipantAdminRepository(client, authority);
        await seats.change(f.owner.id, {
          action: 'CONFIGURE',
          operationId: randomUUID(),
          expectedRevision: 0,
          confirmation: 'CONFIRM_PILOT_PARTICIPANT_OPERATION',
          reviewEvidenceKey: 'synthetic-human-review',
          externalParticipantCap: 100,
          internalParticipantCap: 2,
          currentWave: 0,
        });
        return seats;
      }
      async function prepare() {
        return {
          ...(await command('INITIALIZE')),
          action: 'PREPARE_ENROLLMENT' as const,
          groupMembershipId: f.member.id,
          programOfferingId: f.enrollment.programOfferingId,
        };
      }
      async function ready() {
        const seats = await initialize();
        const result = await ops.change(f.owner.id, await prepare());
        const id = result.programEnrollmentId!;
        await seats.change(f.owner.id, {
          action: 'ADMIT',
          operationId: randomUUID(),
          expectedRevision: 1,
          confirmation: 'CONFIRM_PILOT_PARTICIPANT_OPERATION',
          reviewEvidenceKey: 'synthetic-human-review',
          programEnrollmentId: id,
          kind: 'INTERNAL',
        });
        await new PrismaPersonalLearningPilotProfileRepository(
          client,
          () => new Date(),
          authority,
        ).initialize(
          {
            workspaceId: authority.workspaceId,
            groupId: authority.groupId,
            programEnrollmentId: id,
            actorUserId: f.scope.userId,
          },
          {
            operationId: randomUUID(),
            role: 'OFFICE',
            aiLevel: 'BEGINNER',
            dailyMinutes: 10,
            confirmation: 'CONFIRM_MY_LEARNING_PROFILE',
            expectedAbsent: true,
          },
        );
        await client.learningDefinitionApproval.createMany({
          data: AI_TRAINING_LEARNING_DEFINITION_FIXTURES.map((d) => ({
            workspaceId: authority.workspaceId,
            groupId: authority.groupId,
            ...d.reference,
            approvalStatus: 'APPROVED',
            approvedAt: new Date(),
            approvedByUserId: f.owner.id,
          })),
        });
        return id;
      }
      return { ...f, authority, ops, admission, command, initialize, prepare, ready };
    }
    it('operations initialize only an empty reviewed Program and do not create runtime data', async () => {
      const f = await operationsFixture();
      const c = await f.command('INITIALIZE');
      expect(await f.ops.change(f.owner.id, c)).toMatchObject({
        status: 'SUSPENDED',
        enabled: false,
        drainStatus: 'UNKNOWN',
        replayed: false,
      });
      expect(await f.ops.change(f.owner.id, c)).toMatchObject({ replayed: true });
      expect(await client.programEnrollment.count({ where: f.authority })).toBe(0);
      expect(
        await client.learningDefinitionApproval.count({
          where: { workspaceId: f.scope.workspaceId },
        }),
      ).toBe(0);
      expect(await client.personalLearningPilotSeat.count({ where: f.authority })).toBe(0);
      await expect(
        f.ops.change(f.owner.id, {
          ...(await f.command('START')),
          expectedStateToken: '0'.repeat(64),
        }),
      ).rejects.toThrow('PILOT_STATE_CHANGED');
    });
    it('operations reject conversion of a legacy populated Program', async () => {
      const f = await fixture(false);
      const ops = new PrismaPersonalLearningPilotOperations(
        client,
        {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          serviceProgramId: f.enrollment.serviceProgramId,
        },
        () => {},
      );
      await expect(
        ops.change(f.owner.id, {
          action: 'INITIALIZE',
          operationId: randomUUID(),
          expectedStateToken: (await ops.read(f.owner.id)).stateToken,
          confirmation: 'CONFIRM_PILOT_OPERATION',
          reviewEvidenceKey: 'synthetic-review',
        }),
      ).rejects.toThrow('PILOT_EMPTY_DEDICATED_PROGRAM_REQUIRED');
      expect(
        (
          await client.serviceProgram.findUniqueOrThrow({
            where: { id: f.enrollment.serviceProgramId },
          })
        ).status,
      ).toBe('ACTIVE');
    });
    it('operations prepare idempotently without admitting a Seat and reject duplicate or foreign members', async () => {
      const f = await operationsFixture();
      await f.initialize();
      const c = await f.prepare();
      const first = await f.ops.change(f.owner.id, c);
      expect(await f.ops.change(f.owner.id, c)).toMatchObject({
        replayed: true,
        programEnrollmentId: first.programEnrollmentId,
      });
      await expect(f.ops.change(f.owner.id, await f.prepare())).rejects.toThrow(
        'PILOT_ENROLLMENT_ALREADY_EXISTS',
      );
      await expect(
        f.ops.change(f.owner.id, { ...(await f.prepare()), groupMembershipId: randomUUID() }),
      ).rejects.toThrow();
      expect(await client.programEnrollment.count({ where: f.authority })).toBe(1);
      expect(await client.personalLearningPilotSeat.count({ where: f.authority })).toBe(0);
      await expect(f.ops.change(f.scope.userId, await f.command('STOP'))).rejects.toThrow();
    });
    it('operations start and stop preserve data and cannot resurrect a superseded start', async () => {
      const f = await operationsFixture();
      const id = await f.ready();
      const start = await f.command('START');
      expect(await f.ops.change(f.owner.id, start)).toMatchObject({
        status: 'ACTIVE',
        enabled: true,
      });
      expect(await f.ops.change(f.owner.id, start)).toMatchObject({ replayed: true });
      const stop = { ...(await f.command('STOP')), expectedStateToken: '0'.repeat(64) };
      expect(await f.ops.change(f.owner.id, stop)).toMatchObject({
        status: 'SUSPENDED',
        enabled: false,
        drainStatus: 'UNKNOWN',
      });
      await expect(f.ops.change(f.owner.id, start)).rejects.toThrow('PILOT_OPERATION_SUPERSEDED');
      expect(await client.programEnrollment.count({ where: { ...f.authority, id } })).toBe(1);
      expect(await client.personalLearningPilotSeat.count({ where: f.authority })).toBe(1);
      expect(
        await client.trainingParticipantProfile.count({ where: { programEnrollmentId: id } }),
      ).toBe(1);
      expect(
        await client.programMissionAssignment.count({ where: { programEnrollmentId: id } }),
      ).toBe(0);
    });
    it('operations deny missing approvals, missing learner Profile evidence and missing Admission', async () => {
      const f = await operationsFixture();
      const id = await f.ready();
      await client.learningDefinitionApproval.updateMany({
        where: { workspaceId: f.scope.workspaceId },
        data: { approvalStatus: 'DEPRECATED' },
      });
      await expect(f.ops.change(f.owner.id, await f.command('START'))).rejects.toThrow(
        'PILOT_DEFINITION_APPROVAL_REQUIRED',
      );
      await client.learningDefinitionApproval.updateMany({
        where: { workspaceId: f.scope.workspaceId },
        data: { approvalStatus: 'APPROVED' },
      });
      await client.programActionEvent.deleteMany({
        where: {
          programEnrollmentId: id,
          eventType: 'PERSONAL_LEARNING_PILOT_PROFILE_INITIALIZED',
        },
      });
      await expect(f.ops.change(f.owner.id, await f.command('START'))).rejects.toThrow(
        'PILOT_PROFILE_REQUIRED',
      );
      const noAdmission = new PrismaPersonalLearningPilotOperations(client, f.authority, () => {});
      await expect(noAdmission.change(f.owner.id, await f.command('START'))).rejects.toThrow(
        'PILOT_WAVE0_CONFIGURATION_REQUIRED',
      );
    });
    it('operations serialize competing preparations without duplicate Enrollments', async () => {
      const f = await operationsFixture();
      await f.initialize();
      const c = await f.prepare();
      const results = await Promise.allSettled([
        f.ops.change(f.owner.id, c),
        f.ops.change(f.owner.id, { ...c, operationId: randomUUID() }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await client.programEnrollment.count({ where: f.authority })).toBe(1);
      const p = await client.serviceProgram.findUniqueOrThrow({
        where: { id: f.authority.serviceProgramId },
      });
      const settings = p.settings as Prisma.JsonObject;
      const pilot = settings.personalLearningPilot as Prisma.JsonObject;
      const policy = pilot.participantControl as Prisma.JsonObject;
      await client.serviceProgram.update({
        where: { id: p.id },
        data: {
          settings: {
            ...settings,
            personalLearningPilot: {
              ...pilot,
              participantControl: { ...policy, internalParticipantCap: 1 },
            },
          },
        },
      });
      await expect(f.ops.change(f.owner.id, await f.prepare())).rejects.toThrow(
        'PILOT_INTERNAL_PREPARATION_CAP_REACHED',
      );
    });
    it('operations reject disabled actors and cross-workspace authority', async () => {
      const f = await operationsFixture();
      const foreign = new PrismaPersonalLearningPilotOperations(
        client,
        { ...f.authority, workspaceId: randomUUID() },
        () => {},
      );
      await expect(foreign.read(f.owner.id)).rejects.toThrow();
      await client.user.update({ where: { id: f.owner.id }, data: { status: 'SUSPENDED' } });
      await expect(f.ops.read(f.owner.id)).rejects.toThrow();
      expect(
        (
          await client.serviceProgram.findUniqueOrThrow({
            where: { id: f.authority.serviceProgramId },
          })
        ).status,
      ).toBe('ACTIVE');
    });
    it('operations stop remains fail-closed with corrupt operation revision', async () => {
      const f = await operationsFixture();
      await f.ready();
      await f.ops.change(f.owner.id, await f.command('START'));
      const p = await client.serviceProgram.findUniqueOrThrow({
        where: { id: f.authority.serviceProgramId },
      });
      await client.serviceProgram.update({
        where: { id: p.id },
        data: {
          settings: {
            ...(p.settings as Prisma.JsonObject),
            personalLearningPilotOperations: { revision: 'corrupt' },
          },
        },
      });
      expect(await f.ops.change(f.owner.id, await f.command('STOP'))).toMatchObject({
        status: 'SUSPENDED',
        enabled: false,
      });
    });
    it('internal owner prepares their own Enrollment/Profile and remains a service owner through START/STOP', async () => {
      const f = await operationsFixture();
      await client.groupMembership.update({
        where: { id: f.member.id },
        data: { serviceRole: 'SERVICE_OWNER' },
      });
      // Same authenticated learner owns this service; no role downgrade or copied Profile.
      expect(await f.ops.read(f.scope.userId)).toMatchObject({ status: 'ACTIVE' });
      await f.ready();
      await f.ops.change(f.scope.userId, await f.command('START'));
      expect(await f.ops.read(f.scope.userId)).toMatchObject({ status: 'ACTIVE', enabled: true });
      await f.ops.change(f.scope.userId, await f.command('STOP'));
      expect(await f.ops.read(f.scope.userId)).toMatchObject({
        status: 'SUSPENDED',
        enabled: false,
      });
      expect(
        await client.groupMembership.findUniqueOrThrow({ where: { id: f.member.id } }),
      ).toMatchObject({ serviceRole: 'SERVICE_OWNER', status: 'ACTIVE' });
      expect(await client.personalLearningPilotSeat.findMany({ where: f.authority })).toMatchObject(
        [{ kind: 'INTERNAL', cohort: 'INTERNAL' }],
      );
    });
    async function profilePreparation() {
      const f = await fixture(false);
      await client.serviceProgram.update({
        where: { id: f.enrollment.serviceProgramId },
        data: {
          status: 'SUSPENDED',
          settings: {
            moduleKey: 'AI_TRAINING_V1',
            personalLearningPilot: { enabled: false, enrollmentIds: [f.enrollment.id] },
            trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
          },
        },
      });
      const repository = new PrismaPersonalLearningPilotProfileRepository(client, () => now);
      const scope = {
        workspaceId: f.scope.workspaceId,
        groupId: f.scope.groupId,
        programEnrollmentId: f.enrollment.id,
        actorUserId: f.scope.userId,
      };
      const command = {
        operationId: randomUUID(),
        role: 'OFFICE' as const,
        aiLevel: 'BEGINNER' as const,
        dailyMinutes: 10 as const,
        confirmation: 'CONFIRM_MY_LEARNING_PROFILE' as const,
        expectedAbsent: true as const,
      };
      return { ...f, repository, profileScope: scope, command };
    }
    async function capFixture(wave = 1) {
      const f = await profilePreparation();
      await client.serviceProgram.update({
        where: { id: f.enrollment.serviceProgramId },
        data: {
          settings: {
            moduleKey: 'AI_TRAINING_V1',
            personalLearningPilot: { enabled: false, enrollmentIds: [] },
            trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
          },
        },
      });
      const authority = {
        workspaceId: f.scope.workspaceId,
        groupId: f.scope.groupId,
        serviceProgramId: f.enrollment.serviceProgramId,
      };
      const admin = new PrismaPersonalLearningParticipantAdminRepository(client, authority);
      const common = {
        confirmation: 'CONFIRM_PILOT_PARTICIPANT_OPERATION' as const,
        reviewEvidenceKey: 'synthetic-human-review',
      };
      await admin.change(f.owner.id, {
        ...common,
        operationId: randomUUID(),
        expectedRevision: 0,
        action: 'CONFIGURE',
        externalParticipantCap: 100,
        internalParticipantCap: 0,
        currentWave: wave,
      });
      async function participant() {
        const u = await client.user.create({ data: { displayName: 'Synthetic cap participant' } });
        const m = await client.groupMembership.create({
          data: {
            workspaceId: authority.workspaceId,
            groupId: authority.groupId,
            userId: u.id,
            status: 'ACTIVE',
            serviceRole: 'PARTICIPANT',
            consentedAt: now,
          },
        });
        const e = await client.programEnrollment.create({
          data: {
            ...f.enrollment,
            goalSnapshot: {},
            offeringSnapshot: {},
            id: randomUUID(),
            groupMembershipId: m.id,
            startsAt: new Date(Date.now() - 86400000),
            endsAt: new Date(Date.now() + 86400000),
          },
        });
        return { u, m, e };
      }
      async function admit(id: string, expectedRevision: number) {
        return admin.change(f.owner.id, {
          ...common,
          operationId: randomUUID(),
          expectedRevision,
          action: 'ADMIT',
          programEnrollmentId: id,
          kind: 'EXTERNAL',
        });
      }
      return { ...f, authority, admin, common, participant, admit };
    }
    it('P1-H Wave 1 first/fifth seats, sixth rejection, idempotency and no automatic promotion', async () => {
      const f = await capFixture();
      const people = [];
      for (let i = 0; i < 6; i++) people.push(await f.participant());
      const command = {
        ...f.common,
        operationId: randomUUID(),
        expectedRevision: 1,
        action: 'ADMIT' as const,
        programEnrollmentId: people[0]!.e.id,
        kind: 'EXTERNAL' as const,
      };
      await f.admin.change(f.owner.id, command);
      expect((await f.admin.change(f.owner.id, command)).replayed).toBe(true);
      // A new operation for the same user is still one consumed seat.
      await f.admit(people[0]!.e.id, 2);
      for (let i = 1; i < 5; i++) await f.admit(people[i]!.e.id, i + 2);
      await expect(f.admit(people[5]!.e.id, 7)).rejects.toThrow('WAVE_CAP_REACHED');
      const state = await f.admin.read(f.owner.id);
      expect(state.seats).toHaveLength(5);
      expect(state.policy?.currentWave).toBe(1);
      await expect(
        client.serviceProgram.update({
          where: { id: f.authority.serviceProgramId },
          data: { settings: { moduleKey: 'AI_TRAINING_V1' } },
        }),
      ).rejects.toThrow();
    });
    it.each([
      [2, 20],
      [3, 50],
      [4, 100],
    ])(
      'P1-H Wave %i allows cumulative %i only',
      async (wave, limit) => {
        const f = await capFixture(wave);
        for (let i = 0; i < limit; i++) {
          const p = await f.participant();
          await f.admit(p.e.id, i + 1);
        }
        const extra = await f.participant();
        await expect(f.admit(extra.e.id, limit + 1)).rejects.toThrow(
          limit === 100 ? 'PILOT_CAP_REACHED' : 'WAVE_CAP_REACHED',
        );
        expect((await f.admin.read(f.owner.id)).seats).toHaveLength(limit);
      },
      30000,
    );
    it('P1-H simultaneous 100/101 registration has one winner and DB slots cannot exceed 100', async () => {
      const f = await capFixture(4);
      // Synthetic setup of 99 previously consumed slots; no production backfill.
      for (let i = 0; i < 99; i++) {
        const p = await f.participant();
        await f.admit(p.e.id, i + 1);
      }
      const a = await f.participant(),
        b = await f.participant();
      const results = await Promise.allSettled([f.admit(a.e.id, 100), f.admit(b.e.id, 100)]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect((await f.admin.read(f.owner.id)).seats).toHaveLength(100);
      await expect(
        client.personalLearningPilotSeat.create({
          data: {
            ...f.authority,
            participantHash: 'a'.repeat(64),
            programEnrollmentId: b.e.id,
            kind: 'EXTERNAL',
            cohort: 'WAVE_4',
            seatNumber: 101,
          },
        }),
      ).rejects.toThrow();
    }, 30000);
    it('P1-H revoked seat remains consumed and UI/Router/Assessment/Provider authorization rejects it', async () => {
      const f = await capFixture();
      const p = await f.participant();
      await f.admit(p.e.id, 1);
      await f.admin.change(f.owner.id, {
        ...f.common,
        operationId: randomUUID(),
        expectedRevision: 2,
        action: 'REVOKE',
        programEnrollmentId: p.e.id,
      });
      await expect(f.admit(p.e.id, 3)).rejects.toThrow('PARTICIPANT_REVOKED');
      expect((await f.admin.read(f.owner.id)).seats).toHaveLength(1);
      const actor = {
        scope: {
          ...f.scope,
          programEnrollmentId: p.e.id,
          groupMembershipId: p.m.id,
          userId: p.u.id,
        },
        actorUserId: p.u.id,
      };
      await client.serviceProgram.update({
        where: { id: f.authority.serviceProgramId },
        data: {
          status: 'ACTIVE',
          settings: {
            moduleKey: 'AI_TRAINING_V1',
            personalLearningPilot: {
              enabled: true,
              enrollmentIds: [p.e.id],
              participantControl: {
                version: 'PILOT_PARTICIPANT_CAP_V1',
                revision: 3,
                externalParticipantCap: 100,
                internalParticipantCap: 0,
                currentWave: 1,
                currentWaveCap: 5,
              },
            },
            trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
          },
        },
      });
      await expect(
        new PrismaPersonalLearningPilotRepository(client).authorizeAccess(actor, true),
      ).rejects.toThrow();
      await expect(
        new PrismaPersonalLearningPilotRouter(client).bridge({
          ...actor,
          planId: randomUUID(),
          expectedRevision: 1,
          idempotencyKey: 'revoked',
        }),
      ).rejects.toThrow();
      await expect(
        new PrismaPersonalLearningAssessmentGate(client).authorizeAssessment(
          actor,
          randomUUID(),
          randomUUID(),
        ),
      ).rejects.toThrow();
      await expect(
        client.$transaction((tx) => requirePersonalLearningPilotSeat(tx, actor.scope, true)),
      ).rejects.toThrow();
    });
    it('P1-H Wave changes are explicit CAS, absolute cap is fixed, internal unset and foreign authority denied', async () => {
      const f = await capFixture();
      const cfg = {
        ...f.common,
        operationId: randomUUID(),
        expectedRevision: 1,
        action: 'CONFIGURE' as const,
        externalParticipantCap: 100,
        internalParticipantCap: 0,
        currentWave: 2,
      };
      await expect(f.admin.change(f.scope.userId, cfg)).rejects.toThrow();
      await expect(
        f.admin.change(f.owner.id, { ...cfg, externalParticipantCap: 500 }),
      ).rejects.toThrow();
      await f.admin.change(f.owner.id, cfg);
      expect((await f.admin.read(f.owner.id)).policy?.currentWaveCap).toBe(20);
      await expect(
        f.admin.change(f.owner.id, { ...cfg, operationId: randomUUID() }),
      ).rejects.toThrow('PILOT_REVISION_CHANGED');
      await expect(
        new PrismaPersonalLearningParticipantAdminRepository(client, {
          ...f.authority,
          groupId: randomUUID(),
        }).read(f.owner.id),
      ).rejects.toThrow();
      await expect(
        new PrismaPersonalLearningParticipantAdminRepository(client, {
          ...f.authority,
          serviceProgramId: randomUUID(),
        }).read(f.owner.id),
      ).rejects.toThrow();
      const p = await f.participant();
      await expect(
        f.admin.change(f.owner.id, {
          ...f.common,
          operationId: randomUUID(),
          expectedRevision: 2,
          action: 'ADMIT',
          kind: 'INTERNAL',
          programEnrollmentId: p.e.id,
        }),
      ).rejects.toThrow();
      await client.serviceProgram.update({
        where: { id: f.authority.serviceProgramId },
        data: { status: 'ACTIVE' },
      });
      await expect(
        f.admin.change(f.owner.id, { ...cfg, expectedRevision: 2, operationId: randomUUID() }),
      ).rejects.toThrow();
    });
    it('P1-H explicitly reviewed internal slots are separate and finite', async () => {
      const f = await capFixture(0);
      await f.admin.change(f.owner.id, {
        ...f.common,
        operationId: randomUUID(),
        expectedRevision: 1,
        action: 'CONFIGURE',
        externalParticipantCap: 100,
        internalParticipantCap: 2,
        currentWave: 0,
      });
      for (let i = 0; i < 2; i++) {
        const p = await f.participant();
        await f.admin.change(f.owner.id, {
          ...f.common,
          operationId: randomUUID(),
          expectedRevision: i + 2,
          action: 'ADMIT',
          kind: 'INTERNAL',
          programEnrollmentId: p.e.id,
        });
      }
      const third = await f.participant();
      await expect(
        f.admin.change(f.owner.id, {
          ...f.common,
          operationId: randomUUID(),
          expectedRevision: 4,
          action: 'ADMIT',
          kind: 'INTERNAL',
          programEnrollmentId: third.e.id,
        }),
      ).rejects.toThrow();
      await expect(f.admit(third.e.id, 4)).rejects.toThrow();
      expect((await f.admin.read(f.owner.id)).seats.map((s) => s.cohort)).toEqual([
        'INTERNAL',
        'INTERNAL',
      ]);
    });
    it('P1-H ALL deletion revokes/redacts the seat without recycling capacity or blocking other seats', async () => {
      const f = await capFixture();
      const p = await f.participant();
      const q = await f.participant();
      await f.admit(p.e.id, 1);
      await f.admit(q.e.id, 2);
      const input = {
        workspaceId: f.scope.workspaceId,
        groupId: f.scope.groupId,
        programEnrollmentId: p.e.id,
        actorUserId: p.u.id,
        target: { kind: 'ALL' as const },
      };
      const repo = new PrismaTrainingPersonalDataDeletionRepository(client);
      const preview = await repo.preview(input);
      expect(preview.outcome).toBe('PREVIEW');
      if (preview.outcome !== 'PREVIEW') throw new Error('missing deletion preview');
      expect(
        (await repo.delete({ ...input, revision: preview.preview.revision, now: new Date() }))
          .outcome,
      ).toBe('DELETED');
      const state = await f.admin.read(f.owner.id);
      expect(state.seats).toHaveLength(2);
      expect(state.seats.filter((s) => s.revokedAt)).toMatchObject([{ programEnrollmentId: null }]);
      const program = await client.serviceProgram.findUniqueOrThrow({
        where: { id: f.authority.serviceProgramId },
      });
      expect(
        (program.settings as { personalLearningPilot: { enrollmentIds: string[] } })
          .personalLearningPilot.enrollmentIds,
      ).toEqual([q.e.id]);
      const exported = await new PrismaTrainingPersonalDataExportRepository(client).read({
        ...input,
        programEnrollmentId: q.e.id,
        actorUserId: q.u.id,
      });
      expect(exported.outcome).toBe('FOUND');
      if (exported.outcome === 'FOUND')
        expect(exported.data.personalLearning).toMatchObject([
          { kind: 'PILOT_SEAT', cohort: 'WAVE_1' },
        ]);
    });
    it('P1-H physical Enrollment deletion redacts the seat without reducing the cumulative count', async () => {
      const f = await capFixture();
      const p = await f.participant();
      await f.admit(p.e.id, 1);
      await client.programEnrollment.delete({ where: { id: p.e.id } });
      const state = await f.admin.read(f.owner.id);
      expect(state.seats).toHaveLength(1);
      expect(state.seats[0]?.programEnrollmentId).toBeNull();
      expect(state.seats[0]?.revokedAt).not.toBeNull();
    });
    it('production preparation pins Program and retains human approval/profile ownership and retry authorization', async () => {
      const f = await profilePreparation();
      const authority = {
        workspaceId: f.scope.workspaceId,
        groupId: f.scope.groupId,
        serviceProgramId: f.enrollment.serviceProgramId,
      };
      const profile = new PrismaPersonalLearningPilotProfileRepository(
        client,
        () => now,
        authority,
      );
      const admin = new PrismaLearningDefinitionApprovalAdminRepository(
        client,
        () => now,
        authority,
      );
      const adminScope = {
        workspaceId: f.scope.workspaceId,
        groupId: f.scope.groupId,
        actorUserId: f.owner.id,
      };
      const first = (await admin.list(adminScope))[0]!;
      expect(first.current).toBeNull();
      expect(
        await client.programAuditLog.count({
          where: { action: 'LEARNING_DEFINITION_APPROVAL_CHANGED' },
        }),
      ).toBe(0);
      const command = {
        operationId: randomUUID(),
        action: 'APPROVE' as const,
        confirmation: 'CONFIRM_DEFINITION_APPROVAL' as const,
        definitionKey: first.definition.reference.definitionKey,
        version: first.definition.reference.version,
        expectedRevision: first.revision,
        reviewDigest: first.reviewDigest,
        reviewedCommitSha: 'a'.repeat(40),
        reviewEvidenceKey: 'synthetic-production-review',
        reviewChecklist: {
          objective: true as const,
          prerequisites: true as const,
          concepts: true as const,
          safety: true as const,
          mistakes: true as const,
          practice: true as const,
          rubricAndMission: true as const,
        },
      };
      await admin.change(adminScope, command);
      await expect(admin.change(adminScope, command)).resolves.toMatchObject({ replayed: true });
      await expect(
        profile.initialize({ ...f.profileScope, actorUserId: f.owner.id }, f.command),
      ).rejects.toThrow();
      await profile.initialize(f.profileScope, f.command);
      expect(await client.programMemberGoal.count()).toBe(0);
      expect(await client.programMissionAssignment.count()).toBe(0);
      await client.serviceProgram.update({
        where: { id: authority.serviceProgramId },
        data: { status: 'ACTIVE' },
      });
      await expect(admin.change(adminScope, command)).rejects.toThrow();
      await expect(profile.initialize(f.profileScope, f.command)).rejects.toThrow();
    });
    it('production preparation rejects different authority, notification enablement and foreign allowlist', async () => {
      const f = await profilePreparation();
      const authority = {
        workspaceId: f.scope.workspaceId,
        groupId: f.scope.groupId,
        serviceProgramId: f.enrollment.serviceProgramId,
      };
      for (const invalid of [
        { ...authority, workspaceId: randomUUID() },
        { ...authority, groupId: randomUUID() },
        { ...authority, serviceProgramId: randomUUID() },
      ]) {
        const repo = new PrismaPersonalLearningPilotProfileRepository(client, () => now, invalid);
        await expect(repo.initialize(f.profileScope, f.command)).rejects.toThrow();
      }
      const repo = new PrismaPersonalLearningPilotProfileRepository(client, () => now, authority);
      for (const settings of [
        {
          moduleKey: 'AI_TRAINING_V1',
          personalLearningPilot: { enabled: true, enrollmentIds: [f.enrollment.id] },
          trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
        },
        {
          moduleKey: 'AI_TRAINING_V1',
          personalLearningPilot: { enabled: false, enrollmentIds: [f.enrollment.id] },
          trainingOperations: { notificationsEnabled: true, postponedReminderEnabled: false },
        },
        {
          moduleKey: 'AI_TRAINING_V1',
          personalLearningPilot: { enabled: false, enrollmentIds: [f.enrollment.id, randomUUID()] },
          trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
        },
      ]) {
        await client.serviceProgram.update({
          where: { id: authority.serviceProgramId },
          data: { settings },
        });
        await expect(repo.initialize(f.profileScope, f.command)).rejects.toThrow();
      }
      expect(await client.trainingParticipantProfile.count()).toBe(0);
    });
    it('production preparation refuses a shared Service with another AI Training Program', async () => {
      const f = await profilePreparation();
      const program = await client.serviceProgram.findUniqueOrThrow({
        where: { id: f.enrollment.serviceProgramId },
      });
      await client.serviceProgram.create({
        data: {
          ...program,
          id: randomUUID(),
          displayName: 'Synthetic existing V1',
          settings: { moduleKey: 'AI_TRAINING_V1' },
          status: 'ACTIVE',
        },
      });
      const authority = {
        workspaceId: f.scope.workspaceId,
        groupId: f.scope.groupId,
        serviceProgramId: program.id,
      };
      const admin = new PrismaLearningDefinitionApprovalAdminRepository(
        client,
        () => now,
        authority,
      );
      await expect(
        admin.list({
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          actorUserId: f.owner.id,
        }),
      ).rejects.toThrow();
      const profile = new PrismaPersonalLearningPilotProfileRepository(
        client,
        () => now,
        authority,
      );
      await expect(profile.initialize(f.profileScope, f.command)).rejects.toThrow();
      expect(
        await client.learningDefinitionApproval.count({
          where: { workspaceId: f.scope.workspaceId, groupId: f.scope.groupId },
        }),
      ).toBe(0);
      expect(await client.trainingParticipantProfile.count()).toBe(0);
    });
    it('Profile preparation: restore, immutable retry, no Goal or Assignment and no content', async () => {
      const f = await profilePreparation();
      expect(await f.repository.read(f.profileScope)).toEqual({ profile: null });
      const first = await f.repository.initialize(f.profileScope, f.command);
      expect(first.outcome).toBe('INITIALIZED');
      expect(await f.repository.read(f.profileScope)).toEqual({ profile: first.profile });
      expect((await f.repository.initialize(f.profileScope, f.command)).outcome).toBe(
        'ALREADY_INITIALIZED',
      );
      await expect(
        f.repository.initialize(f.profileScope, { ...f.command, dailyMinutes: 15 }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(
        f.repository.initialize(f.profileScope, { ...f.command, operationId: randomUUID() }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      const profile = await client.trainingParticipantProfile.findUniqueOrThrow({
        where: { programEnrollmentId: f.enrollment.id },
      });
      expect(profile.learningGoalKey).toBeNull();
      expect(profile.workContext).toEqual({});
      expect(profile.skillScores).toEqual({});
      expect(await client.programMemberGoal.count()).toBe(0);
      expect(await client.programMissionAssignment.count()).toBe(0);
      expect(await client.programActionEvent.count()).toBe(1);
    });
    it('Profile preparation: concurrent absence CAS creates one profile and event', async () => {
      const f = await profilePreparation();
      const results = await Promise.allSettled([
        f.repository.initialize(f.profileScope, f.command),
        f.repository.initialize(f.profileScope, { ...f.command, operationId: randomUUID() }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await client.trainingParticipantProfile.count()).toBe(1);
      expect(await client.programActionEvent.count()).toBe(1);
    });
    it('Profile preparation: cross scope and lost membership rejected even on replay', async () => {
      const f = await profilePreparation();
      await f.repository.initialize(f.profileScope, f.command);
      for (const key of ['workspaceId', 'groupId', 'programEnrollmentId', 'actorUserId'] as const) {
        await expect(
          f.repository.read({ ...f.profileScope, [key]: randomUUID() }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      }
      await client.groupMembership.update({
        where: { id: f.member.id },
        data: { status: 'REVOKED', revokedAt: now },
      });
      await expect(f.repository.initialize(f.profileScope, f.command)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
    it('Profile preparation: active Program and expired enrollment cannot initialize', async () => {
      const f = await profilePreparation();
      await client.serviceProgram.update({
        where: { id: f.enrollment.serviceProgramId },
        data: { status: 'ACTIVE' },
      });
      await expect(f.repository.initialize(f.profileScope, f.command)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await client.serviceProgram.update({
        where: { id: f.enrollment.serviceProgramId },
        data: { status: 'SUSPENDED' },
      });
      await client.programEnrollment.update({
        where: { id: f.enrollment.id },
        data: { endsAt: now },
      });
      await expect(f.repository.initialize(f.profileScope, f.command)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(await client.trainingParticipantProfile.count()).toBe(0);
    });
    it('Profile preparation: deletion tombstone prevents recreation and replay', async () => {
      const f = await profilePreparation();
      await f.repository.initialize(f.profileScope, f.command);
      await client.trainingParticipantProfile.deleteMany({
        where: { programEnrollmentId: f.enrollment.id },
      });
      await client.programAuditLog.create({
        data: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          resourceType: 'PROGRAM_ENROLLMENT',
          resourceId: f.enrollment.id,
          action: 'TRAINING_PERSONAL_DATA_DELETED',
          performedByUserId: f.scope.userId,
          afterData: { kind: 'ALL' },
        },
      });
      await expect(f.repository.initialize(f.profileScope, f.command)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await expect(
        f.repository.initialize(f.profileScope, { ...f.command, operationId: randomUUID() }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(await client.trainingParticipantProfile.count()).toBe(0);
    });
    it('Definition admin: human review, immutable retry, CAS, withdrawal and reapproval audit', async () => {
      const f = await fixture(false);
      const repository = new PrismaLearningDefinitionApprovalAdminRepository(client, () => now);
      const scope = {
        workspaceId: f.scope.workspaceId,
        groupId: f.scope.groupId,
        actorUserId: f.owner.id,
      };
      const first = (await repository.list(scope))[0]!;
      expect(first.current).toBeNull();
      const command = {
        operationId: randomUUID(),
        action: 'APPROVE' as const,
        confirmation: 'CONFIRM_DEFINITION_APPROVAL' as const,
        definitionKey: first.definition.reference.definitionKey,
        version: first.definition.reference.version,
        expectedRevision: first.revision,
        reviewDigest: first.reviewDigest,
        reviewedCommitSha: 'a'.repeat(40),
        reviewEvidenceKey: 'synthetic-review',
        reviewChecklist: {
          objective: true as const,
          prerequisites: true as const,
          concepts: true as const,
          safety: true as const,
          mistakes: true as const,
          practice: true as const,
          rubricAndMission: true as const,
        },
      };
      await expect(
        repository.change(scope, { ...command, reviewDigest: 'b'.repeat(64) }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(
        repository.change(scope, { ...command, version: 'UNKNOWN' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      const receipt = await repository.change(scope, command);
      expect(receipt.stateAtOperation).toMatchObject({
        approvalStatus: 'APPROVED',
        approvedAt: now.toISOString(),
        approvedByUserId: f.owner.id,
      });
      expect((await repository.change(scope, command)).replayed).toBe(true);
      await expect(
        repository.change(scope, { ...command, reviewEvidenceKey: 'different' }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(
        repository.change(scope, { ...command, operationId: randomUUID() }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      const current = (await repository.list(scope))[0]!;
      const { reviewChecklist, ...fields } = command;
      expect(reviewChecklist.safety).toBe(true);
      await repository.change(scope, {
        ...fields,
        operationId: randomUUID(),
        action: 'DEPRECATE',
        confirmation: 'CONFIRM_DEFINITION_WITHDRAWAL',
        expectedRevision: current.revision,
      });
      const withdrawn = (await repository.list(scope))[0]!;
      expect(withdrawn.current).toMatchObject({
        approvalStatus: 'DEPRECATED',
        approvedAt: now.toISOString(),
        approvedByUserId: f.owner.id,
      });
      // A replay returns the historical receipt, never restores the current approval.
      expect((await repository.change(scope, command)).replayed).toBe(true);
      expect((await repository.list(scope))[0]!.current?.approvalStatus).toBe('DEPRECATED');
      await repository.change(scope, {
        ...command,
        operationId: randomUUID(),
        expectedRevision: withdrawn.revision,
      });
      const renewed = (await repository.list(scope))[0]!;
      expect(renewed.revision).not.toBe(current.revision); // identical millisecond/state is not an ABA match
      expect(
        await client.programAuditLog.count({
          where: {
            workspaceId: scope.workspaceId,
            groupId: scope.groupId,
            action: 'LEARNING_DEFINITION_APPROVAL_CHANGED',
          },
        }),
      ).toBe(3);
      await expect(
        repository.list({ ...scope, actorUserId: f.scope.userId }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(repository.list({ ...scope, workspaceId: randomUUID() })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(repository.list({ ...scope, groupId: randomUUID() })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await client.groupMembership.updateMany({
        where: { workspaceId: scope.workspaceId, groupId: scope.groupId, userId: f.owner.id },
        data: { status: 'REVOKED', revokedAt: now },
      });
      await expect(repository.change(scope, command)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
    it('Definition admin: concurrent first approvals create only one state/audit', async () => {
      const f = await fixture(false);
      const repository = new PrismaLearningDefinitionApprovalAdminRepository(client, () => now);
      const scope = {
        workspaceId: f.scope.workspaceId,
        groupId: f.scope.groupId,
        actorUserId: f.owner.id,
      };
      const first = (await repository.list(scope))[0]!;
      const command = {
        action: 'APPROVE' as const,
        confirmation: 'CONFIRM_DEFINITION_APPROVAL' as const,
        definitionKey: first.definition.reference.definitionKey,
        version: first.definition.reference.version,
        expectedRevision: first.revision,
        reviewDigest: first.reviewDigest,
        reviewedCommitSha: 'a'.repeat(40),
        reviewEvidenceKey: 'synthetic-review',
        reviewChecklist: {
          objective: true as const,
          prerequisites: true as const,
          concepts: true as const,
          safety: true as const,
          mistakes: true as const,
          practice: true as const,
          rubricAndMission: true as const,
        },
      };
      const results = await Promise.allSettled([
        repository.change(scope, { ...command, operationId: randomUUID() }),
        repository.change(scope, { ...command, operationId: randomUUID() }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        await client.programAuditLog.count({
          where: {
            workspaceId: scope.workspaceId,
            groupId: scope.groupId,
            action: 'LEARNING_DEFINITION_APPROVAL_CHANGED',
          },
        }),
      ).toBe(1);
    });
    async function routerFixture() {
      const f = await fixture();
      const plan = await f.plan();
      await f.repo.savePlan({ ...f.actor, plan, expectedRevision: 0, idempotencyKey: 'plan' });
      await f.repo.confirmPlan({
        ...f.actor,
        planId: plan.planId,
        expectedRevision: 1,
        idempotencyKey: 'plan-confirm',
      });
      const program = await client.serviceProgram.findUniqueOrThrow({
        where: { id: f.enrollment.serviceProgramId },
      });
      await client.programTemplateVersion.update({
        where: { id: program.programTemplateVersionId },
        data: {
          definition: JSON.parse(
            JSON.stringify(createAiTrainingV1Definition()),
          ) as Prisma.InputJsonValue,
        },
      });
      await client.trainingParticipantProfile.create({
        data: { ...f.scope, role: 'OTHER', aiLevel: 'BEGINNER', updatedByUserId: f.scope.userId },
      });
      const bridge = new PrismaPersonalLearningRouterBridge(client, () => now);
      const request = {
        ...f.actor,
        planId: plan.planId,
        expectedRevision: 1,
        idempotencyKey: 'bridge-1',
      };
      await client.programEnrollment.update({
        where: { id: f.enrollment.id },
        data: {
          startsAt: new Date(Math.min(Date.now(), now.getTime()) - 86400000),
          endsAt: new Date(Math.max(Date.now(), now.getTime()) + 86400000),
        },
      });
      // Persist the exact existing Assessment handler format without invoking its paid Provider.
      async function assessed(assignmentId: string, result: 'PASS' | 'REVIEW' = 'PASS') {
        const assignment = await client.programMissionAssignment.findUniqueOrThrow({
          where: { id: assignmentId },
        });
        const quality = getAiTrainingMissionQuality(
          assignment.missionDefinitionKey === 'PROMPT_BASIC' ? 'PROMPT_BASIC' : 'PROMPT_CONDITION',
        )!;
        const evaluation = {
          result,
          understanding: 80,
          skills: {
            promptStructure: result === 'REVIEW' ? 40 : 80,
            contextSetting: 80,
            constraintSetting: 80,
          },
          evaluatedSkillKeys: quality.skillKeys,
          evaluationRuleVersion: AI_TRAINING_SKILL_RULE_VERSION,
        };
        const submission = await new PrismaTrainingAnswerRepository(client).submit({
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          programEnrollmentId: f.enrollment.id,
          actorUserId: f.scope.userId,
          missionAssignmentId: assignmentId,
          answer: 'Synthetic learner practice',
          idempotencyKey: `submission-${assignmentId}`,
          occurredAt: now,
        });
        if (submission.outcome !== 'SUBMITTED')
          throw new Error('existing answer runtime rejected bridge');
        const started = await client.programMissionAssignment.findUniqueOrThrow({
          where: { id: assignmentId },
        });
        expect(started.status).toBe('STARTED');
        expect(started.startedAt).toEqual(now);
        const answer = await client.trainingMissionAnswer.update({
          where: { id: submission.answer.id },
          data: { evaluationStatus: 'READY', evaluation, evaluatedAt: now },
        });
        await client.programActionEvent.create({
          data: {
            workspaceId: f.scope.workspaceId,
            groupId: f.scope.groupId,
            programEnrollmentId: f.enrollment.id,
            missionAssignmentId: assignmentId,
            actorUserId: f.scope.userId,
            eventType: 'ANSWER_EVALUATED',
            sourceResourceType: 'TRAINING_MISSION_ANSWER',
            sourceResourceId: answer.id,
            idempotencyKey: `training-evaluation:${answer.id}:evaluated`,
            metadata: evaluation,
            occurredAt: now,
          },
        });
        await client.programMissionAssignment.update({
          where: { id: assignmentId },
          data:
            result === 'PASS'
              ? { status: 'COMPLETED', startedAt: now, completedAt: now }
              : { status: 'SKIPPED', skippedAt: now },
        });
        return answer;
      }
      return { ...f, plan, bridge, request, assessed };
    }
    it('internal owner completes the existing saved three-Definition path without entering legacy V1', async () => {
      const f = await routerFixture();
      await client.groupMembership.update({
        where: { id: f.member.id },
        data: { serviceRole: 'SERVICE_OWNER' },
      });
      // Existing role alone grants no learner access, even through the bare persistence port.
      await expect(f.repo.read(f.actor)).rejects.toThrow();
      const authority = {
        workspaceId: f.scope.workspaceId,
        groupId: f.scope.groupId,
        serviceProgramId: f.enrollment.serviceProgramId,
      };
      await client.serviceProgram.update({
        where: { id: authority.serviceProgramId },
        data: {
          status: 'SUSPENDED',
          settings: {
            moduleKey: 'AI_TRAINING_V1',
            personalLearningPilot: { enabled: false, enrollmentIds: [] },
            trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
          },
        },
      });
      const seats = new PrismaPersonalLearningParticipantAdminRepository(client, authority);
      const common = {
        operationId: randomUUID(),
        confirmation: 'CONFIRM_PILOT_PARTICIPANT_OPERATION' as const,
        reviewEvidenceKey: 'synthetic-owner-test',
      };
      await seats.change(f.scope.userId, {
        ...common,
        action: 'CONFIGURE',
        expectedRevision: 0,
        externalParticipantCap: 100,
        internalParticipantCap: 1,
        currentWave: 0,
      });
      await expect(
        seats.change(f.scope.userId, {
          ...common,
          operationId: randomUUID(),
          action: 'ADMIT',
          expectedRevision: 1,
          programEnrollmentId: f.enrollment.id,
          kind: 'EXTERNAL',
        }),
      ).rejects.toThrow();
      await seats.change(f.scope.userId, {
        ...common,
        operationId: randomUUID(),
        action: 'ADMIT',
        expectedRevision: 1,
        programEnrollmentId: f.enrollment.id,
        kind: 'INTERNAL',
      });
      const p = await client.serviceProgram.findUniqueOrThrow({
        where: { id: authority.serviceProgramId },
      });
      const settings = p.settings as Prisma.JsonObject;
      await client.serviceProgram.update({
        where: { id: p.id },
        data: {
          status: 'ACTIVE',
          settings: {
            ...settings,
            personalLearningPilot: {
              ...(settings.personalLearningPilot as Prisma.JsonObject),
              enabled: true,
            },
          },
        },
      });
      const pilot = new PrismaPersonalLearningPilotRepository(client, () => now);
      const router = new PrismaPersonalLearningPilotRouter(client, () => now);
      expect((await pilot.read(f.actor)).plans[0]?.plan.status).toBe('CONFIRMED');
      await expect(pilot.read({ ...f.actor, actorUserId: f.owner.id })).rejects.toThrow();
      await expect(
        pilot.read({ ...f.actor, scope: { ...f.scope, workspaceId: randomUUID() } }),
      ).rejects.toThrow();
      for (const [index, definition] of AI_TRAINING_LEARNING_DEFINITION_FIXTURES.entries()) {
        const receipt = await router.bridge({ ...f.request, idempotencyKey: `owner-${index}` });
        expect(receipt.result.definition).toEqual(definition.reference);
        await f.assessed(receipt.assignmentId!);
      }
      expect(
        (await router.bridge({ ...f.request, idempotencyKey: 'owner-completed' })).result.status,
      ).toBe('PLAN_COMPLETED');
      expect(
        await new PrismaAiTrainingRuntimeStateRepository(client).findState({
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          programEnrollmentId: f.enrollment.id,
          actorUserId: f.scope.userId,
          now,
        }),
      ).toBeNull();
      await client.personalLearningPilotSeat.updateMany({
        where: authority,
        data: { revokedAt: new Date() },
      });
      await expect(pilot.read(f.actor)).rejects.toThrow();
      expect(
        await client.groupMembership.findUniqueOrThrow({ where: { id: f.member.id } }),
      ).toMatchObject({ serviceRole: 'SERVICE_OWNER' });
      expect(
        await client.programEnrollment.findUniqueOrThrow({ where: { id: f.enrollment.id } }),
      ).toMatchObject({ status: 'ACTIVE' });
    });
    async function practiceFixture() {
      const f = await routerFixture();
      await client.serviceProgram.update({
        where: { id: f.enrollment.serviceProgramId },
        data: {
          settings: {
            moduleKey: 'AI_TRAINING_V1',
            personalLearningPilot: { enabled: true, enrollmentIds: [f.enrollment.id] },
            trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
          },
        },
      });
      const selected = await f.bridge.bridge(f.request);
      const practice = new PrismaGuidedPracticeRepository(client, () => now);
      const assignmentId = selected.assignmentId!;
      const start = () =>
        practice.recordPractice(f.actor, assignmentId, {
          action: 'START',
          supportLevel: 'INDEPENDENT',
        });
      const interact = async () => {
        await practice.recordPractice(f.actor, assignmentId, {
          action: 'INTERACT',
          interaction: 'SELF_PROMPTED',
        });
        await practice.recordPractice(f.actor, assignmentId, {
          action: 'INTERACT',
          interaction: 'SELF_EVALUATED',
        });
      };
      const complete = () =>
        practice.recordPractice(f.actor, assignmentId, {
          action: 'COMPLETE',
          learnerConfirmedCompletion: true,
          usefulResult: true,
        });
      return { ...f, practice, assignmentId, start, interact, complete };
    }
    async function admissionFixture() {
      const f = await practiceFixture();
      const submitted = await new PrismaTrainingAnswerRepository(client).submit({
        workspaceId: f.scope.workspaceId,
        groupId: f.scope.groupId,
        programEnrollmentId: f.enrollment.id,
        actorUserId: f.scope.userId,
        missionAssignmentId: f.assignmentId,
        answer: 'Synthetic admission answer',
        idempotencyKey: randomUUID(),
        occurredAt: now,
      });
      if (submitted.outcome !== 'SUBMITTED') throw new Error('synthetic submission failed');
      const answer = await client.trainingMissionAnswer.findFirstOrThrow({
        where: { missionAssignmentId: f.assignmentId },
      });
      const policy = {
        workspaceId: f.scope.workspaceId,
        groupId: f.scope.groupId,
        serviceProgramId: f.enrollment.serviceProgramId,
        dailyAttemptLimit: 2,
        maxConcurrent: 1,
        model: 'synthetic',
        maxRequestBytes: 10000,
        maxOutputTokens: 100,
      };
      const repo = new PrismaPersonalLearningCallAdmission(client, () => now);
      const job = () =>
        client.job.create({
          data: {
            environment: 'STAGING',
            workspaceId: f.scope.workspaceId,
            jobType: 'TRAINING_ANSWER_EVALUATE',
            payloadReference: `training-evaluation:${f.scope.groupId}:${f.enrollment.id}:${answer.id}:${f.scope.userId}`,
            idempotencyKey: randomUUID(),
            correlationId: randomUUID(),
            requestedBy: f.scope.userId,
            status: 'LEASED',
            attemptCount: 1,
            leaseOwner: 'synthetic-worker',
            leaseExpiresAt: new Date(Date.now() + 600000),
          },
        });
      const request = async () => ({
        actor: f.actor,
        assignmentId: f.assignmentId,
        answerId: answer.id,
        jobId: (await job()).id,
        attemptCount: 1,
        environment: 'STAGING' as const,
        model: 'synthetic',
        policy,
      });
      return { ...f, answer, policy, repo, request };
    }
    it('call admission counts failures, rejects replay and enforces daily limits without body storage', async () => {
      const f = await admissionFixture();
      const request = await f.request();
      const first = await f.repo.admit(request);
      await expect(f.repo.admit(request)).rejects.toThrow();
      await f.repo.settle(first);
      const second = await f.repo.admit(await f.request());
      await f.repo.settle(second);
      await expect(f.repo.admit(await f.request())).rejects.toThrow();
      const rows = await client.personalLearningCallAdmission.findMany();
      expect(rows).toHaveLength(2);
      expect(JSON.stringify(rows)).not.toContain('Synthetic admission answer');
      expect(rows[0]).not.toHaveProperty('userId');
      await client.trainingMissionAnswer.delete({ where: { id: f.answer.id } });
      expect(await client.personalLearningCallAdmission.count()).toBe(2);
    });
    it('P1-H Production admission requires a live seat, accepts admitted participant and denies revocation', async () => {
      const f = await admissionFixture();
      const request = { ...(await f.request()), environment: 'PRODUCTION' as const };
      await client.job.update({
        where: { id: request.jobId },
        data: { environment: 'PRODUCTION' },
      });
      await expect(f.repo.admit(request)).rejects.toThrow();
      await client.serviceProgram.update({
        where: { id: f.enrollment.serviceProgramId },
        data: {
          settings: {
            moduleKey: 'AI_TRAINING_V1',
            personalLearningPilot: {
              enabled: true,
              enrollmentIds: [f.enrollment.id],
              participantControl: {
                version: 'PILOT_PARTICIPANT_CAP_V1',
                revision: 1,
                externalParticipantCap: 100,
                internalParticipantCap: 0,
                currentWave: 1,
                currentWaveCap: 5,
              },
            },
            trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
          },
        },
      });
      await expect(f.repo.admit(request)).rejects.toThrow();
      const seat = await client.personalLearningPilotSeat.create({
        data: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          serviceProgramId: f.enrollment.serviceProgramId,
          participantHash: pilotParticipantHash(f.enrollment.serviceProgramId, f.scope.userId),
          programEnrollmentId: f.enrollment.id,
          kind: 'EXTERNAL',
          cohort: 'WAVE_1',
          seatNumber: 1,
        },
      });
      const permit = await f.repo.admit(request);
      await f.repo.settle(permit);
      await client.personalLearningPilotSeat.update({
        where: { id: seat.id },
        data: { revokedAt: new Date() },
      });
      await expect(f.repo.admit({ ...request, jobId: randomUUID() })).rejects.toThrow();
      expect(await client.personalLearningCallAdmission.count()).toBe(1);
    });
    it('parallel workers never admit more than one open call; unknown slots survive midnight', async () => {
      const f = await admissionFixture();
      const requests = await Promise.all([f.request(), f.request()]);
      const results = await Promise.allSettled(requests.map((r) => f.repo.admit(r)));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const permit = await client.personalLearningCallAdmission.findFirstOrThrow();
      await client.personalLearningCallAdmission.update({
        where: { id: permit.id },
        data: { admittedAt: new Date(Date.now() - 86400000) },
      });
      await expect(f.repo.admit(await f.request())).rejects.toThrow();
      await f.repo.settle(permit);
      await expect(f.repo.admit(await f.request())).resolves.toBeTruthy();
    });
    it('admission revalidates actor, configured Program, live job lease and approval', async () => {
      const f = await admissionFixture();
      const request = await f.request();
      for (const change of [
        { actor: { ...f.actor, actorUserId: f.owner.id } },
        { actor: { ...f.actor, scope: { ...f.scope, programEnrollmentId: randomUUID() } } },
        { policy: { ...f.policy, workspaceId: randomUUID() } },
        { policy: { ...f.policy, serviceProgramId: randomUUID() } },
        { model: 'different' },
        { attemptCount: 2 },
        { environment: 'PRODUCTION' as const },
      ])
        await expect(f.repo.admit({ ...request, ...change })).rejects.toThrow();
      await client.job.update({
        where: { id: request.jobId },
        data: { leaseExpiresAt: new Date(0) },
      });
      await expect(f.repo.admit(request)).rejects.toThrow();
      const fresh = await f.request();
      await client.learningDefinitionApproval.updateMany({
        where: { workspaceId: f.scope.workspaceId },
        data: { approvalStatus: 'DEPRECATED' },
      });
      await expect(f.repo.admit(fresh)).rejects.toThrow();
      expect(await client.personalLearningCallAdmission.count()).toBe(0);
    });
    it('the Program cap is shared across different learners and enrollment locks', async () => {
      const f = await admissionFixture();
      const user = await client.user.create({ data: { displayName: 'Synthetic second learner' } });
      const member = await client.groupMembership.create({
        data: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          userId: user.id,
          serviceRole: 'PARTICIPANT',
          status: 'ACTIVE',
          consentedAt: now,
        },
      });
      const enrollment = await client.programEnrollment.create({
        data: {
          ...(await client.programEnrollment.findUniqueOrThrow({ where: { id: f.enrollment.id } })),
          id: randomUUID(),
          groupMembershipId: member.id,
          goalSnapshot: {},
          offeringSnapshot: {},
        },
      });
      const scope = {
        ...f.scope,
        programEnrollmentId: enrollment.id,
        groupMembershipId: member.id,
        userId: user.id,
      };
      const originalGoal = await client.programMemberGoal.findFirstOrThrow({
        where: { programEnrollmentId: f.enrollment.id, status: 'ACTIVE' },
      });
      const goal = await client.programMemberGoal.create({
        data: {
          ...originalGoal,
          id: randomUUID(),
          programEnrollmentId: enrollment.id,
          groupMembershipId: member.id,
          createdByUserId: user.id,
          updatedByUserId: user.id,
        },
      });
      const confirmation = await client.personalLearningGoalConfirmation.findUniqueOrThrow({
        where: { programMemberGoalId: originalGoal.id },
      });
      await client.personalLearningGoalConfirmation.create({
        data: { ...confirmation, ...scope, programMemberGoalId: goal.id },
      });
      const originalPlan = await client.personalLearningPlanRevision.findUniqueOrThrow({
        where: { planId_revision: { planId: f.plan.planId, revision: 1 } },
      });
      const plan = await client.personalLearningPlanRevision.create({
        data: {
          ...originalPlan,
          ...scope,
          planId: randomUUID(),
          programMemberGoalId: goal.id,
          steps: originalPlan.steps as Prisma.InputJsonValue,
        },
      });
      const originalAssignment = await client.programMissionAssignment.findUniqueOrThrow({
        where: { id: f.assignmentId },
      });
      const display = originalAssignment.displaySnapshot as Prisma.JsonObject;
      const assignment = await client.programMissionAssignment.create({
        data: {
          ...originalAssignment,
          id: randomUUID(),
          programEnrollmentId: enrollment.id,
          targetResourceId: plan.planId,
          displaySnapshot: {
            ...display,
            personalLearning: {
              ...(display.personalLearning as Prisma.JsonObject),
              planId: plan.planId,
            },
          },
        },
      });
      const answer = await client.trainingMissionAnswer.create({
        data: {
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          programEnrollmentId: enrollment.id,
          missionAssignmentId: assignment.id,
          userId: user.id,
          answer: 'Synthetic second answer',
        },
      });
      await client.serviceProgram.update({
        where: { id: f.policy.serviceProgramId },
        data: {
          settings: {
            moduleKey: 'AI_TRAINING_V1',
            personalLearningPilot: {
              enabled: true,
              enrollmentIds: [f.enrollment.id, enrollment.id],
            },
            trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
          },
        },
      });
      const job = await client.job.create({
        data: {
          environment: 'STAGING',
          workspaceId: scope.workspaceId,
          jobType: 'TRAINING_ANSWER_EVALUATE',
          payloadReference: `training-evaluation:${scope.groupId}:${enrollment.id}:${answer.id}:${user.id}`,
          idempotencyKey: randomUUID(),
          correlationId: randomUUID(),
          requestedBy: user.id,
          status: 'LEASED',
          attemptCount: 1,
          leaseOwner: 'second-worker',
          leaseExpiresAt: new Date(Date.now() + 600000),
        },
      });
      const first = await f.request();
      const second = {
        ...first,
        actor: { scope, actorUserId: user.id },
        assignmentId: assignment.id,
        answerId: answer.id,
        jobId: job.id,
      };
      const results = await Promise.allSettled([f.repo.admit(first), f.repo.admit(second)]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await client.personalLearningCallAdmission.count()).toBe(1);
    });
    it('practice requires learner interaction, confirmation and a matching Assessment, then records First Success once', async () => {
      const f = await practiceFixture();
      await expect(f.complete()).rejects.toThrow();
      await f.start();
      await expect(f.complete()).rejects.toThrow();
      await f.interact();
      await expect(f.complete()).rejects.toThrow();
      const answer = await f.assessed(f.assignmentId);
      await f.complete();
      expect(await f.complete()).toMatchObject({ replayed: true });
      expect(await f.practice.readPractice(f.actor, f.assignmentId)).toMatchObject({
        completed: true,
        firstSuccess: true,
      });
      const rows = await client.programActionEvent.findMany({
        where: {
          programEnrollmentId: f.enrollment.id,
          eventType: 'PERSONAL_LEARNING_FIRST_SUCCESS',
        },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.sourceResourceId).toBe(answer.id);
      expect(rows[0]!.metadata).toMatchObject({
        capabilityLevel: 'UNKNOWN',
        outcomeQuality: 'UNKNOWN',
        practiceSessionsToFirstSuccess: 1,
      });
      expect(JSON.stringify(rows[0]!.metadata)).not.toContain('Synthetic learner practice');
      expect(
        (await client.programEnrollment.findUniqueOrThrow({ where: { id: f.enrollment.id } }))
          .status,
      ).toBe('ACTIVE');
      const next = await f.bridge.bridge({ ...f.request, idempotencyKey: 'practice-next' });
      const second = next.assignmentId!;
      await f.practice.recordPractice(f.actor, second, { action: 'START', supportLevel: 'GUIDED' });
      for (const interaction of ['SELF_PROMPTED', 'SELF_EVALUATED'] as const)
        await f.practice.recordPractice(f.actor, second, { action: 'INTERACT', interaction });
      await f.assessed(second);
      await f.practice.recordPractice(f.actor, second, {
        action: 'COMPLETE',
        learnerConfirmedCompletion: true,
        usefulResult: true,
      });
      expect(
        await client.programActionEvent.count({
          where: {
            programEnrollmentId: f.enrollment.id,
            eventType: 'PERSONAL_LEARNING_FIRST_SUCCESS',
          },
        }),
      ).toBe(1);
    });
    it('practice rejects cross-actor, cross-workspace and cross-enrollment access', async () => {
      const f = await practiceFixture();
      for (const actor of [
        { ...f.actor, actorUserId: randomUUID() },
        { ...f.actor, scope: { ...f.scope, workspaceId: randomUUID() } },
        { ...f.actor, scope: { ...f.scope, programEnrollmentId: randomUUID() } },
      ]) {
        await expect(
          f.practice.recordPractice(actor, f.assignmentId, {
            action: 'START',
            supportLevel: 'GUIDED',
          }),
        ).rejects.toThrow();
      }
    });
    it('practice cannot bypass a revoked Pilot gate or learner interaction order', async () => {
      const f = await practiceFixture();
      await f.start();
      await expect(
        f.practice.recordPractice(f.actor, f.assignmentId, {
          action: 'INTERACT',
          interaction: 'SELF_REVISED',
        }),
      ).rejects.toThrow();
      await client.serviceProgram.update({
        where: { id: f.enrollment.serviceProgramId },
        data: { settings: { moduleKey: 'AI_TRAINING_V1' } },
      });
      await expect(f.interact()).rejects.toThrow();
    });
    it('practice preserves support use and refuses unapproved Definition completion', async () => {
      const f = await practiceFixture();
      await f.start();
      await f.interact();
      await f.assessed(f.assignmentId);
      await client.programActionEvent.create({
        data: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          programEnrollmentId: f.enrollment.id,
          actorUserId: f.scope.userId,
          missionAssignmentId: f.assignmentId,
          eventType: 'HELP_REQUESTED',
          idempotencyKey: 'practice-help',
          metadata: {},
          occurredAt: now,
        },
      });
      await f.complete();
      expect((await f.practice.readPractice(f.actor, f.assignmentId)).supportLevel).toBe('GUIDED');
      await client.learningDefinitionApproval.updateMany({
        where: { workspaceId: f.scope.workspaceId, groupId: f.scope.groupId },
        data: { approvalStatus: 'DEPRECATED' },
      });
      await expect(f.complete()).rejects.toThrow();
    });
    it('answer deletion removes completion and First Success without retaining the outcome', async () => {
      const f = await practiceFixture();
      await f.start();
      await f.interact();
      const answer = await f.assessed(f.assignmentId);
      await f.complete();
      const deletion = new PrismaTrainingPersonalDataDeletionRepository(client);
      const input = {
        workspaceId: f.scope.workspaceId,
        groupId: f.scope.groupId,
        programEnrollmentId: f.enrollment.id,
        actorUserId: f.scope.userId,
        target: { kind: 'ANSWER' as const, answerId: answer.id },
      };
      const preview = await deletion.preview(input);
      if (preview.outcome !== 'PREVIEW') throw new Error('expected deletion preview');
      expect(
        (await deletion.delete({ ...input, revision: preview.preview.revision, now })).outcome,
      ).toBe('DELETED');
      expect(await f.practice.readPractice(f.actor, f.assignmentId)).toMatchObject({
        completed: false,
        firstSuccess: false,
      });
      expect(
        await client.programActionEvent.count({
          where: { programEnrollmentId: f.enrollment.id, sourceResourceId: answer.id },
        }),
      ).toBe(0);
      await expect(f.complete()).rejects.toThrow();
    });
    it('execution gate authorizes only the current learner Plan, then stops on Goal cancellation', async () => {
      const f = await routerFixture();
      await client.serviceProgram.update({
        where: { id: f.enrollment.serviceProgramId },
        data: {
          settings: {
            moduleKey: 'AI_TRAINING_V1',
            personalLearningPilot: { enabled: true, enrollmentIds: [f.enrollment.id] },
            trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
          },
        },
      });
      const selected = await f.bridge.bridge(f.request);
      const answer = await client.trainingMissionAnswer.create({
        data: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          programEnrollmentId: f.enrollment.id,
          missionAssignmentId: selected.assignmentId!,
          userId: f.scope.userId,
          answer: 'Synthetic private answer',
          evaluationStatus: 'PENDING',
        },
      });
      const gate = new PrismaPersonalLearningAssessmentGate(client, () => now);
      await gate.authorizeAssessment(f.actor, selected.assignmentId!, answer.id);
      await expect(
        gate.authorizeAssessment(
          { ...f.actor, scope: { ...f.scope, userId: randomUUID() } },
          selected.assignmentId!,
          answer.id,
        ),
      ).rejects.toThrow();
      await client.programMemberGoal.updateMany({
        where: { programEnrollmentId: f.enrollment.id },
        data: { status: 'CANCELLED' },
      });
      await expect(
        gate.authorizeAssessment(f.actor, selected.assignmentId!, answer.id),
      ).rejects.toThrow();
      expect(
        (await client.trainingMissionAnswer.findUniqueOrThrow({ where: { id: answer.id } }))
          .evaluationStatus,
      ).toBe('PENDING');
    });
    it.each(['definition', 'marker', 'program', 'membership', 'revision'] as const)(
      'execution gate refuses stale %s without changing answer/history',
      async (change) => {
        const f = await routerFixture();
        await client.serviceProgram.update({
          where: { id: f.enrollment.serviceProgramId },
          data: {
            settings: {
              moduleKey: 'AI_TRAINING_V1',
              personalLearningPilot: { enabled: true, enrollmentIds: [f.enrollment.id] },
              trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
            },
          },
        });
        const selected = await f.bridge.bridge(f.request);
        const answer = await client.trainingMissionAnswer.create({
          data: {
            workspaceId: f.scope.workspaceId,
            groupId: f.scope.groupId,
            programEnrollmentId: f.enrollment.id,
            missionAssignmentId: selected.assignmentId!,
            userId: f.scope.userId,
            answer: 'Synthetic',
            evaluationStatus: 'PENDING',
          },
        });
        if (change === 'definition')
          await client.learningDefinitionApproval.updateMany({
            where: { groupId: f.scope.groupId },
            data: { approvalStatus: 'DEPRECATED' },
          });
        if (change === 'marker')
          await client.serviceProgram.update({
            where: { id: f.enrollment.serviceProgramId },
            data: { settings: { moduleKey: 'AI_TRAINING_V1' } },
          });
        if (change === 'program')
          await client.serviceProgram.update({
            where: { id: f.enrollment.serviceProgramId },
            data: { status: 'SUSPENDED' },
          });
        if (change === 'membership')
          await client.groupMembership.update({
            where: { id: f.member.id },
            data: { status: 'REVOKED', revokedAt: now },
          });
        if (change === 'revision')
          await client.personalLearningPlanRevision.updateMany({
            where: { planId: f.plan.planId },
            data: { status: 'SUPERSEDED' },
          });
        await expect(
          new PrismaPersonalLearningAssessmentGate(client, () => now).authorizeAssessment(
            f.actor,
            selected.assignmentId!,
            answer.id,
          ),
        ).rejects.toThrow();
      },
    );
    it('completed Plan assignments cannot enter the legacy candidate runtime after marker loss', async () => {
      const f = await routerFixture();
      const selected = await f.bridge.bridge(f.request);
      await f.assessed(selected.assignmentId!);
      await client.serviceProgram.update({
        where: { id: f.enrollment.serviceProgramId },
        data: { settings: { moduleKey: 'AI_TRAINING_V1' } },
      });
      await expect(
        new PrismaAiTrainingRuntimeCandidateRepository(client).findCandidate({
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          programEnrollmentId: f.enrollment.id,
          actorUserId: f.scope.userId,
          now,
        }),
      ).resolves.toBeNull();
    });
    it('P1-G records scoped AI attempts once, preserves historical refs, and refuses cross tenant/deleted data', async () => {
      const f = await routerFixture();
      await client.serviceProgram.update({
        where: { id: f.enrollment.serviceProgramId },
        data: {
          settings: {
            moduleKey: 'AI_TRAINING_V1',
            personalLearningPilot: { enabled: true, enrollmentIds: [f.enrollment.id] },
            trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
          },
        },
      });
      const bridge = await f.bridge.bridge({ ...f.request, idempotencyKey: 'telemetry-bridge' });
      const answer = await f.assessed(bridge.assignmentId!);
      const repo = new PrismaPersonalLearningAiCallRepository(client);
      const input = {
        actor: f.actor,
        assignmentId: bridge.assignmentId!,
        answerId: answer.id,
        usageKey: `training-evaluation:${answer.id}:${randomUUID()}:attempt:1`,
        measurement: {
          provider: 'openai',
          model: 'synthetic',
          inputTokens: 100,
          outputTokens: 20,
          cachedInputTokens: 0,
          latencyMs: 15,
          success: true,
          errorCategory: null,
          validationResult: 'PASSED' as const,
          fallbackUsed: false,
          occurredAt: now.toISOString(),
        },
        registry: [],
      };
      await repo.record(input);
      await repo.record(input);
      const rows = await client.programActionEvent.findMany({
        where: { programEnrollmentId: f.enrollment.id, eventType: 'PERSONAL_LEARNING_AI_CALL' },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.metadata).toMatchObject({
        planId: f.request.planId,
        planRevision: 1,
        definition: AI_TRAINING_LEARNING_DEFINITION_FIXTURES[0]!.reference,
        cost: { costStatus: 'UNKNOWN' },
      });
      expect(JSON.stringify(rows[0]!.metadata)).not.toContain('Synthetic learner practice');
      const sql = readFileSync(
        new URL('../../../docs/ai-training/P1G_AI_COST_ANALYSIS.sql', import.meta.url),
        'utf8',
      );
      const metrics = await client.$queryRawUnsafe<
        {
          attempts: bigint;
          unknown_cost_attempts: bigint;
          known_estimated_usd_micros: unknown;
          assessed_pass_answers: bigint;
        }[]
      >(
        sql,
        f.scope.workspaceId,
        f.scope.groupId,
        new Date(now.getTime() - 1000),
        new Date(now.getTime() + 1000),
      );
      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toMatchObject({
        attempts: 1n,
        unknown_cost_attempts: 1n,
        known_estimated_usd_micros: null,
        assessed_pass_answers: 1n,
      });
      expect(
        await client.$queryRawUnsafe(
          sql,
          f.scope.workspaceId,
          randomUUID(),
          new Date(now.getTime() - 1000),
          new Date(now.getTime() + 1000),
        ),
      ).toEqual([]);
      for (const scope of [
        { ...f.scope, userId: f.owner.id },
        { ...f.scope, workspaceId: randomUUID() },
        { ...f.scope, programEnrollmentId: randomUUID() },
      ])
        await expect(
          repo.record({ ...input, actor: { actorUserId: scope.userId, scope } }),
        ).rejects.toThrow();
      await client.trainingMissionAnswer.delete({ where: { id: answer.id } });
      await expect(
        repo.record({ ...input, usageKey: input.usageKey.replace('attempt:1', 'attempt:2') }),
      ).rejects.toThrow();
    });
    it('P1-F restricted pilot bridges an entire saved path with existing answers and fixed feedback', async () => {
      const f = await routerFixture();
      await client.serviceProgram.update({
        where: { id: f.enrollment.serviceProgramId },
        data: {
          settings: {
            moduleKey: 'AI_TRAINING_V1',
            personalLearningPilot: { enabled: true, enrollmentIds: [f.enrollment.id] },
            trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
          },
        },
      });
      const pilot = new PrismaPersonalLearningPilotRepository(client, () => now);
      const router = new PrismaPersonalLearningPilotRouter(client);
      expect((await pilot.read(f.actor)).plans[0]?.plan.status).toBe('CONFIRMED');
      expect(
        await new PrismaAiTrainingRuntimeCandidateRepository(client).findCandidate({
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          actorUserId: f.scope.userId,
          programEnrollmentId: f.enrollment.id,
          now: new Date(),
        }),
      ).toBeNull();
      // The injected assessment fixture uses fixed time, so the bridge is fixed too.
      const fixedRouter = new PrismaPersonalLearningPilotRouter(client, () => now);
      for (const [index, definition] of AI_TRAINING_LEARNING_DEFINITION_FIXTURES.entries()) {
        const receipt = await fixedRouter.bridge({
          ...f.request,
          idempotencyKey: `pilot-${index}`,
        });
        expect(receipt.result.definition).toEqual(definition.reference);
        expect(receipt.assignmentId).toBeTruthy();
        const assignment = await pilot.currentAssignment({
          ...f.actor,
          planId: f.plan.planId,
          revision: 1,
        });
        expect(assignment?.id).toBe(receipt.assignmentId);
        expect(
          await new PrismaAiTrainingRuntimeStateRepository(client).findState({
            workspaceId: f.scope.workspaceId,
            groupId: f.scope.groupId,
            actorUserId: f.scope.userId,
            programEnrollmentId: f.enrollment.id,
            now: new Date(),
          }),
        ).toBeNull();
        await f.assessed(receipt.assignmentId!);
        const saved = await client.programMissionAssignment.findUniqueOrThrow({
          where: { id: receipt.assignmentId! },
        });
        expect(saved.startedAt).not.toBeNull();
        await pilot.feedback({ ...f.actor, assignmentId: saved.id, fit: 'FIT' });
        await pilot.feedback({ ...f.actor, assignmentId: saved.id, fit: 'NOT_FIT' });
      }
      expect(
        (await fixedRouter.bridge({ ...f.request, idempotencyKey: 'pilot-completed' })).result
          .status,
      ).toBe('PLAN_COMPLETED');
      expect(
        (await client.programEnrollment.findUniqueOrThrow({ where: { id: f.enrollment.id } }))
          .status,
      ).toBe('ACTIVE');
      expect(
        await client.programActionEvent.count({
          where: { programEnrollmentId: f.enrollment.id, eventType: 'PERSONAL_LEARNING_PILOT_FIT' },
        }),
      ).toBe(3);
      await expect(pilot.read({ ...f.actor, actorUserId: f.owner.id })).rejects.toThrow();
      expect(
        (await pilot.currentAssignment({ ...f.actor, planId: f.request.planId, revision: 1 }))
          ?.planCompleted,
      ).toBe(true);
      await client.serviceProgram.update({
        where: { id: f.enrollment.serviceProgramId },
        data: {
          settings: { moduleKey: 'AI_TRAINING_V1', personalLearningPilot: { enabled: false } },
        },
      });
      await expect(pilot.read(f.actor)).rejects.toThrow();
      await expect(router.bridge({ ...f.request, idempotencyKey: 'disabled' })).rejects.toThrow();
    });
    it('P1-F revalidates Consultation and confirms Goal/Plan separately without saving consultation text', async () => {
      const f = await fixture();
      await client.serviceProgram.update({
        where: { id: f.enrollment.serviceProgramId },
        data: {
          settings: {
            moduleKey: 'AI_TRAINING_V1',
            personalLearningPilot: { enabled: true, enrollmentIds: [f.enrollment.id] },
            trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
          },
        },
      });
      await client.trainingParticipantProfile.create({
        data: { ...f.scope, role: 'OTHER', aiLevel: 'BEGINNER', updatedByUserId: f.scope.userId },
      });
      const pilot = new PrismaPersonalLearningPilotRepository(client, () => now);
      const consultation = {
        scope: f.scope,
        text: 'プロンプトを学びたい',
        answers: [] as LearningConsultationAnswer[],
      };
      const input = { ...f.actor, consultation, telemetryKey: randomUUID() };
      const candidate = await pilot.consult(input);
      await pilot.consult(input);
      if (candidate.status !== 'GOAL_CANDIDATE') throw new Error('synthetic candidate unavailable');
      expect((await pilot.read(f.actor)).goals).toHaveLength(0);
      consultation.answers.push({
        questionKey: 'GOAL_CONFIRMATION',
        answerKey: 'YES',
        candidateKey: candidate.question.candidateKey!,
      });
      const request = { ...f.actor, consultation, idempotencyKey: 'pilot-goal' };
      await pilot.confirmGoal(request);
      await pilot.confirmGoal(request);
      const reference = (await pilot.read(f.actor)).goals[0]!.reference;
      const plan: PersonalLearningPlan = {
        contractVersion: PERSONAL_LEARNING_PLAN_CONTRACT_VERSION,
        ruleVersion: PERSONAL_LEARNING_PLAN_CONTRACT_VERSION,
        planId: randomUUID(),
        revision: 1,
        previousRevision: null,
        revisionReason: 'INITIAL',
        scope: f.scope,
        goal: reference,
        steps: AI_TRAINING_LEARNING_DEFINITION_FIXTURES.map((d) => ({
          definition: d.reference,
          prerequisites: d.prerequisites,
          selectionReason: 'GOAL_ALIGNMENT',
        })),
        status: 'DRAFT',
        confirmation: null,
      };
      await pilot.savePlan({ ...f.actor, plan, expectedRevision: 0, idempotencyKey: 'pilot-plan' });
      expect((await pilot.read(f.actor)).plans[0]?.plan.status).toBe('DRAFT');
      await pilot.confirmPlan({
        ...f.actor,
        planId: plan.planId,
        expectedRevision: 1,
        idempotencyKey: 'pilot-confirm-plan',
      });
      expect((await pilot.read(f.actor)).plans[0]?.plan.status).toBe('CONFIRMED');
      const events = await client.programActionEvent.findMany({
        where: { programEnrollmentId: f.enrollment.id },
      });
      expect(
        events.filter((e) => e.eventType === 'PERSONAL_LEARNING_PILOT_CONSULTATION'),
      ).toHaveLength(1);
      expect(JSON.stringify(events)).not.toContain(consultation.text);
      await expect(
        pilot.confirmGoal({
          ...f.actor,
          idempotencyKey: 'forged',
          consultation: {
            ...consultation,
            answers: [
              { questionKey: 'GOAL_CONFIRMATION', answerKey: 'YES', candidateKey: 'forged' },
            ],
          },
        }),
      ).rejects.toThrow();
    });
    it('P1-E A/B/C/F/K: bridges three independent assignments and consumes existing assessment evidence', async () => {
      const f = await routerFixture();
      const first = await f.bridge.bridge(f.request);
      expect(first.result.status).toBe('NEXT');
      expect(await f.bridge.bridge(f.request)).toEqual(first);
      expect(
        (await f.bridge.bridge({ ...f.request, idempotencyKey: 'pending' })).result.status,
      ).toBe('UNKNOWN');
      await f.assessed(first.assignmentId!);
      const second = await f.bridge.bridge({ ...f.request, idempotencyKey: 'bridge-2' });
      expect(second.result.definition?.definitionKey).toBe('CONTEXT_SETTING');
      expect(second.assignmentId).not.toBe(first.assignmentId);
      await f.assessed(second.assignmentId!);
      const third = await f.bridge.bridge({ ...f.request, idempotencyKey: 'bridge-3' });
      expect(third.result.definition?.definitionKey).toBe('CONSTRAINT_SETTING');
      await f.assessed(third.assignmentId!);
      expect((await f.bridge.bridge({ ...f.request, idempotencyKey: 'done' })).result.status).toBe(
        'PLAN_COMPLETED',
      );
      expect(
        await client.programMissionAssignment.count({
          where: { programEnrollmentId: f.enrollment.id },
        }),
      ).toBe(3);
      expect(
        (await client.programEnrollment.findUniqueOrThrow({ where: { id: f.enrollment.id } }))
          .status,
      ).toBe('ACTIVE');
      expect((await f.repo.read(f.actor)).goals[0]!.reference.reference.status).toBe('ACTIVE');
      expect((await f.repo.read(f.actor)).plans[0]!.plan.status).toBe('CONFIRMED');
    });
    it('open-ended shell bridges all three Definitions after thirty days without expiring Enrollment', async () => {
      const f = await routerFixture();
      const program = await client.serviceProgram.findUniqueOrThrow({
        where: { id: f.enrollment.serviceProgramId },
      });
      await client.programTemplateVersion.update({
        where: { id: program.programTemplateVersionId },
        data: {
          definition: JSON.parse(
            JSON.stringify(createPersonalLearningProgramDefinition()),
          ) as Prisma.InputJsonValue,
        },
      });
      await client.programEnrollment.update({
        where: { id: f.enrollment.id },
        data: {
          startsAt: new Date(now.getTime() - 60 * 86400000),
          endsAt: null,
        },
      });
      for (const [index, key] of [
        'PROMPT_STRUCTURE',
        'CONTEXT_SETTING',
        'CONSTRAINT_SETTING',
      ].entries()) {
        const next = await f.bridge.bridge({ ...f.request, idempotencyKey: `open-ended-${index}` });
        expect(next.result).toMatchObject({ status: 'NEXT', definition: { definitionKey: key } });
        await f.assessed(next.assignmentId!);
      }
      expect(
        (await f.bridge.bridge({ ...f.request, idempotencyKey: 'open-ended-done' })).result.status,
      ).toBe('PLAN_COMPLETED');
      expect(
        await client.programEnrollment.findUniqueOrThrow({ where: { id: f.enrollment.id } }),
      ).toMatchObject({ status: 'ACTIVE', endsAt: null });
    });
    it('P1-E D: REVIEW creates a distinct idempotent attempt, never overwrites history', async () => {
      const f = await routerFixture();
      const first = await f.bridge.bridge(f.request);
      await f.assessed(first.assignmentId!, 'REVIEW');
      const retryRequest = { ...f.request, idempotencyKey: 'review' };
      const second = await f.bridge.bridge(retryRequest);
      expect(second.result.status).toBe('REVIEW');
      expect(second.assignmentId).not.toBe(first.assignmentId);
      expect(await f.bridge.bridge(retryRequest)).toEqual(second);
    });
    it('P1-E G/H/I/J/L: rejects stale revision, revoked approval, cancelled Goal, inactive Enrollment and scope changes', async () => {
      const f = await routerFixture();
      expect((await f.bridge.bridge({ ...f.request, expectedRevision: 2 })).result.reason).toBe(
        'PLAN_REVISION_CHANGED',
      );
      for (const field of [
        'userId',
        'workspaceId',
        'programEnrollmentId',
        'groupId',
        'groupMembershipId',
      ] as const) {
        await expect(
          f.bridge.bridge({ ...f.request, scope: { ...f.scope, [field]: randomUUID() } }),
        ).rejects.toThrow();
      }
      await client.learningDefinitionApproval.updateMany({
        where: { groupId: f.scope.groupId },
        data: { approvalStatus: 'DEPRECATED' },
      });
      expect((await f.bridge.bridge(f.request)).result.reason).toBe('DEFINITION_NOT_APPROVED');
      await client.programMemberGoal.updateMany({
        where: { programEnrollmentId: f.enrollment.id },
        data: { status: 'CANCELLED' },
      });
      expect((await f.bridge.bridge(f.request)).result.reason).toBe('GOAL_NOT_ACTIVE');
      await client.programEnrollment.update({
        where: { id: f.enrollment.id },
        data: { status: 'CANCELLED' },
      });
      await expect(f.bridge.bridge(f.request)).rejects.toThrow();
      expect(
        await client.programMissionAssignment.count({
          where: { programEnrollmentId: f.enrollment.id },
        }),
      ).toBe(0);
    });
    it('P1-E refuses unverified skill data and preserves an unfinished legacy assignment', async () => {
      const f = await routerFixture();
      const first = await f.bridge.bridge(f.request);
      const answer = await f.assessed(first.assignmentId!);
      await client.programActionEvent.deleteMany({
        where: { sourceResourceId: answer.id, eventType: 'ANSWER_EVALUATED' },
      });
      expect(
        (await f.bridge.bridge({ ...f.request, idempotencyKey: 'unverified' })).result.status,
      ).toBe('UNKNOWN');
      await client.programMissionAssignment.update({
        where: { id: first.assignmentId! },
        data: {
          targetResourceType: null,
          targetResourceId: null,
          status: 'PRESENTED',
          startedAt: null,
          completedAt: null,
          skippedAt: null,
        },
      });
      expect(
        (await f.bridge.bridge({ ...f.request, idempotencyKey: 'legacy' })).result.reason,
      ).toBe('EXISTING_ASSIGNMENT_ACTIVE');
    });
    it('P1-E rechecks approval even on a duplicate receipt and never reuses old-revision evidence', async () => {
      const f = await routerFixture();
      const first = await f.bridge.bridge(f.request);
      await f.assessed(first.assignmentId!);
      const draft: PersonalLearningPlan = {
        ...f.plan,
        revision: 2,
        previousRevision: { planId: f.plan.planId, revision: 1 },
        revisionReason: 'LEARNER_REQUEST',
        status: 'DRAFT',
        confirmation: null,
      };
      await f.repo.savePlan({
        ...f.actor,
        plan: draft,
        expectedRevision: 1,
        idempotencyKey: 'revision-2',
      });
      await f.repo.confirmPlan({
        ...f.actor,
        planId: draft.planId,
        expectedRevision: 2,
        idempotencyKey: 'confirm-2',
      });
      expect((await f.bridge.bridge(f.request)).result.reason).toBe('PLAN_REVISION_CHANGED');
      expect(
        (await f.bridge.bridge({ ...f.request, expectedRevision: 2, idempotencyKey: 'new' })).result
          .status,
      ).toBe('UNKNOWN');
      const g = await routerFixture();
      await g.bridge.bridge(g.request);
      await client.learningDefinitionApproval.updateMany({
        where: { groupId: g.scope.groupId },
        data: { approvalStatus: 'DRAFT' },
      });
      expect((await g.bridge.bridge(g.request)).result.reason).toBe('DEFINITION_NOT_APPROVED');
    });
    it('P1-E simultaneous bridge requests cannot create duplicate assignments', async () => {
      const f = await routerFixture();
      await Promise.allSettled([
        f.bridge.bridge(f.request),
        f.bridge.bridge({ ...f.request, idempotencyKey: 'parallel' }),
      ]);
      expect(
        await client.programMissionAssignment.count({
          where: { programEnrollmentId: f.enrollment.id },
        }),
      ).toBe(1);
    });
    it('P1-E does not ignore an unscoped legacy review requirement', async () => {
      const f = await routerFixture();
      await client.trainingParticipantProfile.update({
        where: { programEnrollmentId: f.enrollment.id },
        data: { needsReview: true },
      });
      expect((await f.bridge.bridge(f.request)).result.reason).toBe('REVIEW_EVIDENCE_MISSING');
      expect(
        await client.programMissionAssignment.count({
          where: { programEnrollmentId: f.enrollment.id },
        }),
      ).toBe(0);
    });
    it('saves Goal once, restores its evidence, and rejects a different key without explicit replacement', async () => {
      const f = await fixture();
      const first = await f.repo.confirmGoal(f.confirm);
      expect(await f.repo.confirmGoal(f.confirm)).toEqual(first);
      await expect(
        f.repo.confirmGoal({ ...f.confirm, idempotencyKey: 'replace' }),
      ).rejects.toThrow();
      expect(
        await client.programMemberGoal.count({
          where: { programEnrollmentId: f.enrollment.id, status: 'ACTIVE' },
        }),
      ).toBe(1);
      expect(
        await client.personalLearningGoalConfirmation.count({
          where: { programEnrollmentId: f.enrollment.id },
        }),
      ).toBe(1);
      expect((await f.repo.read(f.actor)).goals[0]?.reference.kind).toBe(
        'CONFIRMED_GOAL_REFERENCE',
      );
    });
    it('saves draft, confirms separately, revises without erasing history, and rejects stale CAS', async () => {
      const f = await fixture();
      const plan = await f.plan();
      const initial = { ...f.actor, plan, expectedRevision: 0, idempotencyKey: 'plan' };
      expect(await f.repo.savePlan(initial)).toEqual(await f.repo.savePlan(initial));
      expect((await f.repo.read(f.actor)).plans[0]?.plan.status).toBe('DRAFT');
      const confirmation = {
        ...f.actor,
        planId: plan.planId,
        expectedRevision: 1,
        idempotencyKey: 'planconfirm',
      };
      expect(await f.repo.confirmPlan(confirmation)).toEqual(
        await f.repo.confirmPlan(confirmation),
      );
      const next: PersonalLearningPlan = {
        ...plan,
        revision: 2,
        previousRevision: { planId: plan.planId, revision: 1 },
        revisionReason: 'REVIEW_REQUIRED',
      };
      await f.repo.savePlan({
        ...f.actor,
        plan: next,
        expectedRevision: 1,
        idempotencyKey: 'revision',
      });
      await expect(
        f.repo.savePlan({ ...f.actor, plan: next, expectedRevision: 1, idempotencyKey: 'stale' }),
      ).rejects.toThrow();
      const history = await f.repo.read(f.actor);
      expect(history.plans.map((row) => row.plan.status)).toEqual(['SUPERSEDED', 'DRAFT']);
      expect(history.plans.map((row) => row.plan.revision)).toEqual([1, 2]);
      expect(history.plans[0]?.plan.steps).toEqual(plan.steps);
      expect(await f.repo.confirmPlan(confirmation)).toMatchObject({ revision: 1 });
    });
    it('serializes racing Plan successors, never overwriting one with the other', async () => {
      const f = await fixture();
      const plan = await f.plan();
      await f.repo.savePlan({ ...f.actor, plan, expectedRevision: 0, idempotencyKey: 'plan' });
      const next: PersonalLearningPlan = {
        ...plan,
        revision: 2,
        previousRevision: { planId: plan.planId, revision: 1 },
        revisionReason: 'LEARNER_REQUEST',
      };
      const results = await Promise.allSettled(
        ['a', 'b'].map((idempotencyKey) =>
          f.repo.savePlan({ ...f.actor, plan: next, expectedRevision: 1, idempotencyKey }),
        ),
      );
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(
        await client.personalLearningPlanRevision.count({ where: { planId: plan.planId } }),
      ).toBe(2);
    });
    it('rejects same idempotency key for a different operation or changed Plan', async () => {
      const f = await fixture();
      const plan = await f.plan();
      await expect(
        f.repo.savePlan({ ...f.actor, plan, expectedRevision: 0, idempotencyKey: 'confirm' }),
      ).rejects.toThrow();
      await f.repo.savePlan({ ...f.actor, plan, expectedRevision: 0, idempotencyKey: 'plan' });
      await expect(
        f.repo.savePlan({
          ...f.actor,
          plan: { ...plan, ruleVersion: 'OTHER_V1' },
          expectedRevision: 0,
          idempotencyKey: 'plan',
        }),
      ).rejects.toThrow();
    });
    it('does not approve fixtures implicitly or trust a forged selected candidate', async () => {
      const f = await fixture(false);
      await expect(f.repo.confirmGoal(f.confirm)).rejects.toThrow();
      expect(
        await client.programMemberGoal.count({ where: { programEnrollmentId: f.enrollment.id } }),
      ).toBe(0);
      const g = await fixture();
      await expect(
        g.repo.confirmGoal({
          ...g.confirm,
          consultation: { ...g.confirm.consultation, text: '集客どうしたらいい？' },
        }),
      ).rejects.toThrow();
    });
    it('rejects deprecated/new or altered Definition references but reads historical versions', async () => {
      const f = await fixture();
      const plan = await f.plan();
      await f.repo.savePlan({ ...f.actor, plan, expectedRevision: 0, idempotencyKey: 'plan' });
      await client.learningDefinitionApproval.updateMany({
        where: { workspaceId: f.scope.workspaceId, groupId: f.scope.groupId },
        data: { approvalStatus: 'DEPRECATED' },
      });
      expect((await f.repo.read(f.actor)).plans[0]?.plan.steps).toEqual(plan.steps);
      await expect(
        f.repo.confirmPlan({
          ...f.actor,
          planId: plan.planId,
          expectedRevision: 1,
          idempotencyKey: 'confirmplan',
        }),
      ).rejects.toThrow();
      const bad: PersonalLearningPlan = {
        ...plan,
        steps: [{ ...plan.steps[0]!, definition: { ...plan.steps[0]!.definition, version: 'V2' } }],
      };
      await expect(
        f.repo.savePlan({ ...f.actor, plan: bad, expectedRevision: 0, idempotencyKey: 'bad' }),
      ).rejects.toThrow();
    });
    it.each([
      'workspaceId',
      'groupId',
      'programEnrollmentId',
      'groupMembershipId',
      'userId',
    ] as const)('rejects cross-tenant %s for read and write', async (key) => {
      const f = await fixture();
      await f.repo.confirmGoal(f.confirm);
      const foreign = { ...f.actor, scope: { ...f.scope, [key]: randomUUID() } };
      await expect(f.repo.read(foreign)).rejects.toThrow();
      await expect(f.repo.confirmGoal({ ...f.confirm, ...foreign })).rejects.toThrow();
    });
    it('stores no consultation/body; does not change lifecycle, assignments or legacy Profile', async () => {
      const f = await fixture();
      const plan = await f.plan();
      await f.repo.savePlan({ ...f.actor, plan, expectedRevision: 0, idempotencyKey: 'plan' });
      const enrollment = await client.programEnrollment.findUniqueOrThrow({
        where: { id: f.enrollment.id },
      });
      expect(enrollment).toEqual(f.enrollment);
      expect(
        await client.programMissionAssignment.count({
          where: { programEnrollmentId: enrollment.id },
        }),
      ).toBe(0);
      expect(
        await client.trainingParticipantProfile.count({
          where: { programEnrollmentId: enrollment.id },
        }),
      ).toBe(0);
      const events = await client.programActionEvent.findMany({
        where: { programEnrollmentId: enrollment.id },
      });
      expect(JSON.stringify(events)).not.toContain(f.confirm.consultation.text);
      expect(JSON.stringify(events)).not.toContain('candidateKey');
      const row = await client.personalLearningPlanRevision.findFirstOrThrow({
        where: { planId: plan.planId },
      });
      expect(row.steps).toEqual(plan.steps);
      const exported = await new PrismaTrainingPersonalDataExportRepository(client).read({
        workspaceId: f.scope.workspaceId,
        groupId: f.scope.groupId,
        programEnrollmentId: f.enrollment.id,
        actorUserId: f.scope.userId,
      });
      expect(exported.outcome).toBe('FOUND');
      if (exported.outcome === 'FOUND') expect(exported.data.personalLearning).toHaveLength(2);
      const withContent = { ...plan, content: 'private consultation' };
      await expect(
        f.repo.savePlan({
          ...f.actor,
          plan: withContent,
          expectedRevision: 0,
          idempotencyKey: 'body',
        }),
      ).rejects.toThrow();
    });
    it('requires a current human reviewer and rejects future approval evidence', async () => {
      const f = await fixture();
      await client.groupMembership.updateMany({
        where: { groupId: f.group.id, userId: f.owner.id },
        data: { status: 'REVOKED', revokedAt: now },
      });
      await expect(f.repo.confirmGoal(f.confirm)).rejects.toThrow();
      const g = await fixture();
      await client.learningDefinitionApproval.updateMany({
        where: { groupId: g.group.id },
        data: { approvedAt: new Date(now.getTime() + 1000) },
      });
      await expect(g.repo.confirmGoal(g.confirm)).rejects.toThrow();
    });
    it('preserves cancelled Goal and completed Plan history without ending Enrollment', async () => {
      const f = await fixture();
      const plan = await f.plan();
      await f.repo.savePlan({ ...f.actor, plan, expectedRevision: 0, idempotencyKey: 'plan' });
      await f.repo.confirmPlan({
        ...f.actor,
        planId: plan.planId,
        expectedRevision: 1,
        idempotencyKey: 'planconfirm',
      });
      // Simulate future lifecycle writers, not a new Runtime operation in P1-C-S.
      await client.personalLearningPlanRevision.update({
        where: { planId_revision: { planId: plan.planId, revision: 1 } },
        data: { status: 'COMPLETED' },
      });
      await client.programMemberGoal.update({
        where: { id: plan.goal.reference.programMemberGoalId },
        data: { status: 'CANCELLED' },
      });
      const state = await f.repo.read(f.actor);
      expect(state.goals[0]?.reference.reference.status).toBe('CANCELLED');
      expect(state.plans[0]).toMatchObject({ goalActive: false, plan: { status: 'COMPLETED' } });
      expect(
        await client.programEnrollment.findUniqueOrThrow({ where: { id: f.enrollment.id } }),
      ).toEqual(f.enrollment);
    });
    it('does not overwrite an existing legacy ACTIVE Goal', async () => {
      const f = await fixture();
      const legacy = await client.programMemberGoal.create({
        data: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          programEnrollmentId: f.enrollment.id,
          groupMembershipId: f.member.id,
          title: 'Existing learning goal',
          metricType: 'ACTION',
          targetValue: 1,
          currentValue: 0,
          unit: 'step',
          startsAt: now,
          createdByUserId: f.scope.userId,
          updatedByUserId: f.scope.userId,
        },
      });
      await expect(f.repo.confirmGoal(f.confirm)).rejects.toThrow();
      expect(
        await client.programMemberGoal.findUniqueOrThrow({ where: { id: legacy.id } }),
      ).toEqual(legacy);
      expect(
        await client.personalLearningGoalConfirmation.count({
          where: { programEnrollmentId: f.enrollment.id },
        }),
      ).toBe(0);
    });
    it('denies revoked membership, expired writes, and post-deletion resurrection', async () => {
      const f = await fixture();
      await f.repo.confirmGoal(f.confirm);
      await client.groupMembership.update({
        where: { id: f.member.id },
        data: { status: 'REVOKED', revokedAt: now },
      });
      await expect(f.repo.confirmGoal(f.confirm)).rejects.toThrow();
      await expect(f.repo.read(f.actor)).rejects.toThrow();
      const g = await fixture();
      await client.programEnrollment.update({
        where: { id: g.enrollment.id },
        data: { endsAt: now },
      });
      await expect(g.repo.confirmGoal(g.confirm)).rejects.toThrow();
      const h = await fixture();
      await h.repo.confirmGoal(h.confirm);
      await client.programMemberGoal.deleteMany({
        where: { programEnrollmentId: h.enrollment.id },
      });
      await client.programAuditLog.create({
        data: {
          workspaceId: h.scope.workspaceId,
          groupId: h.scope.groupId,
          resourceType: 'PROGRAM_ENROLLMENT',
          resourceId: h.enrollment.id,
          action: 'TRAINING_PERSONAL_DATA_DELETED',
          performedByUserId: h.scope.userId,
          afterData: { kind: 'ALL' },
        },
      });
      await expect(h.repo.confirmGoal(h.confirm)).rejects.toThrow();
      expect(
        await client.personalLearningGoalConfirmation.count({
          where: { programEnrollmentId: h.enrollment.id },
        }),
      ).toBe(0);
    });
  });
}
