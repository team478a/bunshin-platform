import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BindExternalReadCredential,
  ReadAuthenticatedExternalMemberUsage,
} from '../src/external-read-credential';
import type { ExternalReadGrant, ExternalReadPorts } from '../src/external-connection-read';
const id = '11111111-1111-4111-8111-111111111111';
const at = new Date('2026-11-03T00:00:00Z');
const grant: ExternalReadGrant = {
  connectionId: id,
  clientId: 'client',
  environment: 'test',
  revision: 2,
  scope: { workspaceId: id, serviceId: id, groupMembershipId: id, userId: id, bunshinId: id },
  operations: ['member-usage:read'],
  grantedAt: new Date('2026-11-02'),
  expiresAt: new Date('2026-11-04'),
  revokedAt: null,
};
function setup() {
  const credential = {
    issuer: 'https://auth.example.invalid/auth/v1',
    subject: id,
    sessionId: id,
    clientId: 'client',
    environment: 'test' as const,
    expiresAt: new Date('2026-11-03T01:00:00Z'),
  };
  const verify = vi.fn().mockResolvedValue(credential),
    bind = vi.fn().mockResolvedValue(grant),
    resolve = vi.fn().mockResolvedValue(grant);
  const authorize = vi.fn().mockResolvedValue(true),
    release = vi.fn(),
    read = vi.fn().mockResolvedValue({
      scope: grant.scope,
      completeness: 'COMPLETE',
      generations: [],
      activities: [],
      decisions: [],
      postRecords: [],
      aiUsage: [],
    });
  let time = new Date(at);
  const permitted = vi.fn().mockResolvedValue(true);
  const ports: Omit<ExternalReadPorts, 'grants'> = {
    authorization: { permitted },
    admission: { reserve: () => Promise.resolve({ release }) },
    audit: { record: () => Promise.resolve() },
  };
  return {
    credential,
    verify,
    bind,
    resolve,
    authorize,
    read,
    release,
    permitted,
    setTime: (value: Date) => {
      time = value;
    },
    binding: new BindExternalReadCredential({ verify }, { bind, resolve }),
    reader: new ReadAuthenticatedExternalMemberUsage(
      { verify },
      { bind, resolve },
      ports,
      { authorize },
      { read },
      () => time,
    ),
  };
}
afterEach(() => vi.useRealTimers());
describe('verified external credential use cases', () => {
  it('binds only after verification and never receives a claimed principal', async () => {
    const s = setup();
    await s.binding.execute('Bearer synthetic', id);
    expect(s.bind).toHaveBeenCalledWith(id, s.credential, expect.any(AbortSignal));
  });
  it('does not bind or read when verification denies', async () => {
    const s = setup();
    s.verify.mockResolvedValue(null);
    await expect(s.binding.execute('Bearer bad', id)).rejects.toMatchObject({ code: 'DENIED' });
    await expect(
      s.reader.execute('Bearer bad', { connectionId: id, requestId: id }),
    ).rejects.toMatchObject({ code: 'DENIED' });
    expect(s.bind).not.toHaveBeenCalled();
    expect(s.read).not.toHaveBeenCalled();
  });
  it('requires a persisted binding before reading source data', async () => {
    const s = setup();
    s.resolve.mockResolvedValue(null);
    await expect(
      s.reader.execute('Bearer synthetic', { connectionId: id, requestId: id }),
    ).rejects.toMatchObject({ code: 'DENIED' });
    expect(s.read).not.toHaveBeenCalled();
  });
  it('rechecks binding after the read and discards revoked credentials', async () => {
    const s = setup();
    s.resolve.mockResolvedValueOnce(grant).mockResolvedValue(null);
    await expect(
      s.reader.execute('Bearer synthetic', { connectionId: id, requestId: id }),
    ).rejects.toMatchObject({ code: 'DENIED' });
    expect(s.release).toHaveBeenCalledOnce();
  });
  it('reads through the canonical usage aggregator after binding validation', async () => {
    const s = setup();
    await expect(
      s.reader.execute('Bearer synthetic', { connectionId: id, requestId: id }),
    ).resolves.toMatchObject({ postEvidence: 'SELF_REPORTED_NOT_VERIFIED' });
    expect(s.resolve).toHaveBeenCalledTimes(2);
  });
  it('refuses caller-supplied user or client fields', async () => {
    const s = setup();
    await expect(
      s.reader.execute('Bearer synthetic', { connectionId: id, requestId: id, userId: id }),
    ).rejects.toMatchObject({ code: 'INVALID' });
    expect(s.resolve).not.toHaveBeenCalled();
  });
  it('checks token expiry after a slow final authorization', async () => {
    const s = setup();
    s.permitted.mockResolvedValueOnce(true).mockImplementationOnce(() => {
      s.setTime(new Date('2026-11-03T01:00:00Z'));
      return Promise.resolve(true);
    });
    await expect(
      s.reader.execute('Bearer synthetic', { connectionId: id, requestId: id }),
    ).rejects.toMatchObject({ code: 'DENIED' });
  });
  it('bounds a hung verifier and aborts without any binding write', async () => {
    vi.useFakeTimers();
    const s = setup();
    s.verify.mockImplementation(() => new Promise(() => {}));
    const pending = expect(s.binding.execute('Bearer synthetic', id)).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(2001);
    await pending;
    expect(s.bind).not.toHaveBeenCalled();
  });
});
