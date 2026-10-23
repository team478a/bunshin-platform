import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import { GetAdminAlerts } from '@bunshin/application';
import {
  personalLearningDynamicProgramAllows,
  personalLearningFeatureEnabled,
  AI_TRAINING_LEARNING_DEFINITION_FIXTURES,
  validateSideHustleCandidateProposal,
  validateSideHustleRoadmapProposal,
  screenSideHustleCandidates,
} from '@bunshin/capability-training';
import {
  PrismaPersonalLearningPersonaRepository,
  PrismaPersonalLearningSavedExamplesRepository,
  PrismaPersonalLearningTopicRepository,
} from '../src/personal-learning-d';
import { PrismaPersonalLearningRequestRepository } from '../src/personal-learning-request';
import { PrismaSideHustleHearingRepository } from '../src/side-hustle-hearing';
import { PrismaPersonalLearningConversationRepository } from '../src/personal-learning-conversation';
import { PrismaPersonalLearningPersistenceRepository } from '../src/personal-learning-persistence';
import { PrismaTrainingPersonalDataExportRepository } from '../src/training-personal-data-export';
import { PrismaTrainingPersonalDataDeletionRepository } from '../src/training-personal-data-deletion';
import { PrismaTrainingRetentionExecutionRepository } from '../src/training-retention-execution';
import { PrismaTrainingRetentionCronRepository } from '../src/training-retention-cron';
import { PrismaTrainingAnswerRepository } from '../src/training-answer';
import {
  PrismaPersonalLearningNudgePreferenceRepository,
  updatePersonalLearningNudgePreferenceInTransaction,
} from '../src/personal-learning-nudge-preference';
import { PrismaAdminAlertRepository } from '../src/admin-alerts';
import { pilotParticipantHash } from '../src/personal-learning-pilot-seat';
import { cleanupProgramFixtures } from './program-fixture-cleanup';

const now = new Date('2026-10-17T03:00:00Z');

/** Called only inside the live disposable database integration suite. */
export function registerPersonalLearningDIntegrationCases(client: PrismaClient) {
  describe('PR-D-3 reviewed persona access and next-call AI projection', () => {
    const cleanup: Array<() => Promise<void>> = [];
    afterEach(async () => {
      await client.personalLearningLinePush.deleteMany();
      await client.personalLearningLineInbox.deleteMany();
      await client.personalLearningLineQuotaNotice.deleteMany();
      await client.personalLearningSavedExample.deleteMany();
      await client.personalLearningPersonaSuppression.deleteMany();
      await client.personalLearningPersonaItem.deleteMany();
      await client.personalLearningTopic.deleteMany();
      await cleanupProgramFixtures(client);
      for (const remove of cleanup.splice(0).reverse()) await remove();
    });

    async function serviceFixture(
      name: string,
      options: {
        multiTopic?: boolean;
        learningMode?: 'DYNAMIC_V1' | 'FIXED_DEFINITIONS_V1';
        workspaceId?: string;
        offerPolicy?: 'SIDE_HUSTLE_V1';
      } = {},
    ) {
      const multiTopic = options.multiTopic ?? true;
      const owner = await client.user.create({ data: { displayName: `${name} owner` } });
      const user = await client.user.create({ data: { displayName: `${name} learner` } });
      const workspace = options.workspaceId
        ? await client.workspace.findUniqueOrThrow({ where: { id: options.workspaceId } })
        : await client.workspace.create({
            data: { type: 'ORGANIZATION', name: `${name}-${randomUUID()}` },
          });
      const group = await client.group.create({ data: { workspaceId: workspace.id, name } });
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
          name,
          description: name,
          category: 'AI_TRAINING',
          targetAudience: 'integration test',
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
          displayName: name,
          description: name,
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
      const enrollmentId = randomUUID();
      await client.programEnrollment.create({
        data: {
          id: enrollmentId,
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
          startsAt: now,
        },
      });
      await client.serviceProgram.update({
        where: { id: program.id },
        data: {
          settings: {
            moduleKey: 'AI_TRAINING_V1',
            ...(options.offerPolicy ? { learningOfferPolicy: options.offerPolicy } : {}),
            trainingOperations: {
              notificationsEnabled: false,
              postponedReminderEnabled: false,
            },
            personalLearningPilot: {
              enabled: true,
              enrollmentIds: [enrollmentId],
              participantControl: {
                version: 'PILOT_PARTICIPANT_CAP_V1',
                revision: 1,
                externalParticipantCap: 5,
                internalParticipantCap: 0,
                currentWave: 1,
                currentWaveCap: 5,
              },
              learningMode: options.learningMode ?? 'DYNAMIC_V1',
              learningFeatures: {
                conversation: true,
                multiTopic,
                lineLearning: false,
                extendedScope: false,
              },
            },
          },
        },
      });
      await client.personalLearningPilotSeat.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          serviceProgramId: program.id,
          participantHash: pilotParticipantHash(program.id, user.id),
          programEnrollmentId: enrollmentId,
          kind: 'EXTERNAL',
          cohort: 'WAVE_1',
          seatNumber: 1,
        },
      });
      cleanup.push(async () => {
        await client.aiUsageEvent.deleteMany({
          where: { workspaceId: workspace.id, actorUserId: user.id },
        });
        await client.groupMembership.deleteMany({ where: { groupId: group.id } });
        await client.group.deleteMany({ where: { id: group.id } });
        if (!options.workspaceId)
          await client.workspace.deleteMany({ where: { id: workspace.id } });
        await client.user.deleteMany({ where: { id: { in: [owner.id, user.id] } } });
      });
      return {
        owner,
        user,
        workspace,
        group,
        member,
        program,
        offering,
        enrollmentId,
        scope: {
          workspaceId: workspace.id,
          groupId: group.id,
          programEnrollmentId: enrollmentId,
          groupMembershipId: member.id,
          userId: user.id,
        },
      };
    }

    async function lineConfigurationFixture(f: Awaited<ReturnType<typeof serviceFixture>>) {
      return client.groupLineChannelConfiguration.create({
        data: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          environment: 'DEVELOPMENT',
          version: 1,
          loginChannelId: `login-${randomUUID()}`,
          encryptedLoginSecret: 'integration-encrypted-secret',
          loginSecretMask: '****',
          messagingChannelId: `messaging-${randomUUID()}`,
          encryptedMessagingSecret: 'integration-encrypted-secret',
          messagingSecretMask: '****',
          encryptedAccessToken: 'integration-encrypted-token',
          accessTokenMask: '****',
          createdByUserId: f.owner.id,
        },
        select: { id: true },
      });
    }

    it('surfaces stale learning and nudge-specific reservations in the operations center', async () => {
      const f = await serviceFixture('PR-1230 stale admission alert');
      const admin = await client.user.create({ data: { displayName: 'PR-1230 operator' } });
      await client.platformAdmin.create({ data: { userId: admin.id, role: 'SUPER_ADMIN' } });
      const staleAt = new Date(now.getTime() - 16 * 60 * 1000);
      const freshAt = new Date(now.getTime() - 14 * 60 * 1000);
      const hashes = ['a', 'b', 'c', 'd'].map((letter) => letter.repeat(64));
      cleanup.push(async () => {
        await client.personalLearningCallAdmission.deleteMany({
          where: { operationHash: { in: hashes } },
        });
        await client.platformAdmin.deleteMany({ where: { userId: admin.id } });
        await client.user.deleteMany({ where: { id: admin.id } });
      });
      await client.personalLearningCallAdmission.createMany({
        data: [
          {
            workspaceId: f.scope.workspaceId,
            groupId: f.scope.groupId,
            serviceProgramId: f.program.id,
            operationHash: hashes[0]!,
            reservedCostUsdMicros: 50_000,
            admittedAt: staleAt,
            operationContext: { kind: 'LESSON_CANDIDATE' },
          },
          {
            workspaceId: f.scope.workspaceId,
            groupId: f.scope.groupId,
            serviceProgramId: f.program.id,
            operationHash: hashes[1]!,
            reservedCostUsdMicros: 50_000,
            admittedAt: staleAt,
            settledAt: new Date(now.getTime() - 15 * 60 * 1000),
            operationContext: { kind: 'CONVERSATION' },
          },
          {
            workspaceId: f.scope.workspaceId,
            groupId: f.scope.groupId,
            serviceProgramId: f.program.id,
            operationHash: hashes[2]!,
            reservedCostUsdMicros: 50_000,
            admittedAt: freshAt,
            operationContext: { kind: 'NUDGE' },
          },
          {
            workspaceId: f.scope.workspaceId,
            groupId: f.scope.groupId,
            serviceProgramId: f.program.id,
            operationHash: hashes[3]!,
            reservedCostUsdMicros: 50_000,
            admittedAt: staleAt,
            operationContext: { kind: 'NUDGE' },
          },
        ],
      });
      const center = await new GetAdminAlerts(new PrismaAdminAlertRepository(client)).execute({
        actorUserId: admin.id,
        environment: 'DEVELOPMENT',
        now,
      });
      expect(center.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'AI_PERSONAL_LEARNING_OPEN_ADMISSIONS',
            count: 2,
            severity: 'WARNING',
          }),
        ]),
      );
      const serialized = JSON.stringify(center.alerts);
      expect(serialized).not.toContain(hashes[0]);
      expect(serialized).not.toContain(f.program.id);
    });

    it('keeps rejected inferences rejected and prevents cross-service/workspace/user access', async () => {
      const first = await serviceFixture('PR-D-1 first service');
      const second = await serviceFixture('PR-D-1 other workspace');
      const sameWorkspaceOtherService = await serviceFixture('PR-D-1 other service', {
        workspaceId: first.workspace.id,
      });
      const featureOff = await serviceFixture('PR-D-1 feature off', { multiTopic: false });
      const fixedPath = await serviceFixture('PR-D-1 fixed path', {
        learningMode: 'FIXED_DEFINITIONS_V1',
      });
      const otherUser = await client.user.create({
        data: { displayName: 'PR-D-1 same service other user' },
      });
      const otherMembership = await client.groupMembership.create({
        data: {
          workspaceId: first.workspace.id,
          groupId: first.group.id,
          userId: otherUser.id,
          serviceRole: 'PARTICIPANT',
          status: 'ACTIVE',
          consentedAt: now,
        },
      });
      cleanup.push(async () => {
        await client.groupMembership.deleteMany({ where: { id: otherMembership.id } });
        await client.user.deleteMany({ where: { id: otherUser.id } });
      });
      const otherEnrollmentId = randomUUID();
      await client.programEnrollment.create({
        data: {
          id: otherEnrollmentId,
          workspaceId: first.workspace.id,
          groupId: first.group.id,
          groupMembershipId: otherMembership.id,
          serviceProgramId: first.program.id,
          programOfferingId: first.offering.id,
          status: 'ACTIVE',
          supportMode: 'GUIDED',
          goalSnapshot: {},
          offeringSnapshot: {},
          invitedByUserId: first.owner.id,
          startsAt: now,
        },
      });
      const currentProgram = await client.serviceProgram.findUnique({
        where: { id: first.program.id },
        select: { settings: true },
      });
      if (!currentProgram) throw new Error('integration test program disappeared');
      const currentSettings = currentProgram.settings as Record<string, unknown>;
      const pilot = currentSettings.personalLearningPilot as Record<string, unknown>;
      await client.serviceProgram.update({
        where: { id: first.program.id },
        data: {
          settings: {
            ...currentSettings,
            personalLearningPilot: {
              ...pilot,
              enrollmentIds: [first.enrollmentId, otherEnrollmentId],
            },
          },
        },
      });
      const sameServiceOtherUser = {
        ...first.scope,
        programEnrollmentId: otherEnrollmentId,
        groupMembershipId: otherMembership.id,
        userId: otherUser.id,
      };

      const topics = new PrismaPersonalLearningTopicRepository(client);
      expect(await topics.list(featureOff.scope)).toBeNull();
      expect(await topics.create(featureOff.scope, { title: 'Must not be stored' })).toMatchObject({
        outcome: 'NOT_FOUND',
      });
      expect(await topics.list(fixedPath.scope)).toBeNull();
      expect(await topics.create(fixedPath.scope, { title: 'Must not be stored' })).toMatchObject({
        outcome: 'NOT_FOUND',
      });
      const freshProgram = await client.serviceProgram.findUniqueOrThrow({
        where: { id: first.program.id },
        select: { settings: true },
      });
      expect(personalLearningDynamicProgramAllows(freshProgram.settings, first.enrollmentId)).toBe(
        true,
      );
      expect(personalLearningFeatureEnabled(freshProgram.settings, 'multiTopic')).toBe(true);
      expect(await topics.list(first.scope)).not.toBeNull();
      const created = await topics.create(first.scope, { title: 'Private topic' });
      expect(created.outcome).toBe('CREATED');
      if (created.outcome !== 'CREATED') throw new Error('test topic not created');
      expect(await topics.list(sameServiceOtherUser)).toEqual([]);
      expect(await topics.list(second.scope)).toEqual([]);
      expect(await topics.list(sameWorkspaceOtherService.scope)).toEqual([]);
      expect(
        await topics.setStatus(sameServiceOtherUser, created.topic.id, 'COMPLETED'),
      ).toBeNull();
      expect(await topics.setStatus(second.scope, created.topic.id, 'COMPLETED')).toBeNull();
      expect(
        await topics.setStatus(sameWorkspaceOtherService.scope, created.topic.id, 'COMPLETED'),
      ).toBeNull();

      const persona = new PrismaPersonalLearningPersonaRepository(client);
      expect(await persona.list(featureOff.scope)).toEqual([]);
      expect(await persona.list(fixedPath.scope)).toEqual([]);
      expect(
        await persona.setOptIn(first.scope, { enabled: true, consentVersion: 'test-v1' }),
      ).toMatchObject({ profile: { optedIn: true } });
      expect(
        await persona.saveLearnerProfile(first.scope, {
          companyName: 'Example Works',
          ageBand: '30代',
          industryJob: '商品企画',
        }),
      ).toMatchObject({ outcome: 'SAVED' });
      expect(
        await persona.saveLearnerProfile(first.scope, {
          companyName: '東京都渋谷区1丁目2番地',
          ageBand: '30代',
          industryJob: null,
        }),
      ).toEqual({ outcome: 'INVALID' });
      expect(
        await persona.saveLearnerProfile(first.scope, {
          companyName: null,
          ageBand: '10代以下',
          industryJob: null,
        }),
      ).toEqual({ outcome: 'INVALID' });
      const disallowedValues: [string, string][] = [
        ['learning_purpose', '私は糖尿病と診断されました'],
        ['learning_purpose', '同僚の田中さんはAIが得意です'],
        ['learning_purpose', '東京都渋谷区1丁目2番地'],
        ['learning_purpose', '090-1234-5678'],
        ['company_name', 'AIを学びたい'],
      ];
      for (const [attributeKey, value] of disallowedValues) {
        expect(
          await persona.save(first.scope, {
            attributeKey,
            value,
            evidenceType: 'LEARNING_REQUEST',
            evidenceId: randomUUID(),
            evidenceCreatedAt: now,
          }),
        ).toMatchObject({ outcome: 'INVALID' });
      }
      expect(await persona.listForAi(first.scope)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            attributeKey: 'company_name',
            epistemicStatus: 'LEARNER_CONFIRMED',
          }),
          expect.objectContaining({
            attributeKey: 'age_band',
            epistemicStatus: 'LEARNER_CONFIRMED',
          }),
          expect.objectContaining({
            attributeKey: 'industry_job',
            epistemicStatus: 'LEARNER_CONFIRMED',
          }),
        ]),
      );
      expect(await persona.profile(sameServiceOtherUser)).toBeNull();
      expect(await persona.profile(sameWorkspaceOtherService.scope)).toBeNull();
      expect(await persona.profile(second.scope)).toBeNull();
      expect(await persona.setOptIn(first.scope, { enabled: false })).toMatchObject({
        profile: { optedIn: false },
      });
      expect(await persona.listForAi(first.scope)).toEqual([]);
      expect(
        await persona.setOptIn(first.scope, { enabled: true, consentVersion: 'test-v1' }),
      ).toMatchObject({ profile: { optedIn: true } });
      const evidenceId = randomUUID();
      const rejected = await client.personalLearningPersonaItem.create({
        data: {
          workspaceId: first.scope.workspaceId,
          groupId: first.scope.groupId,
          groupMembershipId: first.scope.groupMembershipId,
          userId: first.scope.userId,
          attributeKey: 'explanation_style',
          value: 'visual examples',
          status: 'REJECTED',
          evidenceType: 'LEARNING_REQUEST',
          evidenceId,
          evidenceCreatedAt: now,
        },
      });
      const saveRejected = await persona.save(first.scope, {
        attributeKey: 'explanation_style',
        value: 'visual examples inferred again',
        evidenceType: 'LEARNING_REQUEST',
        evidenceId: randomUUID(),
        evidenceCreatedAt: now,
      });
      expect(saveRejected.outcome).toBe('REJECTED');
      expect(
        await client.personalLearningPersonaItem.findUnique({ where: { id: rejected.id } }),
      ).toMatchObject({
        status: 'REJECTED',
        value: 'visual examples',
        evidenceId,
      });
      expect(await persona.list(sameServiceOtherUser)).toEqual([]);
      expect(await persona.list(second.scope)).toEqual([]);
      expect(await persona.list(sameWorkspaceOtherService.scope)).toEqual([]);
      expect(
        await persona.review(sameServiceOtherUser, rejected.id, { status: 'CONFIRMED' }),
      ).toMatchObject({
        outcome: 'NOT_FOUND',
      });
      expect(
        await persona.review(second.scope, rejected.id, { status: 'CONFIRMED' }),
      ).toMatchObject({ outcome: 'NOT_FOUND' });
      expect(await persona.delete(second.scope, rejected.id)).toBe(false);
      expect(await persona.delete(sameWorkspaceOtherService.scope, rejected.id)).toBe(false);
      await client.personalLearningPersonaItem.createMany({
        data: ['learning_purpose', 'ai_tool_familiarity', 'learning_pace'].map(
          (attributeKey, index) => ({
            workspaceId: first.scope.workspaceId,
            groupId: first.scope.groupId,
            groupMembershipId: first.scope.groupMembershipId,
            userId: first.scope.userId,
            attributeKey,
            value: `Inference ${index}`,
            status: 'UNCONFIRMED' as const,
            evidenceType: 'LEARNING_REQUEST' as const,
            evidenceId: randomUUID(),
            evidenceCreatedAt: now,
            updatedAt: new Date(now.getTime() + index * 1_000),
          }),
        ),
      });
      const confirmed = await client.personalLearningPersonaItem.createMany({
        data: ['stated_goal'].map((attributeKey, index) => ({
          workspaceId: first.scope.workspaceId,
          groupId: first.scope.groupId,
          groupMembershipId: first.scope.groupMembershipId,
          userId: first.scope.userId,
          attributeKey,
          value: `Confirmed ${index}`,
          status: 'CONFIRMED' as const,
          evidenceType: 'LEARNING_REQUEST' as const,
          evidenceId: randomUUID(),
          evidenceCreatedAt: now,
          updatedAt: new Date(now.getTime() + 100_000 + index * 1_000),
        })),
      });
      expect(confirmed.count).toBe(1);
      for (const [attributeKey, value] of [
        ['learning_purpose', '毎日がんばりたい'],
        ['ai_tool_familiarity', '取引先への提案資料を作りたい'],
      ] as const) {
        expect(
          await persona.save(first.scope, {
            attributeKey,
            value,
            evidenceType: 'LEARNING_REQUEST',
            evidenceId: randomUUID(),
            evidenceCreatedAt: now,
          }),
        ).toMatchObject({ outcome: 'SAVED' });
      }
      const aiIntake = await persona.listForAi(first.scope);
      expect(aiIntake.length).toBeLessThanOrEqual(20);
      expect(aiIntake).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ attributeKey: 'learning_purpose', value: '毎日がんばりたい' }),
          expect.objectContaining({
            attributeKey: 'ai_tool_familiarity',
            value: '取引先への提案資料を作りたい',
          }),
        ]),
      );
      expect(aiIntake.some((item) => item.attributeKey === 'explanation_style')).toBe(false);
      expect(aiIntake[0]?.attributeKey).toBe('company_name');

      const rejectedNext = await client.personalLearningPersonaItem.findUniqueOrThrow({
        where: {
          workspaceId_groupId_groupMembershipId_attributeKey: {
            workspaceId: first.scope.workspaceId,
            groupId: first.scope.groupId,
            groupMembershipId: first.scope.groupMembershipId,
            attributeKey: 'learning_purpose',
          },
        },
      });
      await persona.review(first.scope, rejectedNext.id, { status: 'REJECTED' });
      expect(await persona.listForAi(first.scope)).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ attributeKey: 'learning_purpose' })]),
      );

      const deletedNext = await client.personalLearningPersonaItem.findUniqueOrThrow({
        where: {
          workspaceId_groupId_groupMembershipId_attributeKey: {
            workspaceId: first.scope.workspaceId,
            groupId: first.scope.groupId,
            groupMembershipId: first.scope.groupMembershipId,
            attributeKey: 'ai_tool_familiarity',
          },
        },
      });
      expect(await persona.delete(first.scope, deletedNext.id)).toBe(true);
      expect(
        await client.personalLearningPersonaItem.findUnique({ where: { id: deletedNext.id } }),
      ).toBeNull();
      expect(
        await client.personalLearningPersonaSuppression.findUnique({
          where: {
            workspaceId_groupId_groupMembershipId_attributeKey: {
              workspaceId: first.scope.workspaceId,
              groupId: first.scope.groupId,
              groupMembershipId: first.scope.groupMembershipId,
              attributeKey: 'ai_tool_familiarity',
            },
          },
        }),
      ).toMatchObject({
        workspaceId: first.scope.workspaceId,
        groupId: first.scope.groupId,
        groupMembershipId: first.scope.groupMembershipId,
        userId: first.scope.userId,
        attributeKey: 'ai_tool_familiarity',
      });
      const deletedRetry = await persona.save(first.scope, {
        attributeKey: 'ai_tool_familiarity',
        value: 'should not be persisted after deletion',
        evidenceType: 'LEARNING_REQUEST',
        evidenceId: randomUUID(),
        evidenceCreatedAt: now,
      });
      expect(deletedRetry).toEqual({ outcome: 'SUPPRESSED' });
      expect(await persona.listForAi(first.scope)).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ attributeKey: 'ai_tool_familiarity' })]),
      );
      expect(await persona.listSuppressedAttributes(first.scope)).toContain('ai_tool_familiarity');
      expect(await persona.listSuppressedAttributes(sameServiceOtherUser)).not.toContain(
        'ai_tool_familiarity',
      );
      expect(await persona.listSuppressedAttributes(sameWorkspaceOtherService.scope)).not.toContain(
        'ai_tool_familiarity',
      );
      expect(await persona.allowReinference(sameServiceOtherUser, 'ai_tool_familiarity')).toBe(
        false,
      );
      expect(
        await persona.allowReinference(sameWorkspaceOtherService.scope, 'ai_tool_familiarity'),
      ).toBe(false);
      expect(await persona.allowReinference(first.scope, 'ai_tool_familiarity')).toBe(true);
      expect(await persona.listSuppressedAttributes(first.scope)).not.toContain(
        'ai_tool_familiarity',
      );
      const allowedRetry = await persona.save(first.scope, {
        attributeKey: 'ai_tool_familiarity',
        value: 're-created only after learner permission',
        evidenceType: 'LEARNING_REQUEST',
        evidenceId: randomUUID(),
        evidenceCreatedAt: now,
      });
      expect(allowedRetry.outcome).toBe('SAVED');
      expect(await persona.listForAi(first.scope)).toEqual(
        expect.arrayContaining([expect.objectContaining({ attributeKey: 'ai_tool_familiarity' })]),
      );

      const examples = new PrismaPersonalLearningSavedExamplesRepository(client);
      expect(await examples.list(featureOff.scope)).toEqual([]);
      expect(await examples.list(fixedPath.scope)).toEqual([]);
      const saved = await examples.save(first.scope, {
        title: 'Private example',
        content: 'Only the owning learner can read this.',
        sourceType: 'PRACTICE_ANSWER',
        sourceId: randomUUID(),
      });
      expect(saved.outcome).toBe('SAVED');
      if (saved.outcome !== 'SAVED') throw new Error('test example not saved');
      expect(await examples.list(sameServiceOtherUser)).toEqual([]);
      expect(await examples.list(second.scope)).toEqual([]);
      expect(await examples.list(sameWorkspaceOtherService.scope)).toEqual([]);
      expect(await examples.delete(sameServiceOtherUser, saved.item.id)).toBe(false);
      expect(await examples.delete(second.scope, saved.item.id)).toBe(false);
      expect(await examples.delete(sameWorkspaceOtherService.scope, saved.item.id)).toBe(false);
      expect(await examples.list(first.scope)).toHaveLength(1);
    });

    it('allows opted-in persona use on dynamic single-topic programs with multiTopic OFF', async () => {
      const f = await serviceFixture('PR-D-3b single topic without multiTopic', {
        multiTopic: false,
      });
      const persona = new PrismaPersonalLearningPersonaRepository(client);
      expect(
        await persona.setOptIn(f.scope, { enabled: true, consentVersion: 'test-v1' }),
      ).toMatchObject({ profile: { optedIn: true } });
      expect(
        await persona.save(f.scope, {
          attributeKey: 'learning_purpose',
          value: '業務でAIを活用したい',
          evidenceType: 'CONVERSATION_EVENT',
          evidenceId: randomUUID(),
          evidenceCreatedAt: now,
        }),
      ).toMatchObject({ outcome: 'SAVED' });
      expect(await persona.listForAi(f.scope)).toEqual(
        expect.arrayContaining([expect.objectContaining({ attributeKey: 'learning_purpose' })]),
      );
    });

    it('exports and learner-deletes topic, persona, suppression, and saved-example data', async () => {
      const f = await serviceFixture('PR-D-4 export and delete');
      const topic = await new PrismaPersonalLearningTopicRepository(client).create(f.scope, {
        title: '本人の学習テーマ',
      });
      if (topic.outcome !== 'CREATED') throw new Error('topic fixture creation failed');
      const persona = new PrismaPersonalLearningPersonaRepository(client);
      await persona.setOptIn(f.scope, { enabled: true, consentVersion: 'test-v1' });
      await persona.saveLearnerProfile(f.scope, {
        companyName: 'Example Works',
        ageBand: '30代',
        industryJob: '商品企画',
      });
      const inferred = await persona.save(f.scope, {
        attributeKey: 'explanation_style',
        value: '短い例で学びたい',
        evidenceType: 'LEARNING_REQUEST',
        evidenceId: randomUUID(),
        evidenceCreatedAt: now,
      });
      if (inferred.outcome !== 'SAVED' || !inferred.item)
        throw new Error('persona fixture creation failed');
      expect(await persona.delete(f.scope, inferred.item.id)).toBe(true);
      const example = await new PrismaPersonalLearningSavedExamplesRepository(client).save(
        f.scope,
        {
          title: '使い回せる手本',
          content: '自分で保存した例文',
          sourceType: 'LEARNER_AUTHORED',
          sourceId: randomUUID(),
        },
      );
      if (example.outcome !== 'SAVED') throw new Error('saved example fixture creation failed');
      const configuration = await lineConfigurationFixture(f);
      const configurationId = configuration.id;
      const textEventId = `line-text-${randomUUID()}`;
      const imageEventId = `line-image-${randomUUID()}`;
      await client.personalLearningLineInbox.createMany({
        data: [
          {
            workspaceId: f.scope.workspaceId,
            groupId: f.scope.groupId,
            programEnrollmentId: f.scope.programEnrollmentId,
            groupMembershipId: f.scope.groupMembershipId,
            userId: f.scope.userId,
            configurationId,
            providerEventId: textEventId,
            messageType: 'TEXT',
            text: 'LINEで送った学習相談',
            createdAt: now,
          },
          {
            workspaceId: f.scope.workspaceId,
            groupId: f.scope.groupId,
            programEnrollmentId: f.scope.programEnrollmentId,
            groupMembershipId: f.scope.groupMembershipId,
            userId: f.scope.userId,
            configurationId,
            providerEventId: imageEventId,
            messageType: 'IMAGE',
            lineMessageId: `image-${randomUUID()}`,
            imageMimeType: 'image/jpeg',
            imageSha256: 'a'.repeat(64),
            imageSizeBytes: 3,
            imageBytes: new Uint8Array([1, 2, 3]),
            createdAt: now,
          },
        ],
      });
      await client.personalLearningLinePush.create({
        data: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          programEnrollmentId: f.scope.programEnrollmentId,
          groupMembershipId: f.scope.groupMembershipId,
          userId: f.scope.userId,
          configurationId,
          providerEventId: textEventId,
          retryKey: randomUUID(),
          text: 'Web画面で続けられます',
        },
      });
      await client.personalLearningLinePush.create({
        data: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          programEnrollmentId: f.scope.programEnrollmentId,
          groupMembershipId: f.scope.groupMembershipId,
          userId: f.scope.userId,
          configurationId,
          providerEventId: `nudge:${f.enrollmentId}:2026-07-18:NEW_LEARNER_STALLED`,
          purpose: 'NUDGE',
          retryKey: randomUUID(),
          text: '期限後に削除する固定声かけ',
          createdAt: now,
        },
      });
      await client.personalLearningNudgePreference.create({
        data: {
          ...f.scope,
          enabled: false,
          consentVersion: 'AI_TRAINING_EXTERNAL_AI_V3',
          consentedAt: now,
          stoppedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      });
      const nudgeAuditKey = `nudge-audit-${randomUUID()}`;
      await client.programActionEvent.create({
        data: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          programEnrollmentId: f.scope.programEnrollmentId,
          eventType: 'PERSONAL_LEARNING_NUDGE_SENT',
          idempotencyKey: nudgeAuditKey,
          metadata: {
            situation: 'NEW_LEARNER_STALLED',
            judgmentDate: '2026-07-18',
            channel: 'LINE',
          },
          actorUserId: f.scope.userId,
          occurredAt: now,
        },
      });
      const scope = {
        workspaceId: f.scope.workspaceId,
        groupId: f.scope.groupId,
        programEnrollmentId: f.scope.programEnrollmentId,
        actorUserId: f.scope.userId,
      };
      const exported = await new PrismaTrainingPersonalDataExportRepository(client).read(scope);
      expect(exported.outcome).toBe('FOUND');
      if (exported.outcome !== 'FOUND') throw new Error('personal export missing');
      expect(exported.data.dynamicLearning).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'TOPIC', title: '本人の学習テーマ' }),
          expect.objectContaining({ kind: 'PERSONA_REINFERENCE_SUPPRESSION' }),
          expect.objectContaining({
            kind: 'PERSONA_PROFILE',
            optedIn: true,
            companyName: 'Example Works',
          }),
          expect.objectContaining({ kind: 'SAVED_EXAMPLE', content: '自分で保存した例文' }),
        ]),
      );
      expect(exported.data.personalLearning).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'LINE_INBOUND', text: 'LINEで送った学習相談' }),
          expect.objectContaining({
            kind: 'LINE_INBOUND',
            messageType: 'IMAGE',
            imageBase64: 'AQID',
          }),
          expect.objectContaining({ kind: 'LINE_OUTBOUND', text: 'Web画面で続けられます' }),
          expect.objectContaining({ kind: 'LINE_OUTBOUND', text: '期限後に削除する固定声かけ' }),
          expect.objectContaining({
            kind: 'LINE_NUDGE_PREFERENCE',
            consentVersion: 'AI_TRAINING_EXTERNAL_AI_V3',
          }),
        ]),
      );

      const deletion = new PrismaTrainingPersonalDataDeletionRepository(client);
      const preview = await deletion.preview({ ...scope, target: { kind: 'ALL' } });
      if (preview.outcome !== 'PREVIEW') throw new Error('deletion preview missing');
      expect(preview.preview.counts.dynamicLearningData).toBe(8);
      expect(
        await deletion.delete({
          ...scope,
          target: { kind: 'ALL' },
          revision: preview.preview.revision,
          now,
        }),
      ).toMatchObject({ outcome: 'DELETED' });
      expect(await client.personalLearningTopic.count({ where: { groupId: f.group.id } })).toBe(0);
      expect(
        await client.personalLearningPersonaItem.count({ where: { groupId: f.group.id } }),
      ).toBe(0);
      expect(
        await client.personalLearningPersonaSuppression.count({ where: { groupId: f.group.id } }),
      ).toBe(0);
      expect(
        await client.personalLearningSavedExample.count({ where: { groupId: f.group.id } }),
      ).toBe(0);
      expect(
        await client.personalLearningPersonaProfile.count({ where: { groupId: f.group.id } }),
      ).toBe(0);
      expect(await client.personalLearningLineInbox.count({ where: { groupId: f.group.id } })).toBe(
        0,
      );
      expect(await client.personalLearningLinePush.count({ where: { groupId: f.group.id } })).toBe(
        0,
      );
      expect(
        await client.programActionEvent.count({
          where: { groupId: f.group.id, idempotencyKey: nudgeAuditKey },
        }),
      ).toBe(0);
    });

    it('deduplicates each LINE event and rejects cross-workspace inbox ownership', async () => {
      const first = await serviceFixture('PR-F LINE scope first');
      const otherWorkspace = await serviceFixture('PR-F LINE scope other');
      const configuration = await lineConfigurationFixture(first);
      const providerEventId = `line-event-${randomUUID()}`;
      const row = {
        workspaceId: first.scope.workspaceId,
        groupId: first.scope.groupId,
        programEnrollmentId: first.scope.programEnrollmentId,
        groupMembershipId: first.scope.groupMembershipId,
        userId: first.scope.userId,
        configurationId: configuration.id,
        providerEventId,
        messageType: 'TEXT',
        text: 'スコープ検査用本文',
      };
      await client.personalLearningLineInbox.create({ data: row });
      await expect(client.personalLearningLineInbox.create({ data: row })).rejects.toMatchObject({
        code: 'P2002',
      });
      await expect(
        client.personalLearningLineInbox.create({
          data: {
            ...row,
            workspaceId: otherWorkspace.scope.workspaceId,
            groupId: otherWorkspace.scope.groupId,
            programEnrollmentId: otherWorkspace.scope.programEnrollmentId,
            groupMembershipId: otherWorkspace.scope.groupMembershipId,
            userId: otherWorkspace.scope.userId,
            providerEventId: `cross-scope-${randomUUID()}`,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('records learner nudge stop/pause controls in the exact enrollment scope without message content', async () => {
      const f = await serviceFixture('PR-N-1 nudge preferences');
      const repo = new PrismaPersonalLearningNudgePreferenceRepository(client);
      const actor = { scope: f.scope, actorUserId: f.scope.userId };
      const enabled = await repo.update(actor, {
        action: 'ENABLE',
        now,
        consentVersion: 'AI_TRAINING_EXTERNAL_AI_V3',
      });
      expect(enabled).toMatchObject({
        enabled: true,
        consentVersion: 'AI_TRAINING_EXTERNAL_AI_V3',
      });
      const pausedAt = new Date(now.getTime() + 1_000);
      await repo.update(actor, {
        action: 'PAUSE',
        now: pausedAt,
        consentedAt: now,
        pauseUntil: new Date(pausedAt.getTime() + 7 * 86_400_000),
        consentVersion: 'AI_TRAINING_EXTERNAL_AI_V3',
      });
      expect(await repo.read(actor)).toMatchObject({
        enabled: true,
        consentedAt: now,
        pausedUntil: new Date(pausedAt.getTime() + 7 * 86_400_000),
      });
      const stoppedAt = new Date(pausedAt.getTime() + 1_000);
      await repo.update(actor, {
        action: 'STOP',
        now: stoppedAt,
        consentedAt: now,
        consentVersion: 'AI_TRAINING_EXTERNAL_AI_V3',
      });
      expect(await repo.read(actor)).toMatchObject({ enabled: false, consentedAt: now, stoppedAt });
      const lineResumeAt = new Date(stoppedAt.getTime() + 1_000);
      await client.$transaction((tx) =>
        updatePersonalLearningNudgePreferenceInTransaction(tx, actor, {
          action: 'RESUME',
          now: lineResumeAt,
          consentedAt: now,
          consentVersion: 'AI_TRAINING_EXTERNAL_AI_V3',
          idempotencyKey: `learning-nudge-line:${randomUUID()}`,
          channel: 'LINE',
        }),
      );
      expect(await repo.read(actor)).toMatchObject({
        enabled: true,
        consentedAt: now,
        stoppedAt: null,
      });
      const operations = await client.programActionEvent.findMany({
        where: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          programEnrollmentId: f.enrollmentId,
          eventType: 'PERSONAL_LEARNING_NUDGE_PREFERENCE_UPDATED',
        },
        select: { metadata: true },
        orderBy: { occurredAt: 'asc' },
      });
      expect(
        operations
          .map(({ metadata }) => metadata)
          .map((metadata) => (metadata as { action: string }).action),
      ).toEqual(['ENABLE', 'PAUSE', 'STOP', 'RESUME']);
      expect(operations.map(({ metadata }) => metadata)).toEqual(
        expect.arrayContaining([expect.objectContaining({ action: 'RESUME', channel: 'LINE' })]),
      );
      expect(JSON.stringify(operations)).not.toContain('text');
      expect(
        await repo.read({ ...actor, scope: { ...f.scope, workspaceId: randomUUID() } }),
      ).toBeNull();
    });

    it('retains nudge preferences through content expiry, then removes them at the summary deadline', async () => {
      const f = await serviceFixture('PR-F retention', { multiTopic: false });
      await client.platformAdmin.create({
        data: { userId: f.owner.id, role: 'SUPER_ADMIN', status: 'ACTIVE' },
      });
      cleanup.push(async () => {
        await client.platformAdmin.deleteMany({ where: { userId: f.owner.id } });
      });
      const endedAt = new Date(now.getTime() - 91 * 86_400_000);
      const startsAt = new Date(endedAt.getTime() - 30 * 86_400_000);
      await client.programEnrollment.update({
        where: { id: f.enrollmentId },
        data: { status: 'COMPLETED', startsAt, endsAt: endedAt },
      });
      await client.trainingDataRetentionState.upsert({
        where: { programEnrollmentId: f.enrollmentId },
        create: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          programEnrollmentId: f.enrollmentId,
          endedAt,
        },
        update: { endedAt },
      });
      const configuration = await lineConfigurationFixture(f);
      const configurationId = configuration.id;
      const textEventId = `line-text-${randomUUID()}`;
      const imageEventId = `line-image-${randomUUID()}`;
      await client.personalLearningLineInbox.createMany({
        data: [
          {
            workspaceId: f.scope.workspaceId,
            groupId: f.scope.groupId,
            programEnrollmentId: f.scope.programEnrollmentId,
            groupMembershipId: f.scope.groupMembershipId,
            userId: f.scope.userId,
            configurationId,
            providerEventId: textEventId,
            messageType: 'TEXT',
            text: '期限後に削除する本文',
            createdAt: startsAt,
          },
          {
            workspaceId: f.scope.workspaceId,
            groupId: f.scope.groupId,
            programEnrollmentId: f.scope.programEnrollmentId,
            groupMembershipId: f.scope.groupMembershipId,
            userId: f.scope.userId,
            configurationId,
            providerEventId: imageEventId,
            messageType: 'IMAGE',
            lineMessageId: `image-${randomUUID()}`,
            imageMimeType: 'image/jpeg',
            imageSha256: 'b'.repeat(64),
            imageSizeBytes: 3,
            imageBytes: new Uint8Array([4, 5, 6]),
            createdAt: new Date(now.getTime() - 91 * 86_400_000),
          },
        ],
      });
      await client.personalLearningLinePush.create({
        data: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          programEnrollmentId: f.scope.programEnrollmentId,
          groupMembershipId: f.scope.groupMembershipId,
          userId: f.scope.userId,
          configurationId,
          providerEventId: textEventId,
          retryKey: randomUUID(),
          text: '本文への回答',
        },
      });
      await client.personalLearningLinePush.create({
        data: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          programEnrollmentId: f.scope.programEnrollmentId,
          groupMembershipId: f.scope.groupMembershipId,
          userId: f.scope.userId,
          configurationId,
          providerEventId: `nudge:${f.enrollmentId}:2026-07-18:NEW_LEARNER_STALLED`,
          purpose: 'NUDGE',
          retryKey: randomUUID(),
          text: '期限後に削除する固定声かけ',
          createdAt: startsAt,
        },
      });
      await client.personalLearningNudgePreference.create({
        data: {
          ...f.scope,
          enabled: false,
          consentVersion: 'AI_TRAINING_EXTERNAL_AI_V3',
          consentedAt: startsAt,
          stoppedAt: startsAt,
          createdAt: startsAt,
          updatedAt: startsAt,
        },
      });
      const retention = new PrismaTrainingRetentionExecutionRepository(client);
      const input = {
        workspaceId: f.scope.workspaceId,
        groupId: f.scope.groupId,
        programEnrollmentId: f.scope.programEnrollmentId,
        operatorUserId: f.owner.id,
        now,
      };
      const preview = await retention.preview(input);
      if (preview.outcome !== 'PREVIEW') throw new Error('retention preview missing');
      expect(preview.preview.counts.lineMessages).toBe(2);
      expect(preview.preview.counts.lineNudgeMessages).toBe(1);
      expect(preview.preview.counts.learningNudgePreferences).toBe(0);
      expect(
        await retention.execute({ ...input, revision: preview.preview.revision }),
      ).toMatchObject({
        outcome: 'APPLIED',
        counts: { lineMessages: 2, lineNudgeMessages: 1, learningNudgePreferences: 0 },
      });
      expect(await client.personalLearningLineInbox.count({ where: { groupId: f.group.id } })).toBe(
        0,
      );
      expect(await client.personalLearningLinePush.count({ where: { groupId: f.group.id } })).toBe(
        0,
      );
      expect(
        await client.personalLearningNudgePreference.count({ where: { groupId: f.group.id } }),
      ).toBe(1);

      const summaryInput = { ...input, now: new Date(now.getTime() + 275 * 86_400_000) };
      const summaryPreview = await retention.preview(summaryInput);
      if (summaryPreview.outcome !== 'PREVIEW')
        throw new Error('summary retention preview missing');
      expect(summaryPreview.preview.counts.learningNudgePreferences).toBe(1);
      expect(
        await retention.execute({ ...summaryInput, revision: summaryPreview.preview.revision }),
      ).toMatchObject({
        outcome: 'APPLIED',
        counts: { learningNudgePreferences: 1 },
      });
      expect(
        await client.personalLearningNudgePreference.count({ where: { groupId: f.group.id } }),
      ).toBe(0);
    });

    it('cron retention is preview-only by default and deletes only due rows inside the configured Program', async () => {
      const f = await serviceFixture('PR-F cron retention target', { multiTopic: false });
      const other = await serviceFixture('PR-F cron retention other Program', {
        multiTopic: false,
        workspaceId: f.workspace.id,
      });
      await client.platformAdmin.create({
        data: { userId: f.owner.id, role: 'SUPER_ADMIN', status: 'ACTIVE' },
      });
      cleanup.push(async () => {
        await client.platformAdmin.deleteMany({ where: { userId: f.owner.id } });
      });
      const firstConfig = await lineConfigurationFixture(f);
      const otherConfig = await lineConfigurationFixture(other);
      const oldImage = `old-${randomUUID()}`;
      const recentImage = `recent-${randomUUID()}`;
      const otherImage = `other-${randomUUID()}`;
      const imageRows = [
        {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          programEnrollmentId: f.enrollmentId,
          groupMembershipId: f.scope.groupMembershipId,
          userId: f.scope.userId,
          configurationId: firstConfig.id,
          providerEventId: oldImage,
          messageType: 'IMAGE' as const,
          lineMessageId: `line-${oldImage}`,
          imageMimeType: 'image/jpeg',
          imageSha256: 'a'.repeat(64),
          imageSizeBytes: 1,
          imageBytes: new Uint8Array([1]),
          createdAt: new Date(now.getTime() - 91 * 86_400_000),
        },
        {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          programEnrollmentId: f.enrollmentId,
          groupMembershipId: f.scope.groupMembershipId,
          userId: f.scope.userId,
          configurationId: firstConfig.id,
          providerEventId: recentImage,
          messageType: 'IMAGE' as const,
          lineMessageId: `line-${recentImage}`,
          imageMimeType: 'image/jpeg',
          imageSha256: 'c'.repeat(64),
          imageSizeBytes: 1,
          imageBytes: new Uint8Array([2]),
          createdAt: new Date(now.getTime() - 10 * 86_400_000),
        },
        {
          workspaceId: other.scope.workspaceId,
          groupId: other.scope.groupId,
          programEnrollmentId: other.enrollmentId,
          groupMembershipId: other.scope.groupMembershipId,
          userId: other.scope.userId,
          configurationId: otherConfig.id,
          providerEventId: otherImage,
          messageType: 'IMAGE' as const,
          lineMessageId: `line-${otherImage}`,
          imageMimeType: 'image/jpeg',
          imageSha256: 'd'.repeat(64),
          imageSizeBytes: 1,
          imageBytes: new Uint8Array([3]),
          createdAt: new Date(now.getTime() - 91 * 86_400_000),
        },
      ];
      await client.personalLearningLineInbox.createMany({ data: imageRows });
      await client.personalLearningLineInbox.create({
        data: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          programEnrollmentId: f.enrollmentId,
          groupMembershipId: f.scope.groupMembershipId,
          userId: f.scope.userId,
          configurationId: firstConfig.id,
          providerEventId: `text-${randomUUID()}`,
          messageType: 'TEXT',
          text: '保持対象の本文',
          createdAt: now,
        },
      });

      const runner = new PrismaTrainingRetentionCronRepository(client);
      const input = {
        scopes: [
          {
            workspaceId: f.scope.workspaceId,
            groupId: f.scope.groupId,
            serviceProgramId: f.program.id,
          },
        ],
        operatorUserId: f.owner.id,
        now,
      };
      expect(await runner.run({ ...input, executeEnabled: false })).toMatchObject({
        outcome: 'PREVIEW',
        counts: { practiceSupportImages: 0, lineMessages: 1 },
      });
      expect(await client.personalLearningLineInbox.count()).toBe(4);

      expect(await runner.run({ ...input, executeEnabled: true })).toMatchObject({
        outcome: 'APPLIED',
        counts: { practiceSupportImages: 0, lineMessages: 1 },
      });
      expect(
        await client.personalLearningLineInbox.findUnique({
          where: {
            configurationId_providerEventId: {
              configurationId: firstConfig.id,
              providerEventId: oldImage,
            },
          },
        }),
      ).toBeNull();
      expect(
        await client.personalLearningLineInbox.findUnique({
          where: {
            configurationId_providerEventId: {
              configurationId: firstConfig.id,
              providerEventId: recentImage,
            },
          },
        }),
      ).not.toBeNull();
      expect(
        await client.personalLearningLineInbox.findUnique({
          where: {
            configurationId_providerEventId: {
              configurationId: otherConfig.id,
              providerEventId: otherImage,
            },
          },
        }),
      ).not.toBeNull();
      expect(await runner.run({ ...input, executeEnabled: true })).toMatchObject({
        outcome: 'APPLIED',
        counts: { lineMessages: 0 },
      });
      expect(await client.personalLearningLineInbox.count()).toBe(3);
      expect(await client.personalLearningLineInbox.count({ where: { messageType: 'TEXT' } })).toBe(
        1,
      );
      const audit = await client.programAuditLog.findFirst({
        where: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          resourceId: f.enrollmentId,
          action: 'TRAINING_RETENTION_APPLIED',
        },
        orderBy: { performedAt: 'desc' },
      });
      expect(audit?.afterData).toMatchObject({
        executionSource: 'CRON',
        serviceProgramId: f.program.id,
      });
      expect(JSON.stringify(audit?.afterData)).not.toContain('保持対象の本文');
    });

    it('keeps each wish and conversation on its selected topic and rejects a cross-topic update', async () => {
      const fixture = await serviceFixture('PR-D-2 topic separation');
      const topicRepository = new PrismaPersonalLearningTopicRepository(client);
      const first = await topicRepository.create(fixture.scope, { title: '一つ目のテーマ' });
      const second = await topicRepository.create(fixture.scope, { title: '二つ目のテーマ' });
      if (first.outcome !== 'CREATED' || second.outcome !== 'CREATED')
        throw new Error('topic fixture creation failed');
      const requests = new PrismaPersonalLearningRequestRepository(client);
      const conversations = new PrismaPersonalLearningConversationRepository(client);
      const firstActor = {
        scope: fixture.scope,
        actorUserId: fixture.user.id,
        topicId: first.topic.id,
      };
      const secondActor = {
        scope: fixture.scope,
        actorUserId: fixture.user.id,
        topicId: second.topic.id,
      };
      const sharedIdempotencyKey = 'same-key-in-independent-topics';
      const firstRequest = await requests.saveRequest({
        actorUserId: firstActor.actorUserId,
        scope: firstActor.scope,
        topicId: firstActor.topicId,
        expectedRevision: 0,
        idempotencyKey: sharedIdempotencyKey,
        content: {
          originalText: '一つ目の学習希望',
          deviceType: 'PC',
          toolDescription: '検証ツール',
          experienceDescription: null,
          currentPosition: null,
        },
      });
      const secondRequest = await requests.saveRequest({
        actorUserId: secondActor.actorUserId,
        scope: secondActor.scope,
        topicId: secondActor.topicId,
        expectedRevision: 0,
        idempotencyKey: sharedIdempotencyKey,
        content: {
          originalText: '二つ目の学習希望',
          deviceType: 'PC',
          toolDescription: '検証ツール',
          experienceDescription: null,
          currentPosition: null,
        },
      });
      const firstTurn = {
        actor: firstActor,
        requestId: firstRequest.id,
        requestRevision: firstRequest.revision,
        operationId: randomUUID(),
        text: '一つ目だけの相談',
      };
      const secondTurn = {
        actor: secondActor,
        requestId: secondRequest.id,
        requestRevision: secondRequest.revision,
        operationId: randomUUID(),
        text: '二つ目だけの相談',
      };
      await conversations.prepareTurn(firstTurn);
      await conversations.prepareTurn(secondTurn);
      expect((await requests.readRequest(firstActor))?.originalText).toBe('一つ目の学習希望');
      expect((await requests.readRequest(secondActor))?.originalText).toBe('二つ目の学習希望');
      await expect(
        requests.readRequest({ ...firstActor, topicId: randomUUID() }),
      ).rejects.toThrow();
      expect(
        (await conversations.readConversation(firstActor))?.messages.map((m) => m.text),
      ).toEqual(['一つ目だけの相談']);
      expect(
        (await conversations.readConversation(secondActor))?.messages.map((m) => m.text),
      ).toEqual(['二つ目だけの相談']);
      await expect(
        conversations.prepareTurn({ ...firstTurn, requestId: secondRequest.id }),
      ).rejects.toThrow();
      await expect(
        conversations.setConversationSharing({
          actor: secondActor,
          requestId: firstRequest.id,
          requestRevision: firstRequest.revision,
          operationId: randomUUID(),
          shared: true,
        }),
      ).rejects.toThrow();
      const updatedFirstRequest = await requests.saveRequest({
        actorUserId: firstActor.actorUserId,
        scope: firstActor.scope,
        topicId: firstActor.topicId,
        expectedRevision: 1,
        idempotencyKey: randomUUID(),
        content: {
          originalText: '他テーマではなく一つ目のテーマだけ更新',
          deviceType: 'PC',
          toolDescription: '検証ツール',
          experienceDescription: null,
          currentPosition: null,
        },
      });
      expect(updatedFirstRequest).toMatchObject({
        originalText: '他テーマではなく一つ目のテーマだけ更新',
        revision: 2,
      });
      expect((await requests.readRequest(firstActor))?.originalText).toBe(
        '他テーマではなく一つ目のテーマだけ更新',
      );
      expect((await requests.readRequest(secondActor))?.originalText).toBe('二つ目の学習希望');

      const goals = await Promise.all(
        [
          { actor: firstActor, title: '一つ目の目標', key: 'TOPIC_ONE' },
          { actor: secondActor, title: '二つ目の目標', key: 'TOPIC_TWO' },
        ].map(async ({ actor, title, key }) => {
          const goal = await client.programMemberGoal.create({
            data: {
              workspaceId: fixture.scope.workspaceId,
              groupId: fixture.scope.groupId,
              programEnrollmentId: fixture.scope.programEnrollmentId,
              groupMembershipId: fixture.scope.groupMembershipId,
              topicId: actor.topicId,
              title,
              metricType: 'ACTION',
              targetValue: 1,
              currentValue: 0,
              unit: 'integration',
              startsAt: now,
              createdByUserId: fixture.user.id,
              updatedByUserId: fixture.user.id,
            },
          });
          await client.personalLearningGoalConfirmation.create({
            data: {
              workspaceId: fixture.scope.workspaceId,
              groupId: fixture.scope.groupId,
              programEnrollmentId: fixture.scope.programEnrollmentId,
              groupMembershipId: fixture.scope.groupMembershipId,
              userId: fixture.user.id,
              programMemberGoalId: goal.id,
              topicId: actor.topicId,
              packageKey: 'AI_TRAINING',
              goalKey: key,
              semanticVersion: 'V1',
              consultationRuleVersion: 'V1',
              scopeRuleVersion: 'V1',
              confirmedAt: now,
            },
          });
          const planId = randomUUID();
          await client.personalLearningPlanRevision.create({
            data: {
              ...fixture.scope,
              userId: fixture.user.id,
              topicId: actor.topicId,
              planId,
              revision: 1,
              previousRevision: null,
              revisionReason: 'INITIAL',
              programMemberGoalId: goal.id,
              contractVersion: 'PERSONAL_LEARNING_PLAN_V1',
              ruleVersion: 'V1',
              status: 'DRAFT',
              steps: JSON.parse(
                JSON.stringify(
                  AI_TRAINING_LEARNING_DEFINITION_FIXTURES.map((definition) => ({
                    definition: definition.reference,
                    prerequisites: definition.prerequisites,
                    selectionReason: 'GOAL_ALIGNMENT',
                  })),
                ),
              ) as Prisma.InputJsonValue,
              createdAt: now,
              updatedAt: now,
            },
          });
          return { goalId: goal.id, planId };
        }),
      );
      const persistence = new PrismaPersonalLearningPersistenceRepository(client);
      const firstState = await persistence.read(firstActor);
      const secondState = await persistence.read(secondActor);
      expect(firstState.goals.map((item) => item.reference.reference.programMemberGoalId)).toEqual([
        goals[0]!.goalId,
      ]);
      expect(secondState.goals.map((item) => item.reference.reference.programMemberGoalId)).toEqual(
        [goals[1]!.goalId],
      );
      expect(firstState.plans).toHaveLength(1);
      expect(secondState.plans).toHaveLength(1);
      await expect(
        persistence.confirmPlan({
          ...secondActor,
          planId: goals[0]!.planId,
          expectedRevision: 1,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toThrow();
    });

    it('saves a validated roadmap, reads it, starts the side hustle, and reads its initial wish without mocks', async () => {
      const f = await serviceFixture('PR-4 roadmap start', { offerPolicy: 'SIDE_HUSTLE_V1' });
      const actor = { actorUserId: f.user.id, scope: f.scope };
      const repository = new PrismaSideHustleHearingRepository(client);
      const hearing = {
        conditions: {
          initialBudget: null,
          monthlyBudget: null,
          weeklyHours: 5,
          faceExposure: null,
          snsPosting: null,
          clientInteraction: null,
          salesOutreach: null,
          inventory: null,
          device: 'PC' as const,
        },
        freeText: {
          goal: '得意なことを活かしたい',
          experience: '文章を書く経験',
          interest: null,
          constraint: null,
        },
        followUps: [],
      };
      const savedHearing = await repository.saveHearing({
        actor,
        hearing,
        expectedRevision: 0,
        lastAnsweredQuestionIndex: 13,
        idempotencyKey: randomUUID(),
      });
      const candidate = {
        name: '文章作成サポート',
        category: 'SKILL_SERVICE',
        summary: '依頼を受けて読みやすい文章を作る仕事です。',
        monetization: '依頼内容に応じて報酬を受け取ります。',
        fitReasons: [{ text: '経験を活かせます。', basedOn: ['experience'] }],
        initialCost: 'NONE',
        monthlyCost: 'NONE',
        weeklyHoursMin: 3,
        difficulty: 1,
        requiredSkills: ['文章作成'],
        workStyle: {
          faceExposure: 'NONE',
          snsPosting: 'NONE',
          clientInteraction: 'REQUIRED',
          salesOutreach: 'OPTIONAL',
          inventory: 'NONE',
          device: 'PC_REQUIRED',
        },
        typicalFlow: ['見本を作る', '小さな依頼を探す', '文章を納品する'],
        risks: ['依頼内容を確認します。'],
        requirements: [{ kind: 'PLATFORM_TERMS', text: '利用サービスの規約を確認します。' }],
      };
      const candidateProposal = validateSideHustleCandidateProposal({
        status: 'READY',
        reason: '条件をもとに候補を整理しました。',
        questions: [],
        candidates: [candidate],
      });
      const proposalUsageKey = `personal-learning-operation:${'a'.repeat(64)}`;
      await client.aiUsageEvent.create({
        data: {
          workspaceId: f.scope.workspaceId,
          actorUserId: f.user.id,
          bunshinId: null,
          taskType: 'PERSONAL_LEARNING_SIDE_HUSTLE_PROPOSAL',
          provider: 'openai',
          model: 'gpt-5.2',
          promptVersion: 'side-hustle-candidates-v1',
          status: 'SUCCESS',
          inputTokens: 1,
          outputTokens: 1,
          latencyMs: 10,
          estimatedCostUsdMicros: 1n,
          idempotencyKey: proposalUsageKey,
          occurredAt: now,
        },
      });
      const screening = screenSideHustleCandidates(
        hearing.conditions,
        candidateProposal.candidates,
      );
      const savedProposal = await repository.saveProposal({
        actor,
        hearingEventId: savedHearing.id,
        hearingRevision: savedHearing.revision,
        proposal: candidateProposal,
        screening,
        promptVersion: 'side-hustle-candidates-v1',
        usageKey: proposalUsageKey,
      });
      const selection = await repository.select({
        actor,
        proposalEventId: savedProposal.id,
        candidateIndex: 0,
        idempotencyKey: randomUUID(),
      });
      const roadmap = validateSideHustleRoadmapProposal(
        {
          reason: '準備から少しずつ進めます。',
          milestones: [
            {
              period: 'MONTH_1',
              title: '準備する',
              outcome: '必要な情報を整理できている',
              checkpoints: ['公式情報を確認する'],
              weeklyHours: 2,
            },
            {
              period: 'MONTH_2',
              title: '試してみる',
              outcome: '小さな実践を記録している',
              checkpoints: ['自分で試す'],
              weeklyHours: 3,
            },
            {
              period: 'MONTH_3',
              title: '続け方を整える',
              outcome: '続け方を振り返っている',
              checkpoints: ['記録を振り返る'],
              weeklyHours: 3,
            },
          ],
        },
        { weeklyHours: 5 },
      );
      const roadmapUsageKey = `personal-learning-operation:${'b'.repeat(64)}`;
      await client.aiUsageEvent.create({
        data: {
          workspaceId: f.scope.workspaceId,
          actorUserId: f.user.id,
          bunshinId: null,
          taskType: 'PERSONAL_LEARNING_SIDE_HUSTLE_ROADMAP',
          provider: 'openai',
          model: 'gpt-5.2',
          promptVersion: 'side-hustle-roadmap-v1',
          status: 'SUCCESS',
          inputTokens: 1,
          outputTokens: 1,
          latencyMs: 10,
          estimatedCostUsdMicros: 1n,
          idempotencyKey: roadmapUsageKey,
          occurredAt: now,
        },
      });
      const savedRoadmap = await repository.saveRoadmap({
        actor,
        selectionEventId: selection.id,
        roadmap,
        promptVersion: 'side-hustle-roadmap-v1',
        usageKey: roadmapUsageKey,
        idempotencyKey: randomUUID(),
      });
      expect((await repository.readState(actor)).roadmap?.roadmap).toEqual(savedRoadmap.roadmap);
      const started = await repository.start({
        actor,
        selectionEventId: selection.id,
        roadmapEventId: savedRoadmap.id,
        idempotencyKey: randomUUID(),
      });
      const topicCountAfterStart = await client.personalLearningTopic.count({ where: f.scope });
      const requestCountAfterStart = await client.personalLearningRequest.count({ where: f.scope });
      const retriedStart = await repository.start({
        actor,
        selectionEventId: selection.id,
        roadmapEventId: savedRoadmap.id,
        idempotencyKey: randomUUID(),
      });
      expect(retriedStart).toMatchObject({
        id: started.id,
        topicId: started.topicId,
        requestId: started.requestId,
      });
      expect(await client.personalLearningTopic.count({ where: f.scope })).toBe(
        topicCountAfterStart,
      );
      expect(await client.personalLearningRequest.count({ where: f.scope })).toBe(
        requestCountAfterStart,
      );
      expect(
        (await client.personalLearningTopic.findUnique({ where: { id: started.topicId } }))?.status,
      ).toBe('ACTIVE');
      const startedState = await repository.readState(actor);
      expect(startedState.started).toMatchObject({
        topicId: started.topicId,
        requestId: started.requestId,
        roadmapEventId: savedRoadmap.id,
      });
      const request = await new PrismaPersonalLearningRequestRepository(client).readRequest({
        ...actor,
        topicId: started.topicId,
      });
      expect(request).toMatchObject({
        id: started.requestId,
        revision: 1,
        deviceType: 'PC',
        toolDescription: null,
      });
      expect(request?.originalText).toContain('90日の地図（本人が確認済み）：');
      const topic = await client.personalLearningTopic.findFirst({
        where: { ...f.scope, id: started.topicId },
      });
      expect(topic).toMatchObject({
        title: candidate.name,
        sourceRequestId: started.requestId,
        status: 'ACTIVE',
      });
      expect(topic?.goalSnapshot).toMatchObject({
        kind: 'SIDE_HUSTLE',
        selectionEventId: selection.id,
        roadmapEventId: savedRoadmap.id,
        currentPeriod: 'MONTH_1',
      });

      // Build two real, topic-linked reviewed practice records using the same DB relations as the learner flow.
      const practiceAssignmentIds: string[] = [];
      const progressGoal = await client.programMemberGoal.create({
        data: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          programEnrollmentId: f.scope.programEnrollmentId,
          groupMembershipId: f.scope.groupMembershipId,
          topicId: started.topicId,
          title: 'Progress goal',
          metricType: 'ACTION',
          targetValue: 1,
          currentValue: 0,
          unit: 'practice',
          startsAt: now,
          createdByUserId: f.user.id,
          updatedByUserId: f.user.id,
        },
      });
      await client.personalLearningGoalConfirmation.create({
        data: {
          ...f.scope,
          userId: f.user.id,
          programMemberGoalId: progressGoal.id,
          topicId: started.topicId,
          packageKey: 'AI_TRAINING',
          goalKey: 'SIDE_HUSTLE_PROGRESS',
          semanticVersion: 'V1',
          consultationRuleVersion: 'V1',
          scopeRuleVersion: 'V1',
          confirmedAt: now,
        },
      });
      async function recordPractice(
        index: number,
        options: {
          reviewState?: 'CURRENT_STEP_EVIDENCE' | 'SELF_REPORT_ONLY';
          evaluationStatus?: 'READY' | 'PENDING';
          occurredAt?: Date;
        } = {},
      ) {
        const planId = randomUUID();
        await client.personalLearningPlanRevision.create({
          data: {
            ...f.scope,
            userId: f.user.id,
            topicId: started.topicId,
            planId,
            revision: 1,
            previousRevision: null,
            revisionReason: 'INITIAL',
            programMemberGoalId: progressGoal.id,
            contractVersion: 'PERSONAL_LEARNING_PLAN_V1',
            ruleVersion: 'V1',
            status: 'CONFIRMED',
            steps: JSON.parse(
              JSON.stringify(
                AI_TRAINING_LEARNING_DEFINITION_FIXTURES.map((definition) => ({
                  definition: definition.reference,
                  prerequisites: definition.prerequisites,
                  selectionReason: 'GOAL_ALIGNMENT',
                })),
              ),
            ) as Prisma.InputJsonValue,
            confirmedAt: now,
          },
        });
        const assignmentId = randomUUID();
        practiceAssignmentIds.push(assignmentId);
        const candidateId = randomUUID();
        await client.programMissionAssignment.create({
          data: {
            id: assignmentId,
            workspaceId: f.scope.workspaceId,
            groupId: f.scope.groupId,
            programEnrollmentId: f.scope.programEnrollmentId,
            programTemplateVersionId: f.program.programTemplateVersionId,
            sequence: 100 + index,
            routeKey: 'PERSONAL_LEARNING',
            phaseKey: 'SIDE_HUSTLE',
            missionDefinitionKey: 'PERSONAL_LEARNING_DYNAMIC_PRACTICE',
            actionMode: 'WORK',
            targetResourceType: 'PERSONAL_LEARNING_PLAN',
            targetResourceId: planId,
            status: 'STARTED',
            displaySnapshot: {
              dynamicPractice: {
                version: 'PERSONAL_LEARNING_PRACTICE_V1',
                topicId: started.topicId,
                planId,
                planRevision: 1,
                goalId: progressGoal.id,
                scope: f.scope,
                candidate: { id: candidateId, materialVersion: 1 },
              },
            },
            ruleVersion: 'PERSONAL_LEARNING_PRACTICE_V1',
            presentedAt: now,
            startedAt: now,
          },
        });
        const occurredAt = options.occurredAt ?? new Date(Date.now() + index + 1);
        const answerResult = await new PrismaTrainingAnswerRepository(client).submit({
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          actorUserId: f.user.id,
          programEnrollmentId: f.scope.programEnrollmentId,
          missionAssignmentId: assignmentId,
          answer: '確認できた実践',
          practiceEvidence: {
            kind: 'TEXT',
            content: '確認できた実践',
            expectedRevision: 0,
            candidateId,
            materialVersion: 1,
          },
          idempotencyKey: randomUUID(),
          occurredAt,
        });
        if (answerResult.outcome !== 'SUBMITTED')
          throw new Error('practice evidence was not submitted');
        await client.trainingMissionAnswer.update({
          where: { id: answerResult.answer.id },
          data: {
            evaluationStatus: options.evaluationStatus ?? 'READY',
            evaluation: {
              schemaVersion: 'PERSONAL_LEARNING_EVIDENCE_REVIEW_V1',
              review: {
                state: options.reviewState ?? 'CURRENT_STEP_EVIDENCE',
                observed: ['確認済み'],
                notEstablished: [],
                feedback: '確認できました。',
                nextAction: '続けてください。',
              },
            },
            evaluatedAt: new Date(),
          },
        });
      }
      for (const index of [0, 1]) await recordPractice(index);
      await recordPractice(2, { reviewState: 'SELF_REPORT_ONLY' });
      await recordPractice(3, { evaluationStatus: 'PENDING' });
      const progress = await repository.readProgress(actor, started.topicId);
      expect(progress).toMatchObject({
        period: 'MONTH_1',
        verifiedPracticeCount: 2,
        eligibility: { suggested: true, canAdvance: true, reason: 'ENOUGH_PRACTICE' },
      });
      const checkin = {
        topicId: started.topicId,
        period: 'MONTH_1' as const,
        checkpointResults: ['PARTLY' as const],
        feeling: 'OK' as const,
        note: '少しずつ試せました',
        decision: 'ADVANCE' as const,
      };
      const checkinOperationId = randomUUID();
      const advanced = await repository.saveCheckin({
        actor,
        operationId: checkinOperationId,
        checkin,
      });
      expect(advanced.period).toBe('MONTH_2');
      const requestAfterAdvance = await client.personalLearningRequest.findFirstOrThrow({
        where: { ...f.scope, topicId: started.topicId },
        orderBy: { revision: 'desc' },
      });
      expect(requestAfterAdvance).toMatchObject({ revision: 2 });
      expect(requestAfterAdvance.originalText).toContain('いまの段階：2か月目「試してみる」');
      expect(requestAfterAdvance.originalText).toContain('いまの段階の目安：自分で試す');
      expect(
        await client.programMissionAssignment.findMany({
          where: { id: { in: practiceAssignmentIds } },
          select: { status: true },
        }),
      ).toEqual(practiceAssignmentIds.map(() => ({ status: 'STARTED' })));
      const duplicateAdvance = await repository.saveCheckin({
        actor,
        operationId: randomUUID(),
        checkin,
      });
      expect(duplicateAdvance).toMatchObject({ period: 'MONTH_2', replayed: true });
      expect(
        await client.personalLearningRequest.count({
          where: { ...f.scope, topicId: started.topicId },
        }),
      ).toBe(2);
      expect(
        await client.programActionEvent.count({
          where: {
            workspaceId: f.scope.workspaceId,
            groupId: f.scope.groupId,
            programEnrollmentId: f.scope.programEnrollmentId,
            eventType: 'SIDE_HUSTLE_STAGE_ADVANCED',
          },
        }),
      ).toBe(1);

      // Race a next-practice wish append against stage advancement. Exactly one initial writer
      // must conflict on the captured request revision; a retry must preserve both additions.
      expect((await repository.readProgress(actor, started.topicId)).verifiedPracticeCount).toBe(0);
      await recordPractice(5);
      const monthTwoCheckin = {
        ...checkin,
        period: 'MONTH_2' as const,
        checkpointResults: ['DONE' as const],
      };
      const requestRepository = new PrismaPersonalLearningRequestRepository(client);
      const currentRequest = await requestRepository.readRequest({
        ...actor,
        topicId: started.topicId,
      });
      if (!currentRequest) throw new Error('started request missing');
      const nextPracticeWish = {
        originalText: `${currentRequest.originalText}\n結果に応じた次の実践：短い案内文も試す`,
        deviceType: currentRequest.deviceType,
        toolDescription: currentRequest.toolDescription,
        experienceDescription: currentRequest.experienceDescription,
        currentPosition: '結果に応じた次の実践を準備する',
      };
      const race = await Promise.allSettled([
        repository.saveCheckin({ actor, operationId: randomUUID(), checkin: monthTwoCheckin }),
        requestRepository.saveRequest({
          actorUserId: actor.actorUserId,
          scope: actor.scope,
          topicId: started.topicId,
          expectedRevision: currentRequest.revision,
          idempotencyKey: randomUUID(),
          content: nextPracticeWish,
        }),
      ]);
      expect(race.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(race.filter((result) => result.status === 'rejected')).toHaveLength(1);
      if (race[0]?.status === 'rejected') {
        expect(race[0].reason).toMatchObject({ code: 'CONFLICT' });
        await repository.saveCheckin({
          actor,
          operationId: randomUUID(),
          checkin: monthTwoCheckin,
        });
      } else if (race[1]?.status === 'rejected') {
        expect(race[1].reason).toMatchObject({ code: 'CONFLICT' });
      }
      const latestAfterRace = await requestRepository.readRequest({
        ...actor,
        topicId: started.topicId,
      });
      if (!latestAfterRace) throw new Error('request missing after concurrent update');
      if (!latestAfterRace.originalText.includes('結果に応じた次の実践：短い案内文も試す')) {
        await requestRepository.saveRequest({
          actorUserId: actor.actorUserId,
          scope: actor.scope,
          topicId: started.topicId,
          expectedRevision: latestAfterRace.revision,
          idempotencyKey: randomUUID(),
          content: {
            ...nextPracticeWish,
            originalText: `${latestAfterRace.originalText}\n結果に応じた次の実践：短い案内文も試す`,
          },
        });
      }
      const latestAfterPreservingRetry = await requestRepository.readRequest({
        ...actor,
        topicId: started.topicId,
      });
      expect(latestAfterPreservingRetry?.originalText).toContain(
        'いまの段階：3か月目「続け方を整える」',
      );
      expect(latestAfterPreservingRetry?.originalText).toContain(
        'いまの段階の目安：記録を振り返る',
      );
      expect(latestAfterPreservingRetry?.originalText).toContain(
        '結果に応じた次の実践：短い案内文も試す',
      );
      const monthThreeProgress = await repository.readProgress(actor, started.topicId);
      expect(monthThreeProgress).toMatchObject({ period: 'MONTH_3', verifiedPracticeCount: 0 });
      await recordPractice(6);
      const monthThreeRequest = await requestRepository.readRequest({
        ...actor,
        topicId: started.topicId,
      });
      if (!monthThreeRequest) throw new Error('month-three request missing');
      const requestCountBeforeCompletion = await client.personalLearningRequest.count({
        where: { ...f.scope, topicId: started.topicId },
      });
      const completed = await repository.saveCheckin({
        actor,
        operationId: randomUUID(),
        checkin: {
          ...checkin,
          period: 'MONTH_3',
          checkpointResults: ['DONE'],
        },
      });
      expect(completed.period).toBe('COMPLETED');
      expect(
        await client.personalLearningRequest.count({
          where: { ...f.scope, topicId: started.topicId },
        }),
      ).toBe(requestCountBeforeCompletion);
      expect(
        (await client.personalLearningTopic.findUnique({ where: { id: started.topicId } }))?.status,
      ).toBe('ACTIVE');

      await client.personalLearningTopic.update({
        where: { id: started.topicId },
        data: { status: 'PAUSED' },
      });
      await expect(
        repository.saveCheckin({
          actor,
          operationId: randomUUID(),
          checkin: { ...checkin, period: 'MONTH_3' },
        }),
      ).rejects.toThrow(/paused/i);

      const otherEnrollment = await serviceFixture('side hustle different enrollment', {
        offerPolicy: 'SIDE_HUSTLE_V1',
      });
      const otherEnrollmentTopic = await client.personalLearningTopic.create({
        data: {
          ...otherEnrollment.scope,
          title: '別Enrollmentのテーマ',
          status: 'ACTIVE',
          goalSnapshot: { kind: 'SIDE_HUSTLE', schemaVersion: 1 },
        },
      });
      await expect(
        repository.saveCheckin({
          actor,
          operationId: randomUUID(),
          checkin: { ...checkin, topicId: otherEnrollmentTopic.id },
        }),
      ).rejects.toThrow(/unavailable/i);
    });

    it('proposes and confirms a revision without changing completed months or exposing an unconfirmed map', async () => {
      const f = await serviceFixture('PR-5c roadmap revision', { offerPolicy: 'SIDE_HUSTLE_V1' });
      const actor = { actorUserId: f.user.id, scope: f.scope };
      const repository = new PrismaSideHustleHearingRepository(client);
      const hearing = {
        conditions: {
          initialBudget: null,
          monthlyBudget: null,
          weeklyHours: 5,
          faceExposure: null,
          snsPosting: null,
          clientInteraction: null,
          salesOutreach: null,
          inventory: null,
          device: 'PC' as const,
        },
        freeText: {
          goal: '得意なことを活かしたい',
          experience: '文章を書く経験',
          interest: null,
          constraint: null,
        },
        followUps: [],
      };
      const savedHearing = await repository.saveHearing({
        actor,
        hearing,
        expectedRevision: 0,
        idempotencyKey: randomUUID(),
      });
      const candidate = {
        name: '文章作成サポート',
        category: 'SKILL_SERVICE',
        summary: '依頼を受けて文章を作ります。',
        monetization: '依頼内容に応じた報酬です。',
        fitReasons: [{ text: '経験を活かせます。', basedOn: ['experience'] }],
        initialCost: 'NONE',
        monthlyCost: 'NONE',
        weeklyHoursMin: 3,
        difficulty: 1,
        requiredSkills: ['文章作成'],
        workStyle: {
          faceExposure: 'NONE',
          snsPosting: 'NONE',
          clientInteraction: 'REQUIRED',
          salesOutreach: 'OPTIONAL',
          inventory: 'NONE',
          device: 'PC_REQUIRED',
        },
        typicalFlow: ['文章の見本を用意する', '小さな依頼を確認する', '文章を納品して振り返る'],
        risks: ['依頼内容を確認します。'],
        requirements: [{ kind: 'PLATFORM_TERMS', text: '規約を確認します。' }],
      };
      const candidateProposal = validateSideHustleCandidateProposal({
        status: 'READY',
        reason: '候補を整理しました。',
        questions: [],
        candidates: [candidate],
      });
      const proposalUsageKey = `personal-learning-operation:${'c'.repeat(64)}`;
      await client.aiUsageEvent.create({
        data: {
          workspaceId: f.scope.workspaceId,
          actorUserId: f.user.id,
          bunshinId: null,
          taskType: 'PERSONAL_LEARNING_SIDE_HUSTLE_PROPOSAL',
          provider: 'openai',
          model: 'gpt-5.2',
          promptVersion: 'side-hustle-candidates-v1',
          status: 'SUCCESS',
          inputTokens: 1,
          outputTokens: 1,
          latencyMs: 10,
          estimatedCostUsdMicros: 1n,
          idempotencyKey: proposalUsageKey,
          occurredAt: now,
        },
      });
      const savedProposal = await repository.saveProposal({
        actor,
        hearingEventId: savedHearing.id,
        hearingRevision: 1,
        proposal: candidateProposal,
        screening: screenSideHustleCandidates(hearing.conditions, candidateProposal.candidates),
        promptVersion: 'side-hustle-candidates-v1',
        usageKey: proposalUsageKey,
      });
      const selection = await repository.select({
        actor,
        proposalEventId: savedProposal.id,
        candidateIndex: 0,
        idempotencyKey: randomUUID(),
      });
      const baseRoadmap = validateSideHustleRoadmapProposal(
        {
          reason: '最初の地図です。',
          milestones: [
            {
              period: 'MONTH_1',
              title: '基礎を整える',
              outcome: '情報を整理している',
              checkpoints: ['公式情報を確認する'],
              weeklyHours: 2,
            },
            {
              period: 'MONTH_2',
              title: '小さく試す',
              outcome: '試行を記録している',
              checkpoints: ['自分で試す'],
              weeklyHours: 3,
            },
            {
              period: 'MONTH_3',
              title: '続け方を整える',
              outcome: '続け方を振り返っている',
              checkpoints: ['記録を見る'],
              weeklyHours: 3,
            },
          ],
        },
        { weeklyHours: 5 },
      );
      const roadmapUsageKey = `personal-learning-operation:${'d'.repeat(64)}`;
      await client.aiUsageEvent.create({
        data: {
          workspaceId: f.scope.workspaceId,
          actorUserId: f.user.id,
          bunshinId: null,
          taskType: 'PERSONAL_LEARNING_SIDE_HUSTLE_ROADMAP',
          provider: 'openai',
          model: 'gpt-5.2',
          promptVersion: 'side-hustle-roadmap-v1',
          status: 'SUCCESS',
          inputTokens: 1,
          outputTokens: 1,
          latencyMs: 10,
          estimatedCostUsdMicros: 1n,
          idempotencyKey: roadmapUsageKey,
          occurredAt: now,
        },
      });
      const savedRoadmap = await repository.saveRoadmap({
        actor,
        selectionEventId: selection.id,
        roadmap: baseRoadmap,
        promptVersion: 'side-hustle-roadmap-v1',
        usageKey: roadmapUsageKey,
        idempotencyKey: randomUUID(),
      });
      const started = await repository.start({
        actor,
        selectionEventId: selection.id,
        roadmapEventId: savedRoadmap.id,
        idempotencyKey: randomUUID(),
      });
      const initialRequest = await client.personalLearningRequest.findFirstOrThrow({
        where: { ...f.scope, topicId: started.topicId, revision: 1 },
      });
      const progressGoal = await client.programMemberGoal.create({
        data: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          programEnrollmentId: f.scope.programEnrollmentId,
          groupMembershipId: f.scope.groupMembershipId,
          topicId: started.topicId,
          title: '副業の実践',
          metricType: 'ACTION',
          targetValue: 2,
          currentValue: 0,
          unit: 'practice',
          startsAt: now,
          createdByUserId: f.user.id,
          updatedByUserId: f.user.id,
        },
      });
      await client.personalLearningGoalConfirmation.create({
        data: {
          ...f.scope,
          userId: f.user.id,
          programMemberGoalId: progressGoal.id,
          topicId: started.topicId,
          packageKey: 'AI_TRAINING',
          goalKey: 'SIDE_HUSTLE_REVISION_TEST',
          semanticVersion: 'V1',
          consultationRuleVersion: 'V1',
          scopeRuleVersion: 'V1',
          confirmedAt: now,
        },
      });
      for (const index of [0, 1]) {
        const planId = randomUUID();
        await client.personalLearningPlanRevision.create({
          data: {
            ...f.scope,
            userId: f.user.id,
            topicId: started.topicId,
            planId,
            revision: 1,
            previousRevision: null,
            revisionReason: 'INITIAL',
            programMemberGoalId: progressGoal.id,
            contractVersion: 'PERSONAL_LEARNING_PLAN_V1',
            ruleVersion: 'V1',
            status: 'CONFIRMED',
            steps: JSON.parse(
              JSON.stringify(
                AI_TRAINING_LEARNING_DEFINITION_FIXTURES.map((definition) => ({
                  definition: definition.reference,
                  prerequisites: definition.prerequisites,
                  selectionReason: 'GOAL_ALIGNMENT',
                })),
              ),
            ) as Prisma.InputJsonValue,
            confirmedAt: now,
          },
        });
        const assignmentId = randomUUID();
        await client.programMissionAssignment.create({
          data: {
            id: assignmentId,
            workspaceId: f.scope.workspaceId,
            groupId: f.scope.groupId,
            programEnrollmentId: f.scope.programEnrollmentId,
            programTemplateVersionId: f.program.programTemplateVersionId,
            sequence: 980 + index,
            routeKey: 'PERSONAL_LEARNING',
            phaseKey: 'SIDE_HUSTLE',
            missionDefinitionKey: 'PERSONAL_LEARNING_DYNAMIC_PRACTICE',
            actionMode: 'WORK',
            targetResourceType: 'PERSONAL_LEARNING_PLAN',
            targetResourceId: planId,
            status: 'STARTED',
            displaySnapshot: {
              dynamicPractice: {
                version: 'PERSONAL_LEARNING_PRACTICE_V1',
                topicId: started.topicId,
                planId,
                planRevision: 1,
                goalId: progressGoal.id,
                scope: f.scope,
                candidate: { id: randomUUID(), materialVersion: 1 },
              },
            },
            ruleVersion: 'PERSONAL_LEARNING_PRACTICE_V1',
            presentedAt: now,
            startedAt: now,
          },
        });
        await client.trainingMissionAnswer.create({
          data: {
            workspaceId: f.scope.workspaceId,
            groupId: f.scope.groupId,
            programEnrollmentId: f.scope.programEnrollmentId,
            missionAssignmentId: assignmentId,
            userId: f.user.id,
            answer: JSON.stringify({ revision: 1, text: '確認済みの小さな実践' }),
            evaluationStatus: 'READY',
            evaluation: {
              schemaVersion: 'PERSONAL_LEARNING_EVIDENCE_REVIEW_V1',
              review: {
                state: 'CURRENT_STEP_EVIDENCE',
                observed: ['記録を確認'],
                notEstablished: [],
                feedback: '確認できました。',
                nextAction: '続けてください。',
              },
            },
            evaluatedAt: now,
            createdAt: new Date(Date.now() + index + 1),
          },
        });
      }
      const advanced = await repository.saveCheckin({
        actor,
        operationId: randomUUID(),
        checkin: {
          topicId: started.topicId,
          period: 'MONTH_1',
          checkpointResults: ['DONE'],
          feeling: 'OK',
          note: null,
          decision: 'ADVANCE',
        },
      });
      expect(advanced.period).toBe('MONTH_2');
      const monthTwoStartedAt = (
        await client.personalLearningTopic.findUniqueOrThrow({ where: { id: started.topicId } })
      ).goalSnapshot as { currentPeriodStartedAt: string };
      const monthTwoStartedAtIso = monthTwoStartedAt.currentPeriodStartedAt;
      expect((await repository.readProgress(actor, started.topicId)).verifiedPracticeCount).toBe(0);
      const checkin = await repository.saveCheckin({
        actor,
        operationId: randomUUID(),
        checkin: {
          topicId: started.topicId,
          period: 'MONTH_2',
          checkpointResults: ['PARTLY'],
          feeling: 'HARD',
          note: '少し負担を減らしたい',
          decision: 'REVISE',
        },
      });
      const revision = validateSideHustleRoadmapProposal(
        {
          reason: '負担を抑えて進めます。',
          milestones: [
            baseRoadmap.milestones[0]!,
            {
              period: 'MONTH_2',
              title: '範囲を絞って試す',
              outcome: '小さく試して記録する',
              checkpoints: ['一つだけ試す'],
              weeklyHours: 2,
            },
            {
              period: 'MONTH_3',
              title: '続け方を調整する',
              outcome: '無理のない方法を選ぶ',
              checkpoints: ['続け方を見直す'],
              weeklyHours: 2,
            },
          ],
        },
        { weeklyHours: 5 },
      );
      const revisionUsageKey = `personal-learning-operation:${'e'.repeat(64)}`;
      await client.aiUsageEvent.create({
        data: {
          workspaceId: f.scope.workspaceId,
          actorUserId: f.user.id,
          bunshinId: null,
          taskType: 'PERSONAL_LEARNING_SIDE_HUSTLE_ROADMAP_REVISION',
          provider: 'openai',
          model: 'gpt-5.2',
          promptVersion: 'side-hustle-roadmap-revision-v1',
          status: 'SUCCESS',
          inputTokens: 1,
          outputTokens: 1,
          latencyMs: 10,
          estimatedCostUsdMicros: 1n,
          idempotencyKey: revisionUsageKey,
          occurredAt: now,
        },
      });
      const proposal = await repository.saveRoadmapRevisionProposal({
        actor,
        topicId: started.topicId,
        selectionEventId: selection.id,
        baseRoadmapEventId: savedRoadmap.id,
        fromPeriod: 'MONTH_2',
        checkinEventId: checkin.checkinEventId,
        operationId: randomUUID(),
        roadmap: revision,
        promptVersion: 'side-hustle-roadmap-revision-v1',
        usageKey: revisionUsageKey,
      });
      expect((await repository.readState(actor)).roadmap?.id).toBe(savedRoadmap.id);
      expect((await repository.readProgress(actor, started.topicId)).roadmap.milestones[0]).toEqual(
        baseRoadmap.milestones[0],
      );
      expect(
        (await client.personalLearningTopic.findUniqueOrThrow({ where: { id: started.topicId } }))
          .goalSnapshot,
      ).toMatchObject({ roadmapEventId: savedRoadmap.id });
      expect(
        await client.personalLearningRequest.count({
          where: { ...f.scope, topicId: started.topicId },
        }),
      ).toBe(2);
      const revisionSavedProposal = await repository.readRoadmapRevisionProposal(actor, {
        operationId: proposal.operationId,
        topicId: started.topicId,
        checkinEventId: checkin.checkinEventId,
      });
      expect(revisionSavedProposal?.id).toBe(proposal.id);
      const revisedRequest = await repository.saveRoadmapRevision({
        actorUserId: actor.actorUserId,
        scope: actor.scope,
        topicId: started.topicId,
        revisionProposalEventId: proposal.id,
        operationId: randomUUID(),
      });
      expect(revisedRequest.revision).toBe(3);
      expect(revisedRequest.originalText).toContain('1か月目：基礎を整える（情報を整理している）');
      expect(revisedRequest.originalText).toContain(
        '2か月目：範囲を絞って試す（小さく試して記録する）',
      );
      expect(revisedRequest.originalText).toContain(
        '3か月目：続け方を調整する（無理のない方法を選ぶ）',
      );
      expect(revisedRequest.originalText).toContain('いまの段階の目安：一つだけ試す');
      const confirmedState = await repository.readState(actor);
      expect(confirmedState.roadmap?.id).toBe(proposal.id);
      expect((await repository.readProgress(actor, started.topicId)).period).toBe('MONTH_2');
      const topic = await client.personalLearningTopic.findUniqueOrThrow({
        where: { id: started.topicId },
      });
      expect(topic.sourceRequestId).toBe(initialRequest.id);
      expect(topic.goalSnapshot).toMatchObject({
        roadmapEventId: proposal.id,
        roadmapHistory: [savedRoadmap.id],
        currentPeriod: 'MONTH_2',
        currentPeriodStartedAt: monthTwoStartedAtIso,
      });
      await repository.saveRoadmapRevision({
        actorUserId: actor.actorUserId,
        scope: actor.scope,
        topicId: started.topicId,
        revisionProposalEventId: proposal.id,
        operationId: randomUUID(),
      });
      expect(
        await client.personalLearningRequest.count({
          where: { ...f.scope, topicId: started.topicId },
        }),
      ).toBe(3);
      expect(
        await client.programActionEvent.count({
          where: {
            workspaceId: f.scope.workspaceId,
            groupId: f.scope.groupId,
            programEnrollmentId: f.scope.programEnrollmentId,
            eventType: 'SIDE_HUSTLE_ROADMAP_REVISED',
          },
        }),
      ).toBe(1);
    });
  });
}
