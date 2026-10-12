import type { PrismaClient } from '@bunshin/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../src/payments/secure-configuration', () => ({
  currentPaymentEnvironment: () => 'TEST',
}));

import { validatedDirectPurchaseContext } from '../src/payments/program-purchase-context';

const settings = {
  moduleKey: 'AI_TRAINING_V1',
  personalLearningPilot: {
    enabled: true,
    enrollmentIds: [],
    participantControl: {
      version: 'PILOT_PARTICIPANT_CAP_V1',
      revision: 1,
      externalParticipantCap: 5,
      internalParticipantCap: 0,
      currentWave: 1,
      currentWaveCap: 5,
    },
  },
  trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
};

const terms = {
  schemaVersion: 1,
  productKind: 'PROGRAM_ACCESS',
  purchaseMode: 'DIRECT',
  amountYen: 19_800,
  currency: 'JPY',
  durationDays: 90,
  supportMode: 'GUIDED',
  timeZone: 'Asia/Tokyo',
};

const client = (registration: object | null, includedMemberLimit: number | null) =>
  ({
    programOffering: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'offering-a',
        serviceProgramId: 'program-a',
        termsSnapshot: terms,
      }),
    },
    organizationPaymentConfiguration: {
      findUnique: vi.fn().mockResolvedValue({
        status: 'ACTIVE',
        lastVerifiedAt: new Date(),
        encryptedWebhookSecret: 'encrypted',
      }),
    },
    groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'membership-a' }) },
    serviceLegalDocument: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { type: 'TERMS' },
          { type: 'PRIVACY' },
          { type: 'COMMERCE_DISCLOSURE' },
        ]),
    },
    serviceProgram: {
      findFirst: vi.fn().mockResolvedValue({ id: 'program-a', settings }),
    },
    programEnrollment: { findFirst: vi.fn().mockResolvedValue(null) },
    serviceConfiguration: { findFirst: vi.fn().mockResolvedValue({ id: 'service-a' }) },
    serviceRegistrationPolicy: { findFirst: vi.fn().mockResolvedValue(registration) },
    serviceCommercialSetting: {
      findFirst: vi.fn().mockResolvedValue({ includedMemberLimit }),
    },
  }) as unknown as PrismaClient;

const input = {
  workspaceId: 'workspace-a',
  groupId: 'group-a',
  buyerUserId: 'user-a',
  offeringId: 'offering-a',
};

describe('personal learning ordinary paid registration readiness', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts PUBLIC registration without an invitation inside the active wave cap', async () => {
    await expect(
      validatedDirectPurchaseContext(client({ id: 'registration-a' }, 5), input),
    ).resolves.toMatchObject({ program: { id: 'program-a' } });
  });

  it.each([
    ['non-public registration', null, 5],
    ['missing participant limit', { id: 'registration-a' }, null],
    ['participant limit above wave cap', { id: 'registration-a' }, 6],
  ])('fails closed for %s', async (_label, registration, limit) => {
    await expect(
      validatedDirectPurchaseContext(client(registration, limit), input),
    ).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });
  });
});
