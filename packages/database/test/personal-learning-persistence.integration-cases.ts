import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
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
} from '@bunshin/capability-training';
import { PrismaPersonalLearningPersistenceRepository } from '../src/personal-learning-persistence';
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
