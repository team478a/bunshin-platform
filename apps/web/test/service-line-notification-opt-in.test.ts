import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  actor: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  serviceId: '33333333-3333-4333-8333-333333333333',
  identity: null as { providerUserId: string } | null,
  connection: null as { id: string } | null,
  routingMode: String('SHARED'),
  result: String('ENABLED'),
  findRouting: vi.fn(),
  findIdentity: vi.fn(),
  findConnection: vi.fn(),
  enable: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://bunshin.example' }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => ({ getCurrentUser: () => Promise.resolve({ userId: state.actor }) }),
}));
vi.mock('../src/services/public-service', () => ({
  resolveMemberServiceContext: () =>
    Promise.resolve({ workspaceId: state.workspaceId, serviceId: state.serviceId }),
}));
vi.mock('../src/line/secure-configuration', () => ({ currentLineEnvironment: () => 'PRODUCTION' }));
vi.mock('../src/line/enable-service-bunshin-notifications', () => ({
  enableServiceBunshinNotifications: state.enable,
}));
vi.mock('@bunshin/database', () => ({
  prisma: {
    groupLineRoutingPolicy: { findUnique: state.findRouting },
    authIdentity: { findFirst: state.findIdentity },
    lineConnection: { findFirst: state.findConnection },
  },
}));

import { optInServiceLineNotifications } from '../src/http/service-line-notification-opt-in';

function request(fields: Record<string, string>) {
  return new Request(
    'https://bunshin.example/api/services/manaberu-style/line-notifications/enable',
    {
      method: 'POST',
      headers: { origin: 'https://bunshin.example' },
      body: new URLSearchParams(fields),
    },
  );
}

describe('service LINE notification opt-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.identity = { providerUserId: 'LINE-subject' };
    state.connection = { id: 'line-connection' };
    state.routingMode = 'SHARED';
    state.result = 'ENABLED';
    state.findRouting.mockImplementation(() => Promise.resolve({ mode: state.routingMode }));
    state.findIdentity.mockImplementation(() => Promise.resolve(state.identity));
    state.findConnection.mockImplementation(() => Promise.resolve(state.connection));
    state.enable.mockImplementation(() => Promise.resolve(state.result));
  });

  it('requires explicit consent before resolving service data', async () => {
    const response = await optInServiceLineNotifications(request({}), 'manaberu-style');
    expect(response.status).toBe(400);
    expect(state.findRouting).not.toHaveBeenCalled();
    expect(state.enable).not.toHaveBeenCalled();
  });

  it('checks the LINE friend connection in the selected service Workspace', async () => {
    const response = await optInServiceLineNotifications(
      request({ lineNotifications: 'all' }),
      'manaberu-style',
    );
    expect(response.status).toBe(303);
    expect(state.findConnection).toHaveBeenCalledWith({
      where: {
        environment: 'PRODUCTION',
        workspaceId: state.workspaceId,
        userId: state.actor,
        providerUserId: 'LINE-subject',
        status: 'ACTIVE',
        friendshipStatus: 'FOLLOWING',
      },
      select: { id: true },
    });
    expect(state.enable).toHaveBeenCalledWith({
      serviceSlug: 'manaberu-style',
      actorUserId: state.actor,
      verifiedProviderUserId: 'LINE-subject',
      friendshipConfirmed: true,
    });
  });

  it('does not route a dedicated service through the shared messaging connection', async () => {
    state.routingMode = 'DEDICATED';
    const response = await optInServiceLineNotifications(
      request({ lineNotifications: 'all' }),
      'manaberu-style',
    );
    expect(new URL(response.headers.get('location')!).searchParams.get('lineResult')).toBe(
      'DEDICATED_LINE_REQUIRED',
    );
    expect(state.findConnection).not.toHaveBeenCalled();
    expect(state.enable).not.toHaveBeenCalled();
  });

  it('does not enable preferences until the user is a confirmed friend', async () => {
    state.connection = null;
    const response = await optInServiceLineNotifications(
      request({ lineNotifications: 'all' }),
      'manaberu-style',
    );
    expect(new URL(response.headers.get('location')!).searchParams.get('lineResult')).toBe(
      'FRIENDSHIP_NOT_CONFIRMED',
    );
    expect(state.enable).not.toHaveBeenCalled();
  });
});
