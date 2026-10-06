import { randomUUID } from 'node:crypto';
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
