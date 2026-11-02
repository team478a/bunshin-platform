import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  configuration: vi.fn(),
  member: vi.fn(),
  bunshin: vi.fn(),
  list: vi.fn(),
  issuance: vi.fn(),
  repository: vi.fn(),
  catalog: vi.fn(),
  env: vi.fn(),
}));
vi.mock('@bunshin/database', () => ({
  prisma: {
    serviceConfiguration: { findUnique: m.configuration },
    groupMembership: { findFirst: m.member },
    bunshin: { findFirst: m.bunshin },
  },
  PrismaExternalReadGrantRepository: class {
    list = m.list;
    issuanceAllowed = m.issuance;
    constructor(...args: unknown[]) {
      m.repository(...args);
    }
  },
}));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: m.env }));
vi.mock('../src/services/external-read-client-catalog', () => ({
  externalReadClientCatalog: m.catalog,
}));
import {
  externalReadGrantOwner,
  externalGrantOwnerView,
} from '../src/services/external-read-grant-owner';
const id = '11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  vi.resetAllMocks();
  m.configuration.mockResolvedValue({
    workspaceId: 'workspace',
    groupId: 'service',
    displayName: 'Synthetic',
  });
  m.member.mockResolvedValue({ id: 'member' });
  m.bunshin.mockResolvedValue({ id, name: 'Synthetic' });
  m.list.mockResolvedValue([]);
  m.issuance.mockResolvedValue(true);
  m.catalog.mockReturnValue([]);
  m.env.mockReturnValue({ APP_ENV: 'development' });
});
describe('owner target and catalog', () => {
  it('scopes every lookup to the current actor and service, without active-only restrictions', async () => {
    await externalReadGrantOwner('hassy', id, 'user');
    expect(m.member).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace', groupId: 'service', userId: 'user' },
      select: { id: true },
    });
    expect(m.bunshin).toHaveBeenCalledWith({
      where: { id, workspaceId: 'workspace', groupId: 'service', ownerUserId: 'user' },
      select: { id: true, name: true },
    });
  });
  it.each(['configuration', 'member', 'bunshin'] as const)(
    'denies missing/foreign %s',
    async (key) => {
      m[key].mockResolvedValue(null);
      await expect(externalReadGrantOwner('hassy', id, 'user')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    },
  );
  it('rejects malformed paths before querying', async () => {
    await expect(externalReadGrantOwner('../other', id, 'user')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(m.configuration).not.toHaveBeenCalled();
  });
  it('keeps default issuance closed while preserving owner list', async () => {
    const target = await externalReadGrantOwner('hassy', id, 'user');
    const view = await externalGrantOwnerView(target);
    expect(view.clients).toEqual([]);
    expect(m.issuance).not.toHaveBeenCalled();
    const policy = m.repository.mock.calls[0]?.[2] as () => unknown;
    expect(policy()).toEqual({ enabled: false, clients: [] });
  });
  it('filters catalog choices through the same current database permission checks', async () => {
    m.catalog.mockReturnValue([{ id: 'verified', name: 'Test' }]);
    m.issuance.mockResolvedValue(false);
    const target = await externalReadGrantOwner('hassy', id, 'user');
    expect((await externalGrantOwnerView(target)).clients).toEqual([]);
    expect(m.issuance).toHaveBeenCalledWith(target.owner, 'verified');
  });
  it('does not reinterpret staging as another environment', async () => {
    m.env.mockReturnValue({ APP_ENV: 'staging' });
    const target = await externalReadGrantOwner('hassy', id, 'user');
    expect((await externalGrantOwnerView(target)).managementAvailable).toBe(false);
    expect(m.repository).not.toHaveBeenCalled();
  });
});
