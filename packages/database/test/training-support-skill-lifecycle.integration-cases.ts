import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  TRAINING_SKILL_FACTORY_FEASIBILITY_AXES,
  TRAINING_SUPPORT_SKILL_ROLLBACK_AXES,
  activateTrainingSupportSkillVersionV1,
  adoptTrainingSupportSkillVersionV1,
  approveNextTrainingSupportSkillVersionV1,
  defineTrainingMissionHelpProblemV1,
  defineTrainingMissionSupportSkillDraftV1,
  defineTrainingSupportDraftArtifactV1,
  evaluateTrainingSkillDraftFeasibilityV1,
  rollbackTrainingSupportSkillVersionV1,
  validateTrainingSupportDraftV1,
  type TrainingSkillDraftFeasibilityCheckV1,
  type TrainingSkillFactoryFeasibilityAxis,
  type TrainingSupportSkillLifecycleStateV1,
  type TrainingSupportSkillRollbackCompatibilityV1,
} from '@bunshin/capability-training';
import {
  computeTrainingSupportSkillVersionDigestV1,
  PrismaTrainingSupportSkillLifecycleRepository,
} from '../src';
import { cleanupProgramFixtures } from './program-fixture-cleanup';

const occurredAt = new Date('2026-10-05T00:00:00.000Z');
const approvedAt = new Date('2026-10-05T01:00:00.000Z');

export function registerTrainingSupportSkillLifecycleIntegrationCases(client: PrismaClient) {
  describe('AI training support skill lifecycle isolated PostgreSQL contracts', () => {
    afterEach(() => cleanupProgramFixtures(client));

    async function fixture() {
      const owner = await client.user.create({ data: { displayName: 'Synthetic skill owner' } });
      const workspace = await client.workspace.create({
        data: { type: 'ORGANIZATION', name: `Synthetic skill workspace ${randomUUID()}` },
      });
      const group = await client.group.create({
        data: { workspaceId: workspace.id, name: `Synthetic skill service ${randomUUID()}` },
      });
      await client.groupMembership.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          userId: owner.id,
          serviceRole: 'SERVICE_OWNER',
          status: 'ACTIVE',
          consentedAt: occurredAt,
        },
      });
      await client.serviceConfiguration.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          slug: `skill-${randomUUID()}`,
          displayName: 'Synthetic skill service',
          description: 'Synthetic',
          operatorName: 'Synthetic',
          createdByUserId: owner.id,
          updatedByUserId: owner.id,
        },
      });
      const template = await client.programTemplate.create({
        data: {
          workspaceId: workspace.id,
          ownerGroupId: group.id,
          name: 'Synthetic training template',
          description: 'Synthetic',
          category: 'AI_TRAINING',
          targetAudience: 'Synthetic',
          status: 'ACTIVE',
          visibility: 'PRIVATE',
          createdByUserId: owner.id,
        },
      });
      const templateVersion = await client.programTemplateVersion.create({
        data: {
          workspaceId: workspace.id,
          programTemplateId: template.id,
          version: 1,
          status: 'PUBLISHED',
          definition: {},
          createdByUserId: owner.id,
          publishedAt: occurredAt,
        },
      });
      await client.serviceProgram.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          programTemplateVersionId: templateVersion.id,
          displayName: 'Synthetic AI training',
          description: 'Synthetic',
          status: 'ACTIVE',
          settings: { moduleKey: 'AI_TRAINING_V1' },
          createdByUserId: owner.id,
        },
      });
      return { owner, workspace, group, templateVersion };
    }

    function evidence(scope: Awaited<ReturnType<typeof fixture>>, suffix: string, now: Date) {
      const programEnrollmentId = randomUUID();
      const missionAssignmentId = randomUUID();
      const problem = defineTrainingMissionHelpProblemV1({
        problemId: `problem-${suffix}-${randomUUID()}`,
        revision: 1,
        status: 'APPROVED',
        scope: {
          workspaceId: scope.workspace.id,
          serviceId: scope.group.id,
          programEnrollmentId,
          missionAssignmentId,
        },
        source: {
          workspaceId: scope.workspace.id,
          serviceId: scope.group.id,
          programEnrollmentId,
          missionAssignmentId,
          actionEventId: randomUUID(),
          actionEventSchemaVersion: 1,
          eventType: 'HELP_REQUESTED',
          moduleKey: 'AI_TRAINING_V1',
          occurredAt,
        },
        mission: {
          programTemplateVersionId: scope.templateVersion.id,
          missionDefinitionKey: 'PROMPT_BASIC',
          missionRuleVersion: 'AI_TRAINING_V1_RULES_4',
          assignmentVariant: 'STANDARD',
        },
        contextProjection: {
          learningObjectiveKey: 'PROMPT_BASIC_OBJECTIVE',
          relevantSuccessCriteriaKeys: ['HAS_PURPOSE'],
          barrierReasonCode: null,
          evaluatedSkillKeys: ['promptStructure'],
        },
        enrollmentEndsAt: null,
      });
      const checks = Object.fromEntries(
        TRAINING_SKILL_FACTORY_FEASIBILITY_AXES.map((axis) => [
          axis,
          {
            status: 'PASSED',
            reasonCode: `${axis}_CONFIRMED`,
            confirmedRevision: 'revision-1',
            checkedAt: now,
          } satisfies TrainingSkillDraftFeasibilityCheckV1,
        ]),
      ) as Record<TrainingSkillFactoryFeasibilityAxis, TrainingSkillDraftFeasibilityCheckV1>;
      const feasibility = evaluateTrainingSkillDraftFeasibilityV1(checks);
      const skillDraft = defineTrainingMissionSupportSkillDraftV1({
        skillDraftId: `draft-${suffix}-${randomUUID()}`,
        revision: 1,
        sourceProblemId: problem.problemId,
        sourceProblemRevision: problem.revision,
        scopeFingerprint: `sha256:${suffix.padEnd(64, '0').slice(0, 64)}`,
        missionDefinitionKey: problem.mission.missionDefinitionKey,
        learningObjectiveKey: problem.contextProjection.learningObjectiveKey,
        requiredInputKeys: ['MISSION_OBJECTIVE'],
        prohibitedInputClasses: ['ANSWER_TEXT', 'MEMORY', 'DIRECT_USER_ID'],
        steps: [`${suffix}の安全な次の一歩`],
        expectedOutput: '元の学習目的を変えない成果物',
        status: 'VALIDATED',
        expiresAt: problem.expiresAt,
      });
      const artifact = defineTrainingSupportDraftArtifactV1({
        artifactId: `artifact-${suffix}-${randomUUID()}`,
        revision: 1,
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
        createdAt: occurredAt,
        expiresAt: problem.expiresAt,
      });
      return {
        problem,
        feasibility,
        skillDraft,
        artifact,
        validationReceipt: validateTrainingSupportDraftV1({
          problem,
          feasibility,
          skillDraft,
          artifact,
          now,
        }),
      };
    }

    function withDigests(
      state: TrainingSupportSkillLifecycleStateV1,
    ): TrainingSupportSkillLifecycleStateV1 {
      return {
        ...state,
        versions: state.versions.map((version) => {
          return {
            ...version,
            contentDigest: computeTrainingSupportSkillVersionDigestV1(version),
          };
        }),
      } satisfies TrainingSupportSkillLifecycleStateV1;
    }

    function adoption(scope: Awaited<ReturnType<typeof fixture>>) {
      const source = evidence(scope, 'v1', approvedAt);
      return withDigests(
        adoptTrainingSupportSkillVersionV1({
          skillId: randomUUID(),
          skillVersionId: randomUUID(),
          skillKey: `prompt-basic-${randomUUID()}`,
          contentDigest: `sha256:${'0'.repeat(64)}`,
          expectedSkillRevision: 0,
          operationId: randomUUID(),
          idempotencyKey: randomUUID(),
          reasonCode: 'INITIAL_HUMAN_APPROVAL',
          actor: { userId: scope.owner.id, serviceRole: 'SERVICE_OWNER', active: true },
          ...source,
          now: approvedAt,
        }),
      );
    }

    function nextVersion(
      scope: Awaited<ReturnType<typeof fixture>>,
      state: TrainingSupportSkillLifecycleStateV1,
      now: Date,
    ) {
      const source = evidence(scope, 'v2', now);
      return withDigests(
        approveNextTrainingSupportSkillVersionV1({
          state,
          skillVersionId: randomUUID(),
          contentDigest: `sha256:${'0'.repeat(64)}`,
          expectedSkillRevision: state.skill.revision,
          operationId: randomUUID(),
          idempotencyKey: randomUUID(),
          reasonCode: 'INITIAL_HUMAN_APPROVAL',
          actor: { userId: scope.owner.id, serviceRole: 'SERVICE_OWNER', active: true },
          ...source,
          now,
        }),
      );
    }

    const passedCompatibility = Object.fromEntries(
      TRAINING_SUPPORT_SKILL_ROLLBACK_AXES.map((axis) => [axis, 'PASSED']),
    ) as TrainingSupportSkillRollbackCompatibilityV1;

    it('persists one adoption, replays it, and does not read across Service scope', async () => {
      const f = await fixture();
      const state = adoption(f);
      const repository = new PrismaTrainingSupportSkillLifecycleRepository(client);
      await expect(repository.saveAdoption({ state, expectedAbsent: true })).resolves.toBe(
        'CREATED',
      );
      await expect(
        new PrismaTrainingSupportSkillLifecycleRepository(client).saveAdoption({
          state,
          expectedAbsent: true,
        }),
      ).resolves.toBe('REPLAYED');
      await expect(
        repository.findByScopeAndKey({ scope: state.skill.scope, skillKey: state.skill.skillKey }),
      ).resolves.toEqual(state);
      await expect(
        repository.findByScopeAndKey({
          scope: { ...state.skill.scope, serviceId: randomUUID() },
          skillKey: state.skill.skillKey,
        }),
      ).resolves.toBeNull();
    });

    it('allows exactly one concurrent CAS transition', async () => {
      const f = await fixture();
      const initial = adoption(f);
      const repository = new PrismaTrainingSupportSkillLifecycleRepository(client);
      expect(await repository.saveAdoption({ state: initial, expectedAbsent: true })).toBe(
        'CREATED',
      );
      const activate = (operationId: string) =>
        activateTrainingSupportSkillVersionV1({
          state: initial,
          skillVersionId: initial.versions[0]!.skillVersionId,
          expectedSkillRevision: 1,
          operationId,
          idempotencyKey: operationId,
          reasonCode: 'HUMAN_APPROVED_ACTIVATION',
          actor: { userId: f.owner.id, serviceRole: 'SERVICE_OWNER', active: true },
          now: new Date('2026-10-05T02:00:00.000Z'),
        });
      const outcomes = await Promise.all([
        repository.saveTransition({ previousRevision: 1, state: activate(randomUUID()) }),
        repository.saveTransition({ previousRevision: 1, state: activate(randomUUID()) }),
      ]);
      expect(outcomes.sort()).toEqual(['CONFLICT', 'UPDATED']);
      const persisted = await repository.findByScopeAndKey({
        scope: initial.skill.scope,
        skillKey: initial.skill.skillKey,
      });
      expect(persisted).toMatchObject({ skill: { revision: 2 }, events: [{}, {}] });
    });

    it('records an all-PASSED rollback and the database rejects UNKNOWN compatibility', async () => {
      const f = await fixture();
      const repository = new PrismaTrainingSupportSkillLifecycleRepository(client);
      let state = adoption(f);
      expect(await repository.saveAdoption({ state, expectedAbsent: true })).toBe('CREATED');
      let previous = state.skill.revision;
      state = activateTrainingSupportSkillVersionV1({
        state,
        skillVersionId: state.versions[0]!.skillVersionId,
        expectedSkillRevision: previous,
        operationId: randomUUID(),
        idempotencyKey: randomUUID(),
        reasonCode: 'HUMAN_APPROVED_ACTIVATION',
        actor: { userId: f.owner.id, serviceRole: 'SERVICE_OWNER', active: true },
        now: new Date('2026-10-05T02:00:00.000Z'),
      });
      expect(await repository.saveTransition({ previousRevision: previous, state })).toBe(
        'UPDATED',
      );
      previous = state.skill.revision;
      state = nextVersion(f, state, new Date('2026-10-05T03:00:00.000Z'));
      expect(await repository.saveTransition({ previousRevision: previous, state })).toBe(
        'UPDATED',
      );
      previous = state.skill.revision;
      const firstVersionId = state.versions[0]!.skillVersionId;
      const secondVersionId = state.versions[1]!.skillVersionId;
      state = activateTrainingSupportSkillVersionV1({
        state,
        skillVersionId: secondVersionId,
        expectedSkillRevision: previous,
        operationId: randomUUID(),
        idempotencyKey: randomUUID(),
        reasonCode: 'HUMAN_APPROVED_ACTIVATION',
        actor: { userId: f.owner.id, serviceRole: 'SERVICE_OWNER', active: true },
        now: new Date('2026-10-05T04:00:00.000Z'),
      });
      expect(await repository.saveTransition({ previousRevision: previous, state })).toBe(
        'UPDATED',
      );
      previous = state.skill.revision;
      state = rollbackTrainingSupportSkillVersionV1({
        state,
        skillVersionId: firstVersionId,
        expectedSkillRevision: previous,
        operationId: randomUUID(),
        idempotencyKey: randomUUID(),
        reasonCode: 'MANUAL_VERSION_RESTORE',
        compatibility: passedCompatibility,
        actor: { userId: f.owner.id, serviceRole: 'SERVICE_OWNER', active: true },
        now: new Date('2026-10-05T05:00:00.000Z'),
      });
      expect(await repository.saveTransition({ previousRevision: previous, state })).toBe(
        'UPDATED',
      );
      const rollback = await client.trainingSupportSkillActivation.findFirstOrThrow({
        where: { trainingSupportSkillId: state.skill.skillId, operation: 'ROLLBACK' },
      });
      expect(rollback.rollbackCompatibility).toEqual(passedCompatibility);
      expect(state.skill.currentVersionId).toBe(firstVersionId);
      await expect(
        client.trainingSupportSkillActivation.create({
          data: {
            id: randomUUID(),
            workspaceId: f.workspace.id,
            groupId: f.group.id,
            trainingSupportSkillId: state.skill.skillId,
            skillVersionId: firstVersionId,
            priorSkillVersionId: secondVersionId,
            operation: 'ROLLBACK',
            reasonCode: 'MANUAL_VERSION_RESTORE',
            expectedSkillRevision: state.skill.revision,
            resultingSkillRevision: state.skill.revision + 1,
            idempotencyKey: randomUUID(),
            actorUserId: f.owner.id,
            actorServiceRole: 'SERVICE_OWNER',
            rollbackCompatibility: { ...passedCompatibility, VALIDATION_POLICY: 'UNKNOWN' },
            occurredAt: new Date('2026-10-05T06:00:00.000Z'),
          },
        }),
      ).rejects.toThrow();
    });

    it('rejects an untrusted digest and prevents approved content mutation', async () => {
      const f = await fixture();
      const repository = new PrismaTrainingSupportSkillLifecycleRepository(client);
      const valid = adoption(f);
      const invalid = {
        ...valid,
        versions: [{ ...valid.versions[0]!, contentDigest: `sha256:${'f'.repeat(64)}` as const }],
      };
      await expect(repository.saveAdoption({ state: invalid, expectedAbsent: true })).resolves.toBe(
        'CONFLICT',
      );
      expect(await repository.saveAdoption({ state: valid, expectedAbsent: true })).toBe('CREATED');
      await expect(
        client.trainingSupportSkillVersion.update({
          where: { id: valid.versions[0]!.skillVersionId },
          data: { steps: ['改ざん'] },
        }),
      ).rejects.toThrow();
    });
  });
}
