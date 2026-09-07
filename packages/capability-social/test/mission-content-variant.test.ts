import { describe, expect, it, vi } from 'vitest';
import {
  ClaimMissionContentVariantGeneration,
  CompleteMissionContentVariantGeneration,
  ListMissionContentVariants,
  SelectMissionContentVariant,
  type MissionContentVariantRepository,
} from '../src';

const scope = {
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  actorUserId: 'user-1',
  dailyMissionId: 'mission-1',
};

const variant = {
  id: 'variant-1',
  ...scope,
  sequence: 1,
  format: 'TEXT' as const,
  content: { body: '別案', threadParts: [], cta: null, caption: null, hashtags: [] },
  qualityScore: 90,
  model: 'test-model',
  promptVersion: 'variant-v1',
  inputTokens: 10,
  outputTokens: 20,
  estimatedCostMicros: 30n,
  latencyMs: 100,
  createdAt: new Date('2026-09-07T00:00:00Z'),
  selectedAt: null,
};

function repository(overrides: Partial<MissionContentVariantRepository> = {}) {
  return {
    claim: vi.fn().mockResolvedValue({
      acquired: true,
      generation: {
        id: 'generation-1',
        ...scope,
        idempotencyKey: 'operation-1',
        status: 'PROCESSING',
        variantId: null,
        errorCategory: null,
        createdAt: variant.createdAt,
        updatedAt: variant.createdAt,
      },
    }),
    complete: vi.fn().mockResolvedValue(variant),
    fail: vi.fn().mockResolvedValue(true),
    list: vi.fn().mockResolvedValue([variant]),
    select: vi.fn().mockResolvedValue({ ...variant, selectedAt: variant.createdAt }),
    ...overrides,
  } satisfies MissionContentVariantRepository;
}

describe('mission content variants', () => {
  it('claims generation with a bounded idempotency key', async () => {
    const repo = repository();
    await new ClaimMissionContentVariantGeneration(repo).execute({
      ...scope,
      idempotencyKey: 'operation-1',
    });
    expect(repo.claim).toHaveBeenCalledWith({ ...scope, idempotencyKey: 'operation-1' });
  });

  it('normalizes content before completing an append-only variant', async () => {
    const repo = repository();
    await new CompleteMissionContentVariantGeneration(repo).execute({
      ...scope,
      generationId: 'generation-1',
      format: 'TEXT',
      content: { body: ' 別案 ', threadParts: [], cta: null, caption: null, hashtags: [] },
      qualityScore: 90,
      model: 'test-model',
      promptVersion: 'variant-v1',
      inputTokens: 10,
      outputTokens: 20,
      estimatedCostMicros: 30n,
      latencyMs: 100,
    });
    expect(repo.complete).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.objectContaining({ body: '別案' }) }),
    );
  });

  it('returns only scoped variants and records selection idempotently', async () => {
    const repo = repository();
    await expect(new ListMissionContentVariants(repo).execute(scope)).resolves.toEqual([variant]);
    await new SelectMissionContentVariant(repo).execute({
      ...scope,
      variantId: variant.id,
      idempotencyKey: 'selection-1',
      selectedAt: variant.createdAt,
    });
    expect(repo.select).toHaveBeenCalledWith(
      expect.objectContaining({ variantId: variant.id, idempotencyKey: 'selection-1' }),
    );
  });

  it('does not turn an inaccessible mission into an empty list', async () => {
    await expect(
      new ListMissionContentVariants(repository({ list: vi.fn().mockResolvedValue(null) })).execute(
        scope,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
