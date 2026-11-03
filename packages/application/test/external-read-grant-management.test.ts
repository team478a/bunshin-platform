const randomUUID = () => crypto.randomUUID();
import { describe, expect, it, vi } from 'vitest';
import {
  EXTERNAL_READ_CONSENT_VERSION,
  ManageExternalReadGrants,
} from '../src/external-read-grant-management';
const owner = {
  actorUserId: randomUUID(),
  scope: {
    workspaceId: randomUUID(),
    serviceId: randomUUID(),
    groupMembershipId: randomUUID(),
    userId: '',
    bunshinId: randomUUID(),
  },
};
owner.scope.userId = owner.actorUserId;
const command = {
  commandId: randomUUID(),
  clientId: 'test-client',
  operation: 'member-usage:read',
  expiresInMinutes: 60,
  consentVersion: EXTERNAL_READ_CONSENT_VERSION,
};
function setup() {
  const issue = vi.fn().mockResolvedValue({}),
    revoke = vi.fn().mockResolvedValue({}),
    list = vi.fn().mockResolvedValue([]);
  return { issue, revoke, list, manager: new ManageExternalReadGrants({ issue, revoke, list }) };
}
describe('explicit owner consent for external grant lifecycle', () => {
  it.each([
    { ...command, consentVersion: 'old' },
    { ...command, consentVersion: undefined },
    { ...command, operation: 'publish:write' },
    { ...command, expiresInMinutes: 1441 },
    { ...command, expiresInMinutes: 0 },
    { ...command, expiresInMinutes: 5.5 },
    { ...command, userId: randomUUID() },
    { ...command, environment: 'production' },
    { ...command, clientId: '../client' },
  ])('rejects invalid or expanded command before storage: %j', (value) => {
    const s = setup();
    expect(() => s.manager.issue(owner, value)).toThrow();
    expect(s.issue).not.toHaveBeenCalled();
  });
  it('refuses a claimed owner different from the authenticated actor', () => {
    const s = setup();
    expect(() => s.manager.list({ ...owner, actorUserId: randomUUID() })).toThrow();
    expect(s.list).not.toHaveBeenCalled();
  });
  it('copies exact owner and command fields before passing to storage', async () => {
    const s = setup();
    await s.manager.issue(owner, command);
    expect(s.issue).toHaveBeenCalledWith(owner, command);
    expect(s.issue.mock.calls[0]?.[0]).not.toBe(owner);
    expect(s.issue.mock.calls[0]?.[0].scope).not.toBe(owner.scope);
  });
  it('requires a known connection and positive revision for revocation', () => {
    const s = setup();
    for (const input of [
      { connectionId: 'bad', expectedRevision: 1 },
      { connectionId: randomUUID(), expectedRevision: 0 },
      { connectionId: randomUUID(), expectedRevision: 1, scope: owner.scope },
    ])
      expect(() => s.manager.revoke(owner, input)).toThrow();
    expect(s.revoke).not.toHaveBeenCalled();
  });
});
