import { describe, expect, it, vi } from 'vitest';
import { PrismaFortuneRepository } from '../src';

const actorUserId = '00000000-0000-4000-8000-000000000301';
const serviceSlug = 'fortune-service';
const readingId = '00000000-0000-4000-8000-000000000302';

const membership = {
  id: '00000000-0000-4000-8000-000000000303',
  userId: actorUserId,
};

const scope = {
  id: '00000000-0000-4000-8000-000000000304',
  workspaceId: '00000000-0000-4000-8000-000000000305',
  groupId: '00000000-0000-4000-8000-000000000306',
  bunshinId: '00000000-0000-4000-8000-000000000307',
  aiEnabled: true,
  historyRetentionDays: 90,
  group: { memberships: [membership] },
};

const reading = {
  id: readingId,
  localDate: new Date('2026-09-26T00:00:00.000Z'),
  theme: 'WORK',
  cardCode: 'THE_FOOL',
  orientation: 'UPRIGHT',
  status: 'GENERATING',
  readingText: '承認済みの占い本文',
  actionStep: '今日できる小さな行動',
  knowledgeVersionId: null,
  createdAt: new Date('2026-09-26T00:00:00.000Z'),
};

function targetClient(target: unknown = scope) {
  return {
    fortuneServiceSetting: { findFirst: vi.fn().mockResolvedValue(target) },
    fortuneParticipant: { findFirst: vi.fn(), upsert: vi.fn() },
    fortuneReading: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    fortuneKnowledgeVersion: { findFirst: vi.fn() },
    fortuneCardMeaning: { findFirst: vi.fn() },
    fortuneFeedback: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
  };
}

const repository = (client: unknown) =>
  new PrismaFortuneRepository(client as never, () => new Date('2026-09-26T00:00:00.000Z'));

describe('fortune repository isolation', () => {
  it('fails closed before participant access when the actor has no fortune service scope', async () => {
    const client = targetClient(null);

    await expect(
      repository(client).findParticipant({ serviceSlug, actorUserId }),
    ).resolves.toBeNull();
    expect(client.fortuneServiceSetting.findFirst).toHaveBeenCalledWith({
      where: {
        enabled: true,
        configuration: { slug: serviceSlug },
        bunshin: {
          status: 'ACTIVE',
          capabilityAssignments: { some: { capabilityType: 'FORTUNE', status: 'ACTIVE' } },
        },
        workspace: { status: 'ACTIVE' },
        group: {
          status: 'ACTIVE',
          memberships: {
            some: { userId: actorUserId, status: 'ACTIVE', consentedAt: { not: null } },
          },
        },
      },
      include: {
        group: {
          include: {
            memberships: {
              where: { userId: actorUserId, status: 'ACTIVE', consentedAt: { not: null } },
              take: 1,
            },
          },
        },
      },
    });
    expect(client.fortuneParticipant.findFirst).not.toHaveBeenCalled();
  });

  it('does not join when the resolved service has no matching active membership', async () => {
    const tx = targetClient({ ...scope, group: { memberships: [] } });
    const client = {
      $transaction: vi.fn((callback: (transaction: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };

    await expect(
      repository(client).joinParticipant({
        serviceSlug,
        actorUserId,
        ageConfirmedAt: new Date('2026-09-26T00:00:00.000Z'),
      }),
    ).resolves.toBeNull();
    expect(tx.fortuneParticipant.upsert).not.toHaveBeenCalled();
  });

  it('scopes a reading lookup to the resolved service and authenticated user', async () => {
    const client = targetClient();
    client.fortuneReading.findFirst.mockResolvedValue(null);

    await expect(
      repository(client).findReading({
        serviceSlug,
        actorUserId,
        readingId,
      }),
    ).resolves.toBeNull();
    expect(client.fortuneReading.findFirst).toHaveBeenCalledWith({
      where: {
        id: readingId,
        serviceSettingId: scope.id,
        memberUserId: actorUserId,
        status: { not: 'DELETED' },
        localDate: { gte: new Date('2026-06-29T00:00:00.000Z') },
      },
    });
  });

  it('does not create a reading without the actor participant in the resolved service', async () => {
    const tx = targetClient();
    tx.fortuneParticipant.findFirst.mockResolvedValue(null);
    const client = {
      $transaction: vi.fn((callback: (transaction: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };

    await expect(
      repository(client).createBasicReading({
        serviceSlug,
        actorUserId,
        localDate: '2026-09-26',
        theme: 'WORK',
        cardCode: 'THE_FOOL',
        orientation: 'UPRIGHT',
      }),
    ).resolves.toEqual({ kind: 'NOT_PARTICIPANT' });
    expect(tx.fortuneKnowledgeVersion.findFirst).not.toHaveBeenCalled();
    expect(tx.fortuneReading.upsert).not.toHaveBeenCalled();
  });

  it('returns only the Bunshin resolved from the actor service when claiming AI generation', async () => {
    const tx = targetClient();
    tx.fortuneReading.updateMany.mockResolvedValue({ count: 1 });
    tx.fortuneReading.findFirst.mockResolvedValue(reading);
    const client = {
      $transaction: vi.fn((callback: (transaction: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };

    await expect(
      repository(client).claimAiGeneration({
        serviceSlug,
        actorUserId,
        readingId,
      }),
    ).resolves.toMatchObject({
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      bunshinId: scope.bunshinId,
      reading: { id: readingId },
    });
    expect(tx.fortuneReading.updateMany).toHaveBeenCalledWith({
      where: {
        id: readingId,
        serviceSettingId: scope.id,
        memberUserId: actorUserId,
        status: 'READY_BASIC',
      },
      data: { status: 'GENERATING', failureCode: null },
    });
  });

  it('does not save feedback for another user or service reading', async () => {
    const tx = targetClient();
    tx.fortuneReading.findFirst.mockResolvedValue(null);
    const client = {
      $transaction: vi.fn((callback: (transaction: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };

    await expect(
      repository(client).submitFeedback({
        serviceSlug,
        actorUserId,
        readingId,
        rating: 'HELPFUL',
        issue: null,
        submittedAt: new Date('2026-09-26T00:00:00.000Z'),
      }),
    ).resolves.toBeNull();
    expect(tx.fortuneReading.findFirst).toHaveBeenCalledWith({
      where: {
        id: readingId,
        serviceSettingId: scope.id,
        memberUserId: actorUserId,
        status: { in: ['READY_AI', 'READY_BASIC'] },
        localDate: { gte: new Date('2026-06-29T00:00:00.000Z') },
        firstViewedAt: { not: null },
      },
    });
    expect(tx.fortuneFeedback.upsert).not.toHaveBeenCalled();
  });

  it('does not complete AI generation when the scoped transition was not applied', async () => {
    const client = targetClient();
    client.fortuneReading.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository(client).completeAiGeneration({
        serviceSlug,
        actorUserId,
        readingId,
        output: {
          body: '個別の占い本文',
          actionStep: '小さな一歩',
          model: 'test-model',
          promptVersion: 'test-prompt-v1',
          inputTokens: 10,
          outputTokens: 20,
          latencyMs: 50,
        },
      }),
    ).resolves.toBeNull();
    expect(client.fortuneReading.findFirst).not.toHaveBeenCalled();
  });

  it('does not return a stale reading when the scoped fallback transition was not applied', async () => {
    const client = targetClient();
    client.fortuneReading.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository(client).fallbackAiGeneration({
        serviceSlug,
        actorUserId,
        readingId,
        failureCode: 'AI_GENERATION_FAILED',
      }),
    ).resolves.toBeNull();
    expect(client.fortuneReading.findFirst).not.toHaveBeenCalled();
  });
});
