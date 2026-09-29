import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  actor: null as { userId: string } | null,
  managed: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () =>
    Promise.resolve({ getCurrentUser: () => Promise.resolve(mocks.actor) }),
}));
vi.mock('../src/services/public-service', () => ({ resolveManagedServiceContext: mocks.managed }));

import {
  resolveServiceContentContext,
  withServiceContentContext,
} from '../src/http/service-content-context';

const request = new Request('https://example.test/api/services/private/product-packs');

describe('service content context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor = { userId: 'editor-a' };
    mocks.managed.mockResolvedValue({ workspaceId: 'workspace-a', serviceId: 'service-a' });
  });

  it('uses the content role for a private service editor', async () => {
    await expect(resolveServiceContentContext('private')).resolves.toEqual({
      actorUserId: 'editor-a',
      service: { workspaceId: 'workspace-a', serviceId: 'service-a' },
    });
    expect(mocks.managed).toHaveBeenCalledWith('private', 'editor-a', 'CONTENT');
    const response = await withServiceContentContext(request, 'private', (service) =>
      Promise.resolve(Response.json(service)),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ serviceId: 'service-a' });
  });

  it('rejects anonymous users before resolving a service', async () => {
    mocks.actor = null;
    const operation = vi.fn();
    const response = await withServiceContentContext(request, 'private', operation);
    expect(response.status).toBe(401);
    expect(mocks.managed).not.toHaveBeenCalled();
    expect(operation).not.toHaveBeenCalled();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('rejects an editor outside the service without running the operation', async () => {
    mocks.managed.mockRejectedValue(new Error('SERVICE_NOT_FOUND'));
    const operation = vi.fn();
    const response = await withServiceContentContext(request, 'private', operation);
    expect(response.status).toBe(404);
    expect(operation).not.toHaveBeenCalled();
  });

  it('does not disguise an unexpected database failure as a missing service', async () => {
    const failure = new Error('database unavailable');
    mocks.managed.mockRejectedValue(failure);
    await expect(resolveServiceContentContext('private')).rejects.toBe(failure);
    const response = await withServiceContentContext(request, 'private', vi.fn());
    expect(response.status).toBe(500);
  });
});
