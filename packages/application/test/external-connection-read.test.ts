import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ExternalConnectionRead,
  type ExternalReadGrant,
  type ExternalReadPorts,
} from '../src/external-connection-read';
import { ReadExternalMemberUsage } from '../src/external-member-usage';
import type { MemberUsageSources } from '../src/member-usage';
const principal = { clientId: 'client', environment: 'test' as const };
const input = { connectionId: 'connection', requestId: 'request' };
const epoch = new Date('2026-11-03T15:00:00Z');
const scope = {
  workspaceId: 'workspace',
  serviceId: 'service',
  groupMembershipId: 'member',
  userId: 'user',
  bunshinId: 'bunshin',
};
function setup() {
  let time = new Date(epoch);
  let grant: ExternalReadGrant | null = {
    ...principal,
    connectionId: input.connectionId,
    revision: 1,
    scope: { ...scope },
    operations: ['member-usage:read'],
    grantedAt: new Date('2026-11-01T00:00:00Z'),
    expiresAt: new Date('2026-11-04T00:00:00Z'),
    revokedAt: null,
  };
  const find = vi.fn(() => Promise.resolve(grant));
  const permitted = vi.fn(() => Promise.resolve(true));
  const release = vi.fn();
  const reserve = vi.fn<ExternalReadPorts['admission']['reserve']>(() =>
    Promise.resolve({ release }),
  );
  const record = vi.fn<ExternalReadPorts['audit']['record']>(() => Promise.resolve());
  const read = vi.fn(() => Promise.resolve({ data: { answer: 'safe' }, count: 1 }));
  const ports: ExternalReadPorts = {
    grants: { find },
    authorization: { permitted },
    admission: { reserve },
    audit: { record },
  };
  const reader = new ExternalConnectionRead(ports, 'member-usage:read', read, () => time, 100);
  return {
    reader,
    ports,
    read,
    find,
    permitted,
    reserve,
    release,
    record,
    get grant() {
      return grant!;
    },
    setGrant: (g: ExternalReadGrant | null) => {
      grant = g;
    },
    setTime: (value: Date) => {
      time = value;
    },
    now: () => time,
  };
}
afterEach(() => vi.useRealTimers());
describe('external read grant enforcement', () => {
  it('resolves server scope and checks current access before and after a read', async () => {
    const s = setup();
    await expect(s.reader.execute(principal, input)).resolves.toEqual({ answer: 'safe' });
    expect(s.find).toHaveBeenCalledTimes(2);
    expect(s.permitted).toHaveBeenCalledTimes(2);
    expect(s.read).toHaveBeenCalledWith(expect.objectContaining({ scope, asOf: epoch }));
    expect(s.release).toHaveBeenCalledOnce();
    expect(s.record.mock.calls[0]?.[0]).toEqual({
      version: 'external-read-v1',
      ...input,
      ...principal,
      operation: 'member-usage:read',
      outcome: 'READ_COMPLETED',
      count: 1,
    });
  });
  it.each([
    null,
    {},
    { ...input, userId: 'victim' },
    { ...input, bunshinId: 'other' },
    { ...input, operation: 'publish' },
    { ...input, connectionId: '../connection' },
    { ...input, requestId: '' },
    { ...input, limit: 100000 },
    { ...input, url: 'https://example.com' },
  ])('rejects unsupported fields before any read or lookup: %j', async (value) => {
    const s = setup();
    await expect(s.reader.execute(principal, value)).rejects.toMatchObject({ code: 'INVALID' });
    expect(s.find).not.toHaveBeenCalled();
    expect(s.read).not.toHaveBeenCalled();
  });
  it.each([
    { clientId: 'other' },
    { environment: 'production' },
    { connectionId: 'other' },
    { revision: 0 },
    { operations: ['publish:write'] },
    { operations: [] },
    { revokedAt: epoch },
    { grantedAt: new Date('2026-11-05') },
    { expiresAt: epoch },
    { expiresAt: new Date('invalid') },
  ])('denies unavailable, expired or mismatched grant %j', async (change) => {
    const s = setup();
    s.setGrant({ ...s.grant, ...change } as ExternalReadGrant);
    await expect(s.reader.execute(principal, input)).rejects.toMatchObject({ code: 'DENIED' });
    expect(s.read).not.toHaveBeenCalled();
    expect(s.reserve).not.toHaveBeenCalled();
  });
  it('does not distinguish a missing connection from a foreign one', async () => {
    const s = setup();
    s.setGrant(null);
    await expect(s.reader.execute(principal, input)).rejects.toMatchObject({ code: 'DENIED' });
    expect(s.read).not.toHaveBeenCalled();
  });
  it.each(['workspaceId', 'serviceId', 'groupMembershipId', 'userId', 'bunshinId'] as const)(
    'discards output if grant %s changes during the read, even without revision update',
    async (key) => {
      const s = setup();
      s.read.mockImplementation(() => {
        s.grant.scope[key] = 'other';
        return Promise.resolve({ data: { answer: 'sensitive' }, count: 1 });
      });
      await expect(s.reader.execute(principal, input)).rejects.toMatchObject({ code: 'DENIED' });
      expect(s.release).toHaveBeenCalledOnce();
      expect(s.record.mock.calls.at(-1)?.[0]).toMatchObject({ outcome: 'DENIED', count: 0 });
    },
  );
  it.each(['revoke', 'expire', 'revision', 'operations', 'remove'])(
    'discards output after %s during read',
    async (mode) => {
      const s = setup();
      s.read.mockImplementation(() => {
        if (mode === 'revoke') s.grant.revokedAt = epoch;
        if (mode === 'expire') s.setTime(new Date('2026-11-04T00:00:00Z'));
        if (mode === 'revision') s.grant.revision++;
        if (mode === 'operations') s.grant.operations = [];
        if (mode === 'remove') s.setGrant(null);
        return Promise.resolve({ data: { answer: 'sensitive' }, count: 1 });
      });
      await expect(s.reader.execute(principal, input)).rejects.toMatchObject({ code: 'DENIED' });
    },
  );
  it('rechecks grant after audit, so disconnect during audit cannot deliver', async () => {
    const s = setup();
    s.record.mockImplementation((event) => {
      if (event.outcome === 'READ_COMPLETED') s.grant.revokedAt = epoch;
      return Promise.resolve();
    });
    await expect(s.reader.execute(principal, input)).rejects.toMatchObject({ code: 'DENIED' });
  });
  it.each([false, true])(
    'denies current membership/capability/stop switch before or after read (%s)',
    async (after) => {
      const s = setup();
      s.permitted.mockResolvedValue(false);
      if (after) s.permitted.mockResolvedValueOnce(true);
      await expect(s.reader.execute(principal, input)).rejects.toMatchObject({ code: 'DENIED' });
      expect(s.read).toHaveBeenCalledTimes(after ? 1 : 0);
    },
  );
  it('requires admission and always releases a granted lease', async () => {
    const s = setup();
    s.reserve.mockResolvedValue(null);
    await expect(s.reader.execute(principal, input)).rejects.toMatchObject({ code: 'LIMITED' });
    expect(s.read).not.toHaveBeenCalled();
    expect(s.release).not.toHaveBeenCalled();
  });
  it('normalizes raw failures and never logs the error or result', async () => {
    const s = setup();
    s.read.mockRejectedValue(new Error('secret credential'));
    await expect(s.reader.execute(principal, input)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      message: 'external read unavailable',
    });
    expect(JSON.stringify(s.record.mock.calls)).not.toContain('secret');
    expect(s.release).toHaveBeenCalledOnce();
  });
  it('fails closed on audit failure and release failure', async () => {
    const s = setup();
    s.record.mockRejectedValue(new Error('storage'));
    await expect(s.reader.execute(principal, input)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    const t = setup();
    t.release.mockImplementation(() => {
      throw new Error('lease');
    });
    await expect(t.reader.execute(principal, input)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
  it('times out, aborts and discards late read output without retry', async () => {
    vi.useFakeTimers();
    const s = setup();
    let finish!: (value: { data: { answer: string }; count: number }) => void;
    s.read.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = expect(s.reader.execute(principal, input)).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(101);
    await pending;
    expect(s.release).toHaveBeenCalledOnce();
    finish({ data: { answer: 'late' }, count: 1 });
    await vi.advanceTimersByTimeAsync(1);
    expect(s.record).toHaveBeenCalledOnce();
    expect(s.read).toHaveBeenCalledOnce();
  });
  it('releases late admission without starting a read after timeout', async () => {
    vi.useFakeTimers();
    const s = setup();
    let finish!: (permit: { release(): void }) => void;
    s.reserve.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = expect(s.reader.execute(principal, input)).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(101);
    await pending;
    finish({ release: s.release });
    await vi.advanceTimersByTimeAsync(1);
    expect(s.release).toHaveBeenCalledOnce();
    expect(s.read).not.toHaveBeenCalled();
  });
  it('snapshots data before asynchronous audit can mutate the source object', async () => {
    const s = setup();
    const data = { answer: 'safe' };
    s.read.mockResolvedValue({ data, count: 1 });
    s.record.mockImplementation(() => {
      data.answer = 'changed';
      return Promise.resolve();
    });
    await expect(s.reader.execute(principal, input)).resolves.toEqual({ answer: 'safe' });
  });
  it.each([-1, 11, 0.5, NaN])('rejects invalid read count %s', async (count) => {
    const s = setup();
    s.read.mockResolvedValue({ data: { answer: 'safe' }, count });
    await expect(s.reader.execute(principal, input)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
  it('rejects oversized UTF-8 payloads', async () => {
    const s = setup();
    s.read.mockResolvedValue({ data: { answer: 'あ'.repeat(6000) }, count: 1 });
    await expect(s.reader.execute(principal, input)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
  it('checks expiry again after a slow final permission check', async () => {
    const s = setup();
    s.permitted.mockResolvedValueOnce(true).mockImplementationOnce(() => {
      s.setTime(new Date('2026-11-04T00:00:00Z'));
      return Promise.resolve(true);
    });
    await expect(s.reader.execute(principal, input)).rejects.toMatchObject({ code: 'DENIED' });
  });
  it('bounds a hung audit instead of returning private data', async () => {
    vi.useFakeTimers();
    const s = setup();
    s.record.mockImplementation(() => new Promise(() => {}));
    const pending = expect(s.reader.execute(principal, input)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await vi.advanceTimersByTimeAsync(601);
    await pending;
    expect(s.release).toHaveBeenCalledOnce();
  });
});

describe('external member usage vertical read', () => {
  function usage() {
    const s = setup();
    const row = (id: string, when: string) => ({
      id,
      scope: { ...scope },
      occurredAt: new Date(when),
    });
    const generation = {
      ...row('g', '2026-11-03T14:59:59Z'),
      status: 'SUCCESS' as const,
      trigger: 'USER' as const,
    };
    const source: MemberUsageSources = {
      scope: { ...scope },
      completeness: 'COMPLETE',
      generations: [generation, generation],
      activities: [
        { ...row('login', '2026-11-03T15:00:00Z'), dailyMissionId: 'm', type: 'VIEWED' },
      ],
      decisions: [
        { ...row('decision', '2026-11-03T14:59:59Z'), dailyMissionId: 'm', decision: 'ACCEPTED' },
      ],
      postRecords: [{ ...row('p', '2026-11-03T15:00:00Z'), dailyMissionId: 'm' }],
      aiUsage: [{ ...row('cost', '2026-11-03T15:00:00Z'), estimatedCostUsdMicros: 123456n }],
    };
    const authorize = vi.fn(() => Promise.resolve(true));
    const read = vi.fn(() => Promise.resolve(source));
    const reader = new ReadExternalMemberUsage(s.ports, { authorize }, { read }, s.now);
    return { ...s, reader, authorize, sourceRead: read, source };
  }
  it('reuses canonical deduplication/JST windows and exposes only allowlisted metrics', async () => {
    const s = usage();
    const result = await s.reader.execute(principal, input);
    expect(result.last7Days).toEqual({
      fromLocalDate: '2026-10-29',
      throughLocalDate: '2026-11-04',
      generated: 1,
      unknownTriggerGenerations: 0,
      accepted: 1,
      rejected: 0,
      selfReportedPosts: 1,
      activeDays: 2,
    });
    expect(result.postEvidence).toBe('SELF_REPORTED_NOT_VERIFIED');
    const json = JSON.stringify(result);
    for (const key of [
      'aiCost',
      'knownUsdMicros',
      'scope',
      'userId',
      'bunshinId',
      'allTime',
      'lastActiveAt',
    ])
      expect(json).not.toContain(key);
    expect(s.sourceRead).toHaveBeenCalledOnce();
    expect(s.sourceRead).toHaveBeenCalledWith({
      actorUserId: scope.userId,
      scope,
      asOf: epoch,
      timezone: 'Asia/Tokyo',
    });
  });
  it.each(['workspaceId', 'serviceId', 'groupMembershipId', 'userId', 'bunshinId'] as const)(
    'rejects a foreign source %s through the existing aggregator',
    async (key) => {
      const s = usage();
      s.source.scope[key] = 'other';
      await expect(s.reader.execute(principal, input)).rejects.toMatchObject({
        code: 'UNAVAILABLE',
      });
    },
  );
  it('does not bypass existing member authorization with a valid external grant', async () => {
    const s = usage();
    s.authorize.mockResolvedValue(false);
    await expect(s.reader.execute(principal, input)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(s.sourceRead).not.toHaveBeenCalled();
  });
  it('rejects partial data instead of claiming zero activity', async () => {
    const s = usage();
    s.source.completeness = 'PARTIAL';
    await expect(s.reader.execute(principal, input)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
});
