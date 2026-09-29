import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actor: null as { userId: string } | null,
  managed: vi.fn(),
  list: vi.fn(),
  createSystem: vi.fn(),
  transitionLink: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () =>
    Promise.resolve({ getCurrentUser: () => Promise.resolve(mocks.actor) }),
}));
vi.mock('../src/services/public-service', () => ({ resolveManagedServiceContext: mocks.managed }));
vi.mock('../src/http/external-tracking-links', () => ({
  listExternalTrackingConfigurationResponse: mocks.list,
  createExternalTrackingSystemResponse: mocks.createSystem,
  transitionExternalTrackingLinkResponse: mocks.transitionLink,
  exportExternalTrackingResponse: vi.fn(),
  importExternalTrackingCsvResponse: vi.fn(),
  createExternalTrackingDomainResponse: vi.fn(),
  createExternalTrackingLinkResponse: vi.fn(),
  updateExternalTrackingLinkResponse: vi.fn(),
  upsertExternalTrackingIdentityResponse: vi.fn(),
}));
vi.mock('../src/http/external-tracking-results', () => ({
  rotateExternalTrackingResultTokenResponse: vi.fn(),
}));

import { GET, POST } from '../app/api/services/[serviceSlug]/external-tracking/[[...path]]/route';

const context = (path: string[] = []) => ({
  params: Promise.resolve({ serviceSlug: 'private-service', path }),
});
const request = (method = 'GET') =>
  new Request('https://example.test/api/services/private-service/external-tracking', { method });

describe('private service external tracking route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor = { userId: 'manager-a' };
    mocks.managed.mockResolvedValue({
      workspaceId: 'workspace-a',
      serviceId: 'service-a',
      configuration: { slug: 'private-service', displayName: '非公開サービス' },
    });
    mocks.list.mockResolvedValue(Response.json({ data: [] }));
    mocks.createSystem.mockResolvedValue(Response.json({ data: {} }, { status: 201 }));
    mocks.transitionLink.mockResolvedValue(Response.json({ data: {} }));
  });

  it('lists private service configuration through its manager scope', async () => {
    const input = request();
    const response = await GET(input, context());
    expect(response.status).toBe(200);
    expect(mocks.managed).toHaveBeenCalledWith('private-service', 'manager-a', 'ADMINISTRATION');
    expect(mocks.list).toHaveBeenCalledWith(input, 'workspace-a', 'service-a');
  });

  it('keeps mutations and notification context within the resolved service', async () => {
    const input = request('POST');
    const created = await POST(input, context(['systems']));
    expect(created.status).toBe(201);
    expect(mocks.createSystem).toHaveBeenCalledWith(input, 'workspace-a', 'service-a');
    await POST(input, context(['links', 'link-a', 'activate']));
    expect(mocks.transitionLink).toHaveBeenCalledWith(
      input,
      'workspace-a',
      'link-a',
      'activate',
      'service-a',
      { serviceSlug: 'private-service', serviceName: '非公開サービス' },
    );
  });

  it('rejects anonymous users before resolving or executing an operation', async () => {
    mocks.actor = null;
    const response = await GET(request(), context());
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.managed).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('rejects other service managers without exposing private data', async () => {
    mocks.managed.mockRejectedValue(new Error('SERVICE_NOT_FOUND'));
    const response = await GET(request(), context());
    expect(response.status).toBe(404);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('reports unexpected resolver failures separately from missing services', async () => {
    mocks.managed.mockRejectedValue(new Error('database unavailable'));
    const response = await GET(request(), context());
    expect(response.status).toBe(500);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('rejects unsupported paths after authorization', async () => {
    const response = await GET(request(), context(['unknown']));
    expect(response.status).toBe(404);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
