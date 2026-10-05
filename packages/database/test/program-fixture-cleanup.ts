import type { PrismaClient } from '@prisma/client/index';

/** Test-only: caller must pass live disposable DB preflight before invoking this. */
export async function cleanupProgramFixtures(client: PrismaClient): Promise<void> {
  await client.$executeRawUnsafe(
    'TRUNCATE TABLE training_support_skill_activations, training_support_skill_versions, training_support_skills CASCADE',
  );
  // Some training tables have no FK: delete them explicitly, not by assumed cascade.
  await client.trainingToolkitItem.deleteMany();
  await client.trainingMissionAnswer.deleteMany();
  await client.trainingParticipantProfile.deleteMany();
  await client.trainingDataRetentionState.deleteMany();
  // Actual migration FKs are RESTRICT: events/progress -> assignment -> enrollment.
  await client.programActionEvent.deleteMany();
  await client.programProgressSnapshot.deleteMany();
  await client.programMissionAssignment.deleteMany();
  await client.programMemberGoal.deleteMany();
  await client.programMemberPreference.deleteMany();
  await client.programEnrollment.deleteMany();
  // Remaining program fixtures must precede Group/Workspace deletion as well.
  await client.programOffering.deleteMany();
  await client.serviceProgramSupportPolicy.deleteMany();
  await client.programGoalDefinition.deleteMany();
  await client.serviceProgram.deleteMany();
  await client.programTemplateVersion.deleteMany();
  await client.programTemplate.deleteMany();
  await client.programAuditLog.deleteMany();
}
