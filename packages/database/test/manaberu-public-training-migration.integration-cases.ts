import { readFileSync } from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import { CreateUserWithPersonalWorkspace } from '@bunshin/application';
import { describe, expect, it } from 'vitest';
import { PrismaAccountUnitOfWork } from '../src';

const workspaceId = '74000000-0000-4000-8000-000000000001';
const groupId = 'ae9e96ca-16f3-4210-af4f-44d18bdaebe3';
const configurationId = '1b74ed83-977a-4a54-9750-ab381c5d8367';
const migrationSql = readFileSync(
  new URL(
    '../prisma/migrations/20261104010000_enable_manaberu_public_training/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

export function registerManaberuPublicTrainingMigrationIntegrationCases(client: PrismaClient) {
  describe('Manaberu public training configuration migration', () => {
    it('backfills active participants once and leaves AI consent explicit', async () => {
      const accounts = new CreateUserWithPersonalWorkspace(new PrismaAccountUnitOfWork(client));
      const owner = await accounts.execute({ displayName: 'Manaberu migration owner' });
      const participants = await Promise.all([
        accounts.execute({ displayName: 'Manaberu migration participant 1' }),
        accounts.execute({ displayName: 'Manaberu migration participant 2' }),
      ]);
      let programId: string | null = null;
      try {
        await client.workspace.create({
          data: {
            id: workspaceId,
            type: 'ORGANIZATION',
            name: '運営団体ワタシワークス',
            memberships: {
              create: [
                { userId: owner.user.id, role: 'OWNER' },
                ...participants.map(({ user }) => ({ userId: user.id, role: 'MEMBER' as const })),
              ],
            },
          },
        });
        await client.group.create({
          data: { id: groupId, workspaceId, name: 'マナベルスタイル' },
        });
        const configuration = await client.serviceConfiguration.create({
          data: {
            id: configurationId,
            workspaceId,
            groupId,
            slug: 'manaberu-style',
            displayName: 'マナベルスタイル',
            description: 'Migration integration fixture',
            operatorName: '運営団体ワタシワークス',
            visibility: 'PUBLIC',
            createdByUserId: owner.user.id,
            updatedByUserId: owner.user.id,
          },
        });
        await client.serviceRegistrationPolicy.create({
          data: {
            workspaceId,
            groupId,
            configurationId: configuration.id,
            mode: 'PUBLIC',
            onboardingConfig: { welcomeTitle: 'preserved' },
          },
        });
        await client.groupMembership.create({
          data: {
            workspaceId,
            groupId,
            userId: owner.user.id,
            role: 'MANAGER',
            serviceRole: 'SERVICE_OWNER',
            status: 'ACTIVE',
            consentedAt: new Date(),
          },
        });
        await client.groupMembership.createMany({
          data: participants.map(({ user }) => ({
            workspaceId,
            groupId,
            userId: user.id,
            role: 'PARTICIPANT' as const,
            serviceRole: 'PARTICIPANT' as const,
            status: 'ACTIVE' as const,
            consentedAt: new Date(),
          })),
        });
        const template = await client.programTemplate.create({
          data: {
            workspaceId,
            ownerGroupId: groupId,
            name: 'AI研修30日 template',
            description: 'Migration integration fixture',
            category: 'TRAINING',
            targetAudience: 'Participants',
            createdByUserId: owner.user.id,
          },
        });
        const version = await client.programTemplateVersion.create({
          data: {
            workspaceId,
            programTemplateId: template.id,
            version: 1,
            definition: {},
            createdByUserId: owner.user.id,
          },
        });
        const program = await client.serviceProgram.create({
          data: {
            workspaceId,
            groupId,
            programTemplateVersionId: version.id,
            displayName: 'マナベルスタイル AI研修30日',
            description: 'Migration integration fixture',
            status: 'ACTIVE',
            settings: { moduleKey: 'AI_TRAINING_V1', existingSetting: 'preserved' },
            createdByUserId: owner.user.id,
          },
        });
        programId = program.id;
        const offering = await client.programOffering.create({
          data: {
            workspaceId,
            groupId,
            serviceProgramId: program.id,
            version: 1,
            status: 'ACTIVE',
            isFree: true,
            seller: 'SERVICE',
            priceOwner: 'SERVICE',
            paymentOwner: 'SERVICE',
            apiCostOwner: 'SERVICE',
            supportOwner: 'SERVICE',
            contentOwner: 'SERVICE',
            characterOwner: 'SERVICE',
            termsSnapshot: { participation: 'INVITATION_ONLY', supportModes: ['GUIDED'] },
            createdByUserId: owner.user.id,
          },
        });

        await client.$executeRawUnsafe(migrationSql);
        await client.$executeRawUnsafe(migrationSql);

        const [policy, updatedProgram, enrollments, seats, consents] = await Promise.all([
          client.serviceRegistrationPolicy.findUniqueOrThrow({ where: { groupId } }),
          client.serviceProgram.findUniqueOrThrow({ where: { id: program.id } }),
          client.programEnrollment.findMany({
            where: { workspaceId, groupId, serviceProgramId: program.id },
            orderBy: { createdAt: 'asc' },
          }),
          client.personalLearningPilotSeat.findMany({
            where: { workspaceId, groupId, serviceProgramId: program.id },
            orderBy: { seatNumber: 'asc' },
          }),
          client.aiTrainingUsageConsent.count({ where: { workspaceId, groupId } }),
        ]);
        expect(policy.onboardingConfig).toMatchObject({
          welcomeTitle: 'preserved',
          trainingAutoAdmission: {
            version: 'SERVICE_TRAINING_AUTO_ADMISSION_V1',
            enabled: true,
            serviceProgramId: program.id,
            programOfferingId: offering.id,
          },
        });
        expect(updatedProgram.settings).toMatchObject({
          moduleKey: 'AI_TRAINING_V1',
          existingSetting: 'preserved',
          trainingOperations: {
            notificationsEnabled: false,
            postponedReminderEnabled: false,
          },
          personalLearningPilot: {
            enabled: true,
            participantControl: {
              version: 'PILOT_PARTICIPANT_CAP_V1',
              revision: 1,
              externalParticipantCap: 0,
              internalParticipantCap: 100,
              currentWave: 0,
              currentWaveCap: 0,
            },
          },
        });
        expect(enrollments).toHaveLength(2);
        expect(enrollments.every(({ status }) => status === 'ACTIVE')).toBe(true);
        expect(seats.map(({ kind, cohort, seatNumber }) => ({ kind, cohort, seatNumber }))).toEqual(
          [
            { kind: 'INTERNAL', cohort: 'INTERNAL', seatNumber: 1 },
            { kind: 'INTERNAL', cohort: 'INTERNAL', seatNumber: 2 },
          ],
        );
        expect(
          (updatedProgram.settings as { personalLearningPilot: { enrollmentIds: string[] } })
            .personalLearningPilot.enrollmentIds,
        ).toEqual(enrollments.map(({ id }) => id));
        expect(consents).toBe(0);
        expect(
          await client.programAuditLog.count({
            where: { resourceId: program.id, action: 'PUBLIC_REGISTRATION_TRAINING_ENABLED' },
          }),
        ).toBe(1);
      } finally {
        if (programId) {
          await client.personalLearningPilotSeat.deleteMany({
            where: { serviceProgramId: programId },
          });
          await client.programEnrollment.deleteMany({ where: { serviceProgramId: programId } });
          await client.programAuditLog.deleteMany({ where: { resourceId: programId } });
        }
        await client.serviceConfigurationAudit.deleteMany({ where: { configurationId } });
        await client.programOffering.deleteMany({ where: { groupId } });
        await client.serviceProgram.deleteMany({ where: { groupId } });
        await client.programTemplateVersion.deleteMany({ where: { workspaceId } });
        await client.programTemplate.deleteMany({ where: { workspaceId } });
        await client.serviceRegistrationPolicy.deleteMany({ where: { groupId } });
        await client.serviceConfiguration.deleteMany({ where: { id: configurationId } });
        await client.groupMembership.deleteMany({ where: { groupId } });
        await client.group.deleteMany({ where: { id: groupId } });
        await client.workspaceMembership.deleteMany({ where: { workspaceId } });
        await client.workspace.deleteMany({ where: { id: workspaceId } });
      }
    });
  });
}
