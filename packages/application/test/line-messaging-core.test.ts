import { describe, expect, it, vi } from 'vitest';
import {
  ConsumeMissionDeepLinkState,
  IssueMissionDeepLinkState,
  PrepareLineMissionDelivery,
  type LineMessageDeliveryRepository,
  type MissionDeepLinkSignerPort,
  type MissionDeepLinkState,
  type MissionDeepLinkStateRepository,
} from '../src';

const stateId = '77d8baef-d7de-48d7-975e-c7c0ea4c81bf';
const now = new Date('2026-08-22T04:00:00.123Z');

function state(overrides: Partial<MissionDeepLinkState> = {}): MissionDeepLinkState {
  return {
    id: stateId,
    environment: 'PRODUCTION',
    workspaceId: 'workspace-a',
    bunshinId: 'bunshin-a',
    userId: 'user-a',
    dailyMissionId: 'mission-a',
    keyVersion: 2,
    expiresAt: new Date('2026-08-22T04:10:00.000Z'),
    consumedAt: null,
    createdAt: now,
    ...overrides,
  };
}

describe('LINE messaging core', () => {
  it('prepares an idempotent delivery through the scoped repository boundary', async () => {
    const delivery = {
      id: 'delivery-a',
      environment: 'PRODUCTION' as const,
      workspaceId: 'workspace-a',
      bunshinId: 'bunshin-a',
      userId: 'user-a',
      dailyMissionId: 'mission-a',
      kind: 'DAILY_MISSION' as const,
      status: 'PENDING' as const,
      idempotencyKey: 'mission-a:daily',
      scheduledAt: now,
      sentAt: null,
      cancelledAt: null,
      lastErrorCategory: null,
      attemptCount: 0,
      leaseOwner: null,
      leaseExpiresAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const repository = {
      getScoped: vi.fn(),
      prepare: vi.fn().mockResolvedValue(delivery),
      claim: vi.fn(),
      recordAttempt: vi.fn(),
      releaseClaim: vi.fn(),
    } satisfies LineMessageDeliveryRepository;
    await expect(
      new PrepareLineMissionDelivery(repository).execute({
        environment: 'PRODUCTION',
        workspaceId: 'workspace-a',
        bunshinId: 'bunshin-a',
        actorUserId: 'user-a',
        dailyMissionId: 'mission-a',
        kind: 'DAILY_MISSION',
        idempotencyKey: 'mission-a:daily',
        scheduledAt: now,
      }),
    ).resolves.toEqual(delivery);
  });

  it('stores scope server-side and signs only an opaque short-lived state reference', async () => {
    const repository = {
      create: vi.fn().mockImplementation((input) =>
        Promise.resolve(
          state({
            id: input.id,
            environment: input.environment,
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            userId: input.actorUserId,
            dailyMissionId: input.dailyMissionId,
            keyVersion: input.keyVersion,
            expiresAt: input.expiresAt,
          }),
        ),
      ),
      consume: vi.fn(),
    } satisfies MissionDeepLinkStateRepository;
    const signer = {
      sign: vi.fn().mockResolvedValue('opaque-token'),
      verify: vi.fn(),
    } satisfies MissionDeepLinkSignerPort;
    const result = await new IssueMissionDeepLinkState(repository, signer, () => now).execute({
      stateId,
      environment: 'PRODUCTION',
      workspaceId: 'workspace-a',
      bunshinId: 'bunshin-a',
      actorUserId: 'user-a',
      dailyMissionId: 'mission-a',
      keyVersion: 2,
    });
    expect(result).toEqual({
      token: 'opaque-token',
      expiresAt: new Date('2026-08-22T04:10:00.000Z'),
    });
    expect(signer.sign).toHaveBeenCalledWith({
      stateId,
      environment: 'PRODUCTION',
      keyVersion: 2,
      expiresAtEpochSeconds: 1_787_371_800,
    });
  });

  it('atomically consumes using the signed version, expiry, actor and environment', async () => {
    const stored = state();
    const repository = {
      create: vi.fn(),
      consume: vi.fn().mockResolvedValue(stored),
    } satisfies MissionDeepLinkStateRepository;
    const signer = {
      sign: vi.fn(),
      verify: vi.fn().mockResolvedValue({
        stateId,
        environment: 'PRODUCTION',
        keyVersion: 2,
        expiresAtEpochSeconds: 1_787_371_800,
      }),
    } satisfies MissionDeepLinkSignerPort;
    await expect(
      new ConsumeMissionDeepLinkState(repository, signer, () => now).execute({
        token: 'opaque-token',
        environment: 'PRODUCTION',
        actorUserId: 'user-a',
      }),
    ).resolves.toBe(stored);
    expect(repository.consume).toHaveBeenCalledWith({
      id: stateId,
      environment: 'PRODUCTION',
      actorUserId: 'user-a',
      keyVersion: 2,
      expiresAt: new Date('2026-08-22T04:10:00.000Z'),
      now,
    });
  });

  it('rejects expired or cross-environment states before repository consumption', async () => {
    const repository = {
      create: vi.fn(),
      consume: vi.fn(),
    } satisfies MissionDeepLinkStateRepository;
    const signer = {
      sign: vi.fn(),
      verify: vi.fn().mockResolvedValue({
        stateId,
        environment: 'STAGING',
        keyVersion: 1,
        expiresAtEpochSeconds: 1_787_371_800,
      }),
    } satisfies MissionDeepLinkSignerPort;
    await expect(
      new ConsumeMissionDeepLinkState(repository, signer, () => now).execute({
        token: 'opaque-token',
        environment: 'PRODUCTION',
        actorUserId: 'user-a',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(repository.consume).not.toHaveBeenCalled();
  });
});
