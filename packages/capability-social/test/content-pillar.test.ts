import type { BunshinCapabilityAssignmentRepository } from '@bunshin/application';
import { describe, expect, it } from 'vitest';
import {
  CreateContentPillar,
  normalizeCreateContentPillarInput,
  normalizeUpdateContentPillarInput,
  type ContentPillar,
  type ContentPillarRepository,
} from '../src';

const now = new Date('2026-08-19T00:00:00Z');
const base = { workspaceId: 'workspace-1', actorUserId: 'user-1', bunshinId: 'bunshin-1' };

class Assignments implements BunshinCapabilityAssignmentRepository {
  constructor(private readonly status: 'MISSING' | 'ACTIVE' | 'SUSPENDED' | 'LOCKED') {}
  assign() {
    return Promise.resolve(null);
  }
  list() {
    return Promise.resolve([]);
  }
  find() {
    return Promise.resolve(
      this.status === 'MISSING'
        ? null
        : {
            id: 'assignment-1',
            workspaceId: base.workspaceId,
            bunshinId: base.bunshinId,
            capabilityType: 'SOCIAL' as const,
            status: this.status,
            config: {},
            assignedByUserId: base.actorUserId,
            activatedAt: now,
            createdAt: now,
            updatedAt: now,
          },
    );
  }
  setStatus() {
    return Promise.resolve(null);
  }
}

class Pillars implements ContentPillarRepository {
  value: ContentPillar | null = null;
  create(input: Parameters<ContentPillarRepository['create']>[0]) {
    this.value = {
      id: 'pillar-1',
      workspaceId: input.workspaceId,
      bunshinId: input.bunshinId,
      title: input.title,
      description: input.description ?? null,
      weight: input.weight,
      active: true,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    return Promise.resolve(this.value);
  }
  list() {
    return Promise.resolve(this.value ? [this.value] : []);
  }
  find() {
    return Promise.resolve(this.value);
  }
  update() {
    return Promise.resolve(this.value);
  }
  setActive() {
    return Promise.resolve(this.value);
  }
  softDelete() {
    return Promise.resolve(this.value);
  }
}

describe('Content Pillar', () => {
  it('normalizes text and validates weight boundaries', () => {
    expect(
      normalizeCreateContentPillarInput({
        ...base,
        title: '  教育  ',
        description: '  解説  ',
        weight: 1,
      }),
    ).toMatchObject({ title: '教育', description: '解説', weight: 1 });
    expect(
      normalizeCreateContentPillarInput({ ...base, title: '教育', description: '  ', weight: 100 }),
    ).toMatchObject({ description: null, weight: 100 });
    for (const weight of [0, 1.5, 101]) {
      expect(() =>
        normalizeCreateContentPillarInput({ ...base, title: '教育', weight }),
      ).toThrowError(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    }
  });

  it('rejects invalid titles, descriptions, and empty updates', () => {
    expect(() =>
      normalizeCreateContentPillarInput({ ...base, title: ' ', weight: 1 }),
    ).toThrowError(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(() =>
      normalizeCreateContentPillarInput({ ...base, title: 'a'.repeat(101), weight: 1 }),
    ).toThrowError(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(() =>
      normalizeCreateContentPillarInput({
        ...base,
        title: 'a',
        description: 'x'.repeat(501),
        weight: 1,
      }),
    ).toThrowError(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(() => normalizeUpdateContentPillarInput({ ...base, pillarId: 'pillar-1' })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it.each(['MISSING', 'SUSPENDED', 'LOCKED'] as const)(
    'denies mutation for %s assignment',
    async (status) => {
      const pillars = new Pillars();
      await expect(
        new CreateContentPillar(pillars, new Assignments(status)).execute({
          ...base,
          title: '教育',
          weight: 10,
        }),
      ).rejects.toMatchObject({ code: status === 'MISSING' ? 'NOT_FOUND' : 'FORBIDDEN' });
      expect(pillars.value).toBeNull();
    },
  );

  it('creates only with ACTIVE SOCIAL assignment', async () => {
    await expect(
      new CreateContentPillar(new Pillars(), new Assignments('ACTIVE')).execute({
        ...base,
        title: '教育',
        weight: 10,
      }),
    ).resolves.toMatchObject({ title: '教育', active: true });
  });
});
