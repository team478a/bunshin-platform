import { describe, expect, it, vi } from 'vitest';
import { PrismaMissionContentVariantRepository } from '../src';

const input = {
  workspaceId: 'workspace-1',
  groupId: 'group-1',
  bunshinId: 'bunshin-1',
  actorUserId: 'user-1',
  dailyMissionId: 'mission-1',
  idempotencyKey: 'confirmation-1',
};

function client(latestVariant: {
  id: string;
  sequence: number;
  photoFirstMetadata: null | { id: string };
}) {
  const generation = {
    id: 'generation-2',
    ...input,
    status: 'PROCESSING',
    variantId: null,
    errorCategory: null,
    createdAt: new Date('2026-10-02T00:00:00Z'),
    updatedAt: new Date('2026-10-02T00:00:00Z'),
  };
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    dailyMission: {
      findFirst: vi.fn().mockResolvedValue({
        id: input.dailyMissionId,
        format: 'TEXT',
        bunshin: {
          ownerUserId: input.actorUserId,
          workspace: { memberships: [{ role: 'MEMBER' }] },
        },
      }),
    },
    missionContentVariant: { findFirst: vi.fn().mockResolvedValue(latestVariant) },
    missionContentVariantGeneration: {
      findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null),
      create: vi.fn().mockResolvedValue(generation),
    },
  };
  return {
    tx,
    database: { $transaction: (operation: (value: typeof tx) => unknown) => operation(tx) },
  };
}

describe('Photo First confirmation variant claim', () => {
  it('allows only the latest Photo First variant to start an answer revision', async () => {
    const { database, tx } = client({
      id: 'variant-1',
      sequence: 1,
      photoFirstMetadata: { id: 'metadata-1' },
    });

    await expect(
      new PrismaMissionContentVariantRepository(database as never).claim({
        ...input,
        sourceVariantId: 'variant-1',
      }),
    ).resolves.toMatchObject({ acquired: true, generation: { id: 'generation-2' } });
    expect(tx.missionContentVariantGeneration.create).toHaveBeenCalledOnce();
  });

  it('rejects a stale, non-Photo-First or cross-scope source before creating a generation', async () => {
    const { database, tx } = client({
      id: 'variant-2',
      sequence: 2,
      photoFirstMetadata: { id: 'metadata-2' },
    });

    await expect(
      new PrismaMissionContentVariantRepository(database as never).claim({
        ...input,
        sourceVariantId: 'variant-1',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(tx.missionContentVariantGeneration.create).not.toHaveBeenCalled();
  });

  it('appends the confirmed result as the next sequence instead of overwriting its source', async () => {
    const createdAt = new Date('2026-10-02T00:00:00Z');
    const completed = {
      id: 'variant-2',
      workspaceId: input.workspaceId,
      bunshinId: input.bunshinId,
      dailyMissionId: input.dailyMissionId,
      actorUserId: input.actorUserId,
      sequence: 2,
      format: 'TEXT',
      contentJson: { body: '回答反映後の本文' },
      qualityScore: 90,
      model: 'test-model',
      promptVersion: 'test-prompt',
      inputTokens: 10,
      outputTokens: 20,
      estimatedCostMicros: 30n,
      latencyMs: 100,
      createdAt,
      selections: [],
      photoFirstMetadata: {
        photoMemoryId: 'photo-1',
        analysisJson: {
          imageType: '手元写真',
          subjects: [],
          objects: [],
          scene: '店内',
          visibleText: [],
          possibleContentAngles: [],
          qualityNotes: [],
          uncertainElements: [],
          safetyFlags: [],
        },
        planningJson: {
          theme: '確認後のテーマ',
          angle: '確認後の切り口',
          recommendationReason: '確認できたため',
          photoUsage: '写真を使う',
          imageEditPrompt: null,
          confirmationQuestion: null,
          confirmationAnswer: '公開可能です',
          confirmationSourceVariantId: 'variant-1',
        },
        analyzerModel: 'test-model',
        analyzerPromptVersion: 'photo-first-v3',
      },
    };
    const tx = {
      dailyMission: {
        findFirst: vi.fn().mockResolvedValue({
          id: input.dailyMissionId,
          format: 'TEXT',
          bunshin: {
            ownerUserId: input.actorUserId,
            workspace: { memberships: [{ role: 'MEMBER' }] },
          },
        }),
      },
      missionContentVariantGeneration: {
        findFirst: vi.fn().mockResolvedValue({ id: 'generation-2' }),
        update: vi.fn().mockResolvedValue({}),
      },
      missionContentVariant: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'variant-1',
          sequence: 1,
          photoFirstMetadata: { id: 'metadata-1' },
        }),
        create: vi.fn().mockResolvedValue({ ...completed, photoFirstMetadata: null }),
        findUnique: vi.fn().mockResolvedValue(completed),
      },
      missionContentVariantPhotoFirstMetadata: { create: vi.fn().mockResolvedValue({}) },
    };
    const database = {
      $transaction: (operation: (value: typeof tx) => unknown) => operation(tx),
    };

    await expect(
      new PrismaMissionContentVariantRepository(database as never).complete({
        ...input,
        generationId: 'generation-2',
        sourceVariantId: 'variant-1',
        format: 'TEXT',
        content: {
          body: '回答反映後の本文',
          threadParts: [],
          cta: null,
          caption: null,
          hashtags: [],
          photoInstruction: '写真を使う',
        },
        qualityScore: 90,
        qualityAudit: {
          verdict: 'PASS',
          score: 90,
          issueCodes: ['PHOTO_FIRST_UNCONFIRMED_FACT'],
          repairCount: 1,
        },
        model: 'test-model',
        promptVersion: 'test-prompt',
        inputTokens: 10,
        outputTokens: 20,
        estimatedCostMicros: 30n,
        latencyMs: 100,
        photoFirst: {
          photoMemoryId: 'photo-1',
          analysis: completed.photoFirstMetadata.analysisJson,
          planning: completed.photoFirstMetadata.planningJson,
          analyzerModel: 'test-model',
          analyzerPromptVersion: 'photo-first-v3',
        },
      }),
    ).resolves.toMatchObject({ id: 'variant-2', sequence: 2 });
    expect(tx.missionContentVariant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sequence: 2 }) }),
    );
    expect(tx.missionContentVariantPhotoFirstMetadata.create).toHaveBeenCalledOnce();
    expect(tx.missionContentVariantGeneration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          qualityVerdict: 'PASS',
          qualityScore: 90,
          qualityIssueCodes: ['PHOTO_FIRST_UNCONFIRMED_FACT'],
          qualityRepairCount: 1,
        }),
      }),
    );
  });
});
