import {
  AI_RESALE_V1_MODULE_KEY,
  parseAiResaleRuntimeSettings,
  type AiResaleRuntimeSettings,
} from '@bunshin/capability-resale';
import type { Prisma, PrismaClient } from '@prisma/client';
import { addProgramCalendarDays } from './resale-runtime-calendar';
export type Db = PrismaClient | Prisma.TransactionClient;
export type Membership = {
  id: string;
  workspaceId: string;
  groupId: string;
  userId: string;
  consentedAt: Date | null;
  createdAt: Date;
};

export type RuntimeProgram = {
  id: string;
  workspaceId: string;
  groupId: string;
  programTemplateVersionId: string;
  createdAt: Date;
  settings: AiResaleRuntimeSettings;
};

function jsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function supportModes(value: unknown) {
  if (!jsonObject(value) || !Array.isArray(value['supportModes'])) return [];
  return value['supportModes'].filter((entry): entry is string => typeof entry === 'string');
}

export async function runtimePrograms(
  db: Db,
  scope?: { workspaceId: string; groupId: string },
): Promise<RuntimeProgram[]> {
  const rows = await db.serviceProgram.findMany({
    where: {
      ...(scope ?? {}),
      status: 'ACTIVE',
      settings: { path: ['moduleKey'], equals: AI_RESALE_V1_MODULE_KEY },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return rows.flatMap((row) => {
    try {
      const settings = parseAiResaleRuntimeSettings(row.settings);
      return settings === null ? [] : [{ ...row, settings }];
    } catch {
      return [];
    }
  });
}

async function activeFreeOffering(db: Db, program: RuntimeProgram, now: Date) {
  const offering = await db.programOffering.findFirst({
    where: {
      workspaceId: program.workspaceId,
      groupId: program.groupId,
      serviceProgramId: program.id,
      status: 'ACTIVE',
      isFree: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
    },
    orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
  });
  if (!offering) return null;
  const allowedModes = supportModes(offering.termsSnapshot);
  if (allowedModes.length > 0 && !allowedModes.includes(program.settings.supportMode)) return null;
  return offering;
}

export async function enrollMembershipInProgram(
  db: Db,
  input: { membership: Membership; program: RuntimeProgram; now: Date },
) {
  const { membership, program, now } = input;
  if (
    !program.settings.automaticEnrollment ||
    program.settings.policyKey !== 'FREE_7D' ||
    membership.consentedAt === null
  ) {
    return false;
  }
  const [offering, publicRegistration] = await Promise.all([
    activeFreeOffering(db, program, now),
    db.serviceRegistrationPolicy.findFirst({
      where: {
        workspaceId: membership.workspaceId,
        groupId: membership.groupId,
        mode: 'PUBLIC',
      },
      select: { id: true },
    }),
  ]);
  if (!offering || !publicRegistration) return false;
  const enrollmentAvailableAt = offering.startsAt ?? offering.createdAt;
  const registrationAt = membership.consentedAt ?? membership.createdAt;
  const startsAt = registrationAt > enrollmentAvailableAt ? registrationAt : enrollmentAvailableAt;
  const created = await db.programEnrollment.createMany({
    data: [
      {
        workspaceId: membership.workspaceId,
        groupId: membership.groupId,
        groupMembershipId: membership.id,
        serviceProgramId: program.id,
        programOfferingId: offering.id,
        status: 'ACTIVE',
        supportMode: program.settings.supportMode,
        goalSnapshot: {
          source: 'PUBLIC_REGISTRATION',
          policyKey: program.settings.policyKey,
        },
        offeringSnapshot: {
          version: offering.version,
          isFree: offering.isFree,
          seller: offering.seller,
          priceOwner: offering.priceOwner,
          paymentOwner: offering.paymentOwner,
          apiCostOwner: offering.apiCostOwner,
          supportOwner: offering.supportOwner,
          contentOwner: offering.contentOwner,
          characterOwner: offering.characterOwner,
          terms: offering.termsSnapshot,
        },
        invitedByUserId: membership.userId,
        startsAt,
        endsAt: addProgramCalendarDays(startsAt, 7, program.settings.timeZone),
      },
    ],
    skipDuplicates: true,
  });
  if (created.count === 0) return false;
  const enrollment = await db.programEnrollment.findUniqueOrThrow({
    where: {
      groupMembershipId_serviceProgramId: {
        groupMembershipId: membership.id,
        serviceProgramId: program.id,
      },
    },
  });
  await db.programAuditLog.create({
    data: {
      workspaceId: membership.workspaceId,
      groupId: membership.groupId,
      resourceType: 'PROGRAM_ENROLLMENT',
      resourceId: enrollment.id,
      action: 'AUTO_ENROLLED',
      afterData: {
        id: enrollment.id,
        groupMembershipId: membership.id,
        serviceProgramId: program.id,
        programOfferingId: offering.id,
        policyKey: program.settings.policyKey,
        startsAt,
        endsAt: enrollment.endsAt,
      },
      performedByUserId: membership.userId,
    },
  });
  return true;
}

export async function autoEnrollAiResaleForRegistration(
  db: Db,
  input: { membership: Membership; now: Date },
) {
  const programs = await runtimePrograms(db, {
    workspaceId: input.membership.workspaceId,
    groupId: input.membership.groupId,
  });
  let enrolled = 0;
  for (const program of programs) {
    if (await enrollMembershipInProgram(db, { ...input, program })) enrolled += 1;
  }
  return enrolled;
}
