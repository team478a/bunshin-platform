import { describe, expect, it, vi } from 'vitest';
import type {
  ImprovementObservation,
  ImprovementAdapterDefinition,
} from '@bunshin/platform-domain';
import {
  CollectImprovementObservations,
  type ImprovementReadRequest,
} from '../src/improvement-engine';

const definition: ImprovementAdapterDefinition = {
  key: 'hassy-fixture',
  version: 'v1',
  packageKey: 'SOCIAL',
  subtypes: ['PHOTO_FIRST'],
  metadataRules: {
    qualityCode: { kind: 'CODE', values: ['UNCONFIRMED_FACT'] },
    repairCount: { kind: 'COUNT', max: 1 },
  },
};
const request: ImprovementReadRequest = {
  actorUserId: 'admin-a',
  scope: {
    tenantRef: 'tenant-a',
    workspaceId: 'workspace-a',
    serviceId: 'service-a',
    adapterKey: definition.key,
    packageKey: definition.packageKey,
    environment: 'DEVELOPMENT',
  },
  fromInclusive: new Date('2026-10-01T00:00:00Z'),
  toExclusive: new Date('2026-10-02T00:00:00Z'),
  limit: 100,
  subject: { userRef: 'user-a', bunshinRef: 'bunshin-a' },
};
function observation(): ImprovementObservation {
  return {
    scope: { ...request.scope },
    source: { kind: 'VariantGeneration', id: 'generation-a', revision: 'v1' },
    occurredAt: new Date('2026-10-01T12:00:00Z'),
    feature: 'photo-first',
    action: 'quality',
    eventType: 'CHECKED',
    status: 'PASS',
    category: 'AI_QUALITY',
    purpose: 'PRODUCT_IMPROVEMENT',
    subtype: 'PHOTO_FIRST',
    errorCode: null,
    correlation: { kind: 'UNAVAILABLE', key: null },
    releaseSha: null,
    userRef: 'user-a',
    bunshinRef: 'bunshin-a',
    entityRef: 'mission-a',
    metadata: {
      qualityCode: 'UNCONFIRMED_FACT',
      repairCount: 1,
      token: 'secret-value',
      answer: 'private-answer',
    },
  };
}
function setup(rows: ImprovementObservation[], adapterDefinition = definition) {
  const authorize = vi.fn().mockResolvedValue(true);
  const readObservations = vi.fn().mockResolvedValue({
    observations: rows,
    coverage: { completeness: 'COMPLETE', missingCount: 0, truncated: false },
  });
  return {
    authorize,
    readObservations,
    collect: new CollectImprovementObservations(
      { authorize },
      { definition: adapterDefinition, readObservations },
    ),
  };
}

describe('improvement observation adapter contract', () => {
  it('collects Hassy quality signals, removes private metadata and deduplicates source records', async () => {
    const row = Object.assign(observation(), { rawPrompt: 'private-prompt' });
    Object.assign(row.source, { privateText: 'private-source-text' });
    const { collect, authorize } = setup([row, row]);
    const result = await collect.execute(request);
    expect(authorize).toHaveBeenCalledWith(request);
    expect(result.duplicateCount).toBe(1);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]?.metadata).toEqual({
      qualityCode: 'UNCONFIRMED_FACT',
      repairCount: 1,
    });
    expect(result.observations[0]?.correlation).toEqual({ kind: 'UNAVAILABLE', key: null });
    expect(JSON.stringify(result)).not.toContain('secret-value');
    expect(JSON.stringify(result)).not.toContain('private-');
  });

  it('supports a training fixture without SNS Goal or Photo First configuration', async () => {
    const trainingDefinition: ImprovementAdapterDefinition = {
      key: 'training-fixture',
      version: 'v1',
      packageKey: 'TRAINING',
      subtypes: ['DIFFICULTY'],
      metadataRules: { attempts: { kind: 'COUNT', max: 5 } },
    };
    const scope = {
      ...request.scope,
      serviceId: 'training-service',
      adapterKey: trainingDefinition.key,
      packageKey: 'TRAINING',
    };
    const row = {
      ...observation(),
      scope,
      source: { kind: 'ProgramActionEvent', id: 'event-a', revision: null },
      subtype: 'DIFFICULTY',
      purpose: 'USER_SUCCESS' as const,
      category: 'SERVICE_SPECIFIC' as const,
      metadata: { attempts: 3, answerText: 'private-answer' },
    };
    const result = await setup([row], trainingDefinition).collect.execute({ ...request, scope });
    expect(result.observations[0]?.metadata).toEqual({ attempts: 3 });
    expect(result.observations[0]?.purpose).toBe('USER_SUCCESS');
    expect(JSON.stringify(result)).not.toContain('PHOTO_FIRST');
  });

  it('does not read data when scope authorization is denied', async () => {
    const { collect, authorize, readObservations } = setup([observation()]);
    authorize.mockResolvedValue(false);
    await expect(collect.execute(request)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(readObservations).not.toHaveBeenCalled();
  });

  it.each([
    'tenantRef',
    'workspaceId',
    'serviceId',
    'packageKey',
    'adapterKey',
    'environment',
  ] as const)('rejects a source crossing the %s boundary', async (key) => {
    const row = observation();
    const scope = { ...row.scope, [key]: key === 'environment' ? 'PRODUCTION' : 'other' };
    await expect(setup([{ ...row, scope }]).collect.execute(request)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it.each(['userRef', 'bunshinRef'] as const)(
    'rejects a source crossing the %s subject boundary',
    async (key) => {
      await expect(
        setup([{ ...observation(), [key]: 'other' }]).collect.execute(request),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    },
  );

  it('fails conflicting revisions instead of silently choosing one', async () => {
    const first = observation();
    await expect(
      setup([first, { ...first, status: 'REJECT' }]).collect.execute(request),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it.each([
    { subtype: 'UNKNOWN_SUBTYPE' },
    { metadata: { repairCount: 2 } },
    { metadata: { qualityCode: 'arbitrary-private-text' } },
    { occurredAt: new Date('invalid') },
    { occurredAt: request.toExclusive },
    { occurredAt: new Date('2026-09-30T23:59:59Z') },
    { releaseSha: 'short-sha' },
    { correlation: { kind: 'JOB' as const, key: null } },
  ])('rejects invalid adapter output without echoing values (%j)', async (patch) => {
    const result = setup([{ ...observation(), ...patch }]).collect.execute(request);
    await expect(result).rejects.toThrow('invalid improvement adapter output');
  });

  it('retains unknown sample coverage rather than filling missing measurements with zero', async () => {
    const { collect, readObservations } = setup([]);
    readObservations.mockResolvedValue({
      observations: [],
      coverage: { completeness: 'UNKNOWN', missingCount: null, truncated: false },
    });
    const result = await collect.execute(request);
    expect(result.coverage).toEqual({
      completeness: 'UNKNOWN',
      missingCount: null,
      truncated: false,
    });
  });

  it('preserves truncation and rejects a falsely complete batch or excessive results', async () => {
    const { collect, readObservations } = setup([observation()]);
    readObservations.mockResolvedValue({
      observations: [observation()],
      coverage: { completeness: 'PARTIAL', missingCount: null, truncated: true },
    });
    expect((await collect.execute(request)).coverage.truncated).toBe(true);
    readObservations.mockResolvedValue({
      observations: [],
      coverage: { completeness: 'COMPLETE', missingCount: 0, truncated: true },
    });
    await expect(collect.execute(request)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      setup([observation(), observation()]).collect.execute({ ...request, limit: 1 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects invalid periods, limits and adapter choices before reading', async () => {
    const { collect, readObservations } = setup([]);
    await expect(collect.execute({ ...request, limit: 0 })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(
      collect.execute({ ...request, toExclusive: request.fromInclusive }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      collect.execute({ ...request, scope: { ...request.scope, adapterKey: 'other' } }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(readObservations).not.toHaveBeenCalled();
  });
});
