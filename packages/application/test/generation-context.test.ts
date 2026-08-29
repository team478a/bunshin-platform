import { describe, expect, it } from 'vitest';
import {
  GetGenerationContextSnapshot,
  RecordGenerationContextSnapshot,
  type GenerationContextSnapshot,
  type GenerationContextSnapshotPayload,
  type GenerationContextSnapshotRepository,
} from '../src';

const payload = (): GenerationContextSnapshotPayload => ({
  personality: { id: 'personality-1' },
  selectedMemories: [
    { id: 'memory-1', summary: '短い要約', selectionReason: '今回のテーマに関連する' },
  ],
  knowledge: [{ id: 'knowledge-1' }],
  groupKnowledge: [{ id: 'group-chunk-1' }],
  socialProfile: { id: 'profile-1' },
  strategy: { id: 'strategy-1', version: 2 },
  weeklyPlan: { id: 'plan-1' },
  contentPillar: { id: 'pillar-1' },
  productPack: null,
  trendCandidates: [{ id: 'trend-1' }],
  promptVersion: 'daily-v2',
  provider: 'openai',
  model: 'gpt-test',
  quality: { verdict: 'PASS', issueCodes: [], repairCount: 0 },
});

class Snapshots implements GenerationContextSnapshotRepository {
  value: GenerationContextSnapshot | null = null;

  create(input: Parameters<GenerationContextSnapshotRepository['create']>[0]) {
    if (this.value) return Promise.resolve(null);
    this.value = {
      id: 'snapshot-1',
      workspaceId: input.workspaceId,
      bunshinId: input.bunshinId,
      dailyMissionId: input.dailyMissionId,
      schemaVersion: input.schemaVersion,
      payload: input.payload,
      generatedAt: input.generatedAt,
      createdAt: new Date(),
    };
    return Promise.resolve(this.value);
  }

  find(input: Parameters<GenerationContextSnapshotRepository['find']>[0]) {
    if (
      this.value?.workspaceId !== input.workspaceId ||
      this.value.bunshinId !== input.bunshinId ||
      this.value.dailyMissionId !== input.dailyMissionId
    )
      return Promise.resolve(null);
    return Promise.resolve(this.value);
  }
}

const scope = {
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  actorUserId: 'user-1',
  dailyMissionId: 'mission-1',
};

describe('Generation Context Snapshot', () => {
  it('records a versioned immutable generation context contract', async () => {
    const repository = new Snapshots();
    const generatedAt = new Date('2026-08-25T00:00:00.000Z');
    const value = await new RecordGenerationContextSnapshot(repository).execute({
      ...scope,
      payload: payload(),
      generatedAt,
    });
    expect(value).toMatchObject({ schemaVersion: 1, generatedAt, payload: payload() });
    await expect(new GetGenerationContextSnapshot(repository).execute(scope)).resolves.toEqual(
      value,
    );
  });

  it('rejects duplicate references and invalid quality metadata before persistence', async () => {
    const repository = new Snapshots();
    await expect(
      new RecordGenerationContextSnapshot(repository).execute({
        ...scope,
        payload: {
          ...payload(),
          knowledge: [{ id: 'same' }, { id: 'same' }],
        },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repository.value).toBeNull();
    await expect(
      new RecordGenerationContextSnapshot(repository).execute({
        ...scope,
        payload: {
          ...payload(),
          groupKnowledge: [{ id: 'same' }, { id: 'same' }],
        },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('does not expose a snapshot outside its workspace and Bunshin scope', async () => {
    const repository = new Snapshots();
    await new RecordGenerationContextSnapshot(repository).execute({ ...scope, payload: payload() });
    await expect(
      new GetGenerationContextSnapshot(repository).execute({
        ...scope,
        workspaceId: 'workspace-2',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      new GetGenerationContextSnapshot(repository).execute({ ...scope, bunshinId: 'bunshin-2' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
