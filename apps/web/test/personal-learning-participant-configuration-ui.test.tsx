import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => ({ APP_ENV: 'production' }) }));
import { participantConfigurationTarget } from '../src/services/personal-learning-program-preparation';
import { ParticipantConfigurationCard } from '../app/s/[serviceSlug]/manage/programs/personal-learning-preparation/participant-card';
import {
  participantSnapshot,
  wave0Command,
  readParticipantConfiguration,
  submitWave0Configuration,
} from '../app/s/[serviceSlug]/manage/programs/personal-learning-preparation/participant-client';
const authority = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  groupId: '22222222-2222-4222-8222-222222222222',
  serviceProgramId: '33333333-3333-4333-8333-333333333333',
};
const service = { workspaceId: authority.workspaceId, serviceId: authority.groupId };
const empty = { policy: null, internalCount: 0, externalCount: 0 };
const policy = {
  version: 'PILOT_PARTICIPANT_CAP_V1' as const,
  revision: 1,
  externalParticipantCap: 100,
  internalParticipantCap: 2,
  currentWave: 0,
  currentWaveCap: 0,
};
const read = () => Response.json({ data: { policy, seats: [] } });
const receipt = () =>
  Response.json({ data: { revision: 1, reason: 'PILOT_WAVE_CONFIGURED', replayed: false } });
describe('Wave 0 configuration UI/client', () => {
  beforeEach(() => {
    vi.stubEnv('PERSONAL_LEARNING_PARTICIPANT_PREPARATION', 'true');
    vi.stubEnv('PERSONAL_LEARNING_PRODUCTION_PREPARATION', JSON.stringify(authority));
    vi.stubEnv('PERSONAL_LEARNING_PILOT', 'false');
    vi.stubEnv('PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT', 'false');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it('requires scoped server authority independently of operations flag', () => {
    vi.stubEnv('PERSONAL_LEARNING_PILOT_OPERATIONS', 'false');
    expect(participantConfigurationTarget(service)).toBe(authority.serviceProgramId);
    expect(
      participantConfigurationTarget({ ...service, workspaceId: authority.groupId }),
    ).toBeNull();
    expect(
      participantConfigurationTarget({ ...service, serviceId: authority.workspaceId }),
    ).toBeNull();
  });
  it.each(['PERSONAL_LEARNING_PILOT', 'PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT'])(
    'closes UI when %s is on',
    (flag) => {
      vi.stubEnv(flag, 'true');
      expect(participantConfigurationTarget(service)).toBeNull();
    },
  );
  it('refuses disabled preparation or malformed authority', () => {
    vi.stubEnv('PERSONAL_LEARNING_PARTICIPANT_PREPARATION', 'false');
    expect(participantConfigurationTarget(service)).toBeNull();
    vi.stubEnv('PERSONAL_LEARNING_PARTICIPANT_PREPARATION', 'true');
    vi.stubEnv('PERSONAL_LEARNING_PRODUCTION_PREPARATION', '{');
    expect(participantConfigurationTarget(service)).toBeNull();
  });
  it('does not read, save, confirm or render a save button before explicit GET', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const html = renderToStaticMarkup(
      <ParticipantConfigurationCard serviceSlug="test" programId={authority.serviceProgramId} />,
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(html).toContain('現在の人数設定を確認');
    expect(html).toContain('初期候補は未保存');
    expect(html).not.toContain('停止状態で人数設定を保存</button>');
    expect(html).not.toContain('checked=""');
  });
  it('counts revoked seats and excludes identifiers from UI state', () => {
    const snapshot = participantSnapshot({
      policy,
      seats: [{ kind: 'INTERNAL', programEnrollmentId: 'private', revokedAt: 'yesterday' }],
    });
    expect(snapshot).toEqual({ policy, internalCount: 1, externalCount: 0 });
    expect(JSON.stringify(snapshot)).not.toContain('private');
  });
  it.each([
    {},
    { policy: null, seats: [{}] },
    { policy: null, seats: [{ kind: 'INTERNAL' }] },
    { policy: { ...policy, revision: 0 }, seats: [] },
  ])('refuses malformed read %j', (value) => {
    expect(participantSnapshot(value)).toBeNull();
  });
  it('requires confirmation, review key, bounded limits and Wave 0', () => {
    expect(wave0Command(empty, 2, 100, 'review', false)).toBeNull();
    expect(wave0Command(null, 2, 100, 'review', true)).toBeNull();
    expect(wave0Command(empty, 2, 100, 'private text', true)).toBeNull();
    for (const cap of [-1, 101, 1.5])
      expect(wave0Command(empty, 2, cap, 'review', true)).toBeNull();
    for (const cap of [0, 3]) expect(wave0Command(empty, cap, 100, 'review', true)).toBeNull();
    expect(wave0Command({ ...empty, internalCount: 2 }, 1, 100, 'review', true)).toBeNull();
    expect(wave0Command({ ...empty, externalCount: 1 }, 2, 100, 'review', true)).toBeNull();
    expect(
      wave0Command(
        { ...empty, policy: { ...policy, currentWave: 1, currentWaveCap: 5 } },
        2,
        100,
        'review',
        true,
      ),
    ).toBeNull();
  });
  it('uses CAS revision and sends no tenant, enrollment, provider or execution settings', () => {
    const command = wave0Command({ ...empty, policy }, 1, 50, 'review', true)!;
    expect(command.expectedRevision).toBe(1);
    expect(Object.keys(command).sort()).toEqual(
      [
        'action',
        'operationId',
        'expectedRevision',
        'confirmation',
        'reviewEvidenceKey',
        'externalParticipantCap',
        'internalParticipantCap',
        'currentWave',
      ].sort(),
    );
  });
  it('replays identical UUID/body after lost response and verifies settings via GET', async () => {
    const command = wave0Command(empty, 2, 100, 'review', true)!;
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('lost'))
      .mockResolvedValueOnce(receipt())
      .mockResolvedValueOnce(read());
    vi.stubGlobal('fetch', fetcher);
    expect(await submitWave0Configuration('/endpoint', command)).toBe('RETRY');
    expect(await submitWave0Configuration('/endpoint', command)).toBe('SAVED');
    expect(fetcher.mock.calls[0]).toEqual(fetcher.mock.calls[1]);
    expect(fetcher.mock.calls[2]?.[1]).not.toHaveProperty('method');
  });
  it.each([401, 403, 404, 409, 413])(
    'rejects HTTP %s without server text or automatic retry',
    async (status) => {
      const fetcher = vi.fn().mockResolvedValue(new Response('secret', { status }));
      vi.stubGlobal('fetch', fetcher);
      expect(
        await submitWave0Configuration('/endpoint', wave0Command(empty, 2, 100, 'review', true)!),
      ).toBe('REJECTED');
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it('treats invalid receipts, failed verification and 5xx as uncertain', async () => {
    const command = wave0Command(empty, 2, 100, 'review', true)!;
    for (const response of [new Response('', { status: 500 }), Response.json({ data: {} })]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      expect(await submitWave0Configuration('/endpoint', command)).toBe('RETRY');
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(receipt()).mockRejectedValueOnce(new Error('lost GET')),
    );
    expect(await submitWave0Configuration('/endpoint', command)).toBe('RETRY');
  });
  it('does not claim success if current settings or revision changed after receipt', async () => {
    const command = wave0Command(empty, 2, 100, 'review', true)!;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(receipt())
        .mockResolvedValueOnce(
          Response.json({ data: { policy: { ...policy, revision: 2 }, seats: [] } }),
        ),
    );
    expect(await submitWave0Configuration('/endpoint', command)).toBe('REJECTED');
  });
  it('explicit GET rejects unavailable/malformed snapshots', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: {} })));
    await expect(readParticipantConfiguration('/endpoint')).rejects.toThrow('invalid snapshot');
  });
  it('never sends other actions, later waves, or client authority', async () => {
    const command = wave0Command(empty, 2, 100, 'review', true)!;
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    for (const invalid of [
      { ...command, action: 'ADMIT' },
      { ...command, action: 'START' },
      { ...command, currentWave: 1 },
      { ...command, workspaceId: authority.workspaceId },
      { ...command, confirmation: 'automatic' },
      { ...command, expectedRevision: -1 },
      { ...command, operationId: 'bad' },
      { ...command, reviewEvidenceKey: 'private text' },
    ]) {
      expect(await submitWave0Configuration('/endpoint', invalid as typeof command)).toBe(
        'REJECTED',
      );
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});
