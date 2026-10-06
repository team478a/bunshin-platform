import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { PrismaClient, Prisma } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupProgramFixtures } from './program-fixture-cleanup';
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
  AI_TRAINING_SKILL_RULE_VERSION,
  getAiTrainingMissionQuality,
} from '@bunshin/capability-training';
import { PrismaPersonalLearningPersistenceRepository } from '../src/personal-learning-persistence';
import { PrismaPersonalLearningRouterBridge } from '../src/personal-learning-router';
import { PrismaTrainingAnswerRepository } from '../src/training-answer';
import { PrismaPersonalLearningAiCallRepository } from '../src/personal-learning-ai-call';
import { PrismaLearningDefinitionApprovalAdminRepository } from '../src/learning-definition-approval-admin';
import { PrismaPersonalLearningPilotProfileRepository } from '../src/personal-learning-pilot-profile';
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
