import { describe, expect, it } from 'vitest';
import {
  CreatePersonalityVersion,
  ListPersonalityVersions,
  RestorePersonalityVersion,
  type BunshinPersonalityVersion,
  type PersonalityVersionRepository,
} from '../src';

const content = {
  tone: 'やさしい',
  formality: 'ふつう',
  energyLevel: '落ち着いている',
  expertiseLevel: '初心者にもわかる',
  sentenceStyle: '短い文',
  firstPerson: 'わたし',
  forbiddenExpressions: ['絶対に成功する'],
  preferredExpressions: ['いっしょに考えましょう'],
  visualDirection: null,
  facePolicy: 'FULL_ANONYMOUS' as const,
};

class Versions implements PersonalityVersionRepository {
  values: BunshinPersonalityVersion[] = [];

  create(input: Parameters<PersonalityVersionRepository['create']>[0]) {
    const value: BunshinPersonalityVersion = {
      id: `version-${this.values.length + 1}`,
      workspaceId: input.workspaceId,
      bunshinId: input.bunshinId,
      version: this.values.length + 1,
      source: input.source,
      changeReason: input.changeReason,
      basedOnVersionId: input.basedOnVersionId ?? null,
      createdByUserId: input.actorUserId,
      createdAt: new Date(),
      ...input.content,
    };
    this.values.unshift(value);
    return Promise.resolve(value);
  }

  restore(input: Parameters<PersonalityVersionRepository['restore']>[0]) {
    const target = this.values.find(({ id }) => id === input.versionId);
    if (!target) return Promise.resolve(null);
    const value: BunshinPersonalityVersion = {
      ...target,
      id: `version-${this.values.length + 1}`,
      version: this.values.length + 1,
      source: 'RESTORE',
      changeReason: input.changeReason,
      basedOnVersionId: target.id,
      createdByUserId: input.actorUserId,
      createdAt: new Date(),
    };
    this.values.unshift(value);
    return Promise.resolve(value);
  }

  list(input: Parameters<PersonalityVersionRepository['list']>[0]) {
    return Promise.resolve(
      this.values.filter(
        ({ workspaceId, bunshinId }) =>
          workspaceId === input.workspaceId && bunshinId === input.bunshinId,
      ),
    );
  }
}

const scope = { workspaceId: 'workspace-1', bunshinId: 'bunshin-1', actorUserId: 'user-1' };

describe('Personality Version', () => {
  it('normalizes and records an immutable manual version', async () => {
    const repository = new Versions();
    const value = await new CreatePersonalityVersion(repository).execute({
      ...scope,
      source: 'MANUAL',
      changeReason: ' 話し方を調整 ',
      content: { ...content, tone: ' やさしい ' },
    });
    expect(value).toMatchObject({ version: 1, tone: 'やさしい', changeReason: '話し方を調整' });
  });

  it('restores an old value by creating a new version', async () => {
    const repository = new Versions();
    const first = await new CreatePersonalityVersion(repository).execute({
      ...scope,
      source: 'MANUAL',
      changeReason: '最初の調整',
      content,
    });
    await new CreatePersonalityVersion(repository).execute({
      ...scope,
      source: 'LEARNING',
      changeReason: '学習結果',
      content: { ...content, tone: '元気' },
    });
    const restored = await new RestorePersonalityVersion(repository).execute({
      ...scope,
      versionId: first.id,
      changeReason: '元に戻す',
    });
    expect(restored).toMatchObject({ version: 3, source: 'RESTORE', basedOnVersionId: first.id });
    await expect(new ListPersonalityVersions(repository).execute(scope)).resolves.toHaveLength(3);
  });

  it('rejects duplicate or blank expressions before persistence', async () => {
    const repository = new Versions();
    await expect(
      new CreatePersonalityVersion(repository).execute({
        ...scope,
        source: 'MANUAL',
        changeReason: '調整',
        content: { ...content, preferredExpressions: ['同じ', '同じ'] },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repository.values).toHaveLength(0);
  });
});
