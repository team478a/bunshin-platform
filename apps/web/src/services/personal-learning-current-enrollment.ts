import { personalLearningDynamicProgramAllows } from '@bunshin/capability-training';

type Program = { id: string; settings: unknown };
type Enrollment = { id: string; serviceProgramId: string };

export type PersonalLearningEnrollmentStore = {
  serviceProgram: {
    findMany(input: Record<string, unknown>): Promise<Program[]>;
  };
  programEnrollment: {
    findMany(input: Record<string, unknown>): Promise<Enrollment[]>;
  };
  personalLearningPilotSeat: {
    findMany(input: Record<string, unknown>): Promise<{ programEnrollmentId: string }[]>;
  };
};

/**
 * Resolve a current dynamic-learning enrollment for a learner who followed an old Pilot link.
 * Every lookup remains inside the same workspace, service and membership, and the destination
 * still has to pass the normal Program page authorization after the redirect.
 */
export async function resolveCurrentPersonalLearningEnrollment(
  store: PersonalLearningEnrollmentStore,
  input: {
    workspaceId: string;
    groupId: string;
    groupMembershipId: string;
    currentEnrollmentId: string;
    now?: Date;
  },
): Promise<string | null> {
  const now = input.now ?? new Date();
  const scope = { workspaceId: input.workspaceId, groupId: input.groupId };
  const programs = await store.serviceProgram.findMany({
    where: {
      ...scope,
      status: 'ACTIVE',
      settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
    },
    select: { id: true, settings: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  if (programs.length === 0) return null;

  const settingsByProgram = new Map(programs.map((program) => [program.id, program.settings]));
  const enrollments = await store.programEnrollment.findMany({
    where: {
      ...scope,
      groupMembershipId: input.groupMembershipId,
      serviceProgramId: { in: programs.map(({ id }) => id) },
      id: { not: input.currentEnrollmentId },
      status: 'ACTIVE',
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
    },
    select: { id: true, serviceProgramId: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  const eligible = enrollments.filter((enrollment) =>
    personalLearningDynamicProgramAllows(
      settingsByProgram.get(enrollment.serviceProgramId),
      enrollment.id,
    ),
  );
  if (eligible.length === 0) return null;

  const seats = await store.personalLearningPilotSeat.findMany({
    where: {
      ...scope,
      programEnrollmentId: { in: eligible.map(({ id }) => id) },
      kind: 'INTERNAL',
      cohort: 'INTERNAL',
      revokedAt: null,
    },
    select: { programEnrollmentId: true },
  });
  const seated = new Set(seats.map(({ programEnrollmentId }) => programEnrollmentId));
  return eligible.find(({ id }) => seated.has(id))?.id ?? null;
}
