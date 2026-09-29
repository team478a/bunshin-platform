import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';

const m = vi.hoisted(() => ({
  actor: vi.fn(),
  member: vi.fn(),
  public: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://example.com' }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: m.actor }),
}));
vi.mock('../src/services/public-service', () => ({
  resolveMemberServiceContext: m.member,
  resolvePublicServiceContext: m.public,
}));
vi.mock('@bunshin/database', () => ({
  PrismaBunshinRepository: class {
    create = m.create;
    listForService = m.list;
    find = m.find;
    update = m.update;
    archive = m.archive;
  },
}));
import {
  archiveServiceBunshinResponse,
  createServiceBunshinResponse,
  getServiceBunshinResponse,
  listServiceBunshinsResponse,
  updateServiceBunshinResponse,
} from '../src/http/service-bunshins';

const body = {
  name: '投稿パートナー',
  objectiveSummary: 'LINE参加の案内',
  audienceSummary: '参加希望者',
  personalitySummary: '親しみやすく',
};
function request(value: unknown = body, origin = 'https://example.com') {
  return new Request('https://example.com/api/services/private-a/bunshins', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
}
const operations = [
  {
    name: 'list',
    run: (r: Request, slug: string) => listServiceBunshinsResponse(r, slug),
    repo: m.list,
    status: 200,
  },
  {
    name: 'create',
    run: (r: Request, slug: string) => createServiceBunshinResponse(r, slug),
    repo: m.create,
    status: 201,
  },
  {
    name: 'get',
    run: (r: Request, slug: string) => getServiceBunshinResponse(r, slug, 'bunshin-a'),
    repo: m.find,
    status: 200,
  },
  {
    name: 'update',
    run: (r: Request, slug: string) => updateServiceBunshinResponse(r, slug, 'bunshin-a'),
    repo: m.update,
    status: 200,
  },
  {
    name: 'archive',
    run: (r: Request, slug: string) => archiveServiceBunshinResponse(r, slug, 'bunshin-a'),
    repo: m.archive,
    status: 200,
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({ userId: 'member-a' });
  m.member.mockResolvedValue({ workspaceId: 'workspace-a', serviceId: 'service-a' });
  m.public.mockRejectedValue(new ApplicationError('NOT_FOUND', 'private service'));
  for (const op of operations) op.repo.mockResolvedValue({ id: 'bunshin-a' });
  m.list.mockResolvedValue([{ id: 'bunshin-a' }]);
});

describe('participant Bunshin HTTP scope', () => {
  it.each(operations)(
    'allows $name for a private service member with server-owned scope',
    async (op) => {
      const result = await op.run(request(), 'private-a');
      expect(result.status).toBe(op.status);
      expect(result.headers.get('cache-control')).toBe('no-store');
      expect(m.member).toHaveBeenCalledWith('private-a', 'member-a');
      expect(m.actor.mock.invocationCallOrder[0]).toBeLessThan(
        m.member.mock.invocationCallOrder[0]!,
      );
      expect(m.public).not.toHaveBeenCalled();
      expect(op.repo).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'workspace-a',
          groupId: 'service-a',
          actorUserId: 'member-a',
        }),
      );
    },
  );

  it.each(operations)(
    'rejects anonymous $name before service lookup or repository access',
    async (op) => {
      m.actor.mockResolvedValue(null);
      expect((await op.run(request(), 'private-a')).status).toBe(401);
      expect(m.member).not.toHaveBeenCalled();
      expect(op.repo).not.toHaveBeenCalled();
    },
  );

  it.each(operations)(
    'rejects $name when membership or service availability is denied',
    async (op) => {
      m.member.mockRejectedValue(new ApplicationError('NOT_FOUND', 'service not found'));
      expect((await op.run(request(), 'other-service')).status).toBe(404);
      expect(op.repo).not.toHaveBeenCalled();
    },
  );

  it.each(operations)('keeps $name isolated when switching services', async (op) => {
    m.member.mockResolvedValue({ workspaceId: 'workspace-b', serviceId: 'service-b' });
    expect((await op.run(request(), 'private-b')).status).toBe(op.status);
    expect(op.repo).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-b',
        groupId: 'service-b',
        actorUserId: 'member-a',
      }),
    );
  });

  it.each(operations.slice(2))(
    'returns 404 for $name when repository ownership denies access',
    async (op) => {
      op.repo.mockResolvedValue(null);
      expect((await op.run(request(), 'private-a')).status).toBe(404);
    },
  );

  it.each(['workspaceId', 'groupId', 'actorUserId', 'ownerUserId'])(
    'rejects injected %s on create and edit',
    async (key) => {
      expect(
        (await createServiceBunshinResponse(request({ ...body, [key]: 'other' }), 'private-a'))
          .status,
      ).toBe(400);
      expect(
        (
          await updateServiceBunshinResponse(
            request({ name: 'new', [key]: 'other' }),
            'private-a',
            'bunshin-a',
          )
        ).status,
      ).toBe(400);
      expect(m.create).not.toHaveBeenCalled();
      expect(m.update).not.toHaveBeenCalled();
    },
  );

  it.each(operations.filter((op) => ['create', 'update', 'archive'].includes(op.name)))(
    'rejects cross-origin $name before writes',
    async (op) => {
      expect((await op.run(request(body, 'https://attacker.example'), 'private-a')).status).toBe(
        403,
      );
      expect(m.member).not.toHaveBeenCalled();
      expect(op.repo).not.toHaveBeenCalled();
    },
  );

  it('keeps public service members on the same member-authorized path', async () => {
    expect((await createServiceBunshinResponse(request(), 'public-service')).status).toBe(201);
    expect(m.member).toHaveBeenCalledWith('public-service', 'member-a');
    expect(m.public).not.toHaveBeenCalled();
  });

  it('does not suppress a repository rejection after scope resolution', async () => {
    m.create.mockRejectedValue(new ApplicationError('NOT_FOUND', 'membership revoked'));
    expect((await createServiceBunshinResponse(request(), 'private-a')).status).toBe(404);
  });
});
