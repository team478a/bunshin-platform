import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Application from '@bunshin/application';

const state = vi.hoisted(() => ({
  list: vi.fn(),
  retry: vi.fn(),
  cancel: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: vi.fn() }));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: vi.fn(() =>
    Promise.resolve({ getCurrentUser: vi.fn(() => Promise.resolve({ userId: 'manager-1' })) }),
  ),
}));
vi.mock('../src/services/public-service', () => ({
  resolveManagedServiceContext: vi.fn(() =>
    Promise.resolve({ workspaceId: 'workspace-1', serviceId: 'group-1' }),
  ),
}));
vi.mock('../src/line/secure-configuration', () => ({
  currentLineEnvironment: vi.fn(() => 'PRODUCTION'),
}));
vi.mock('@bunshin/application', async (importOriginal) => {
  const actual = await importOriginal<typeof Application>();
  return {
    ...actual,
    EnqueueJob: class {
      enqueue = state.enqueue;
    },
  };
});
vi.mock('@bunshin/database', () => ({
  PrismaServiceLineBroadcastOperationsRepository: class {
    list = state.list;
    retry = state.retry;
    cancel = state.cancel;
  },
  PrismaJobRepository: class {},
}));

import {
  cancelServiceLineBroadcastResponse,
  exportServiceLineBroadcastsResponse,
  listServiceLineBroadcastsResponse,
  retryServiceLineBroadcastResponse,
} from '../src/http/service-line-broadcasts';

const request = (method: string, body?: unknown) =>
  new Request('https://example.test/api/services/service/line-broadcasts', {
    method,
    headers: body ? { 'content-type': 'application/json', origin: 'https://example.test' } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

describe('service LINE broadcast operation HTTP boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.list.mockResolvedValue({
      broadcasts: [
        {
          id: 'broadcast-1',
          title: 'title',
          message: 'message',
          status: 'COMPLETED',
          scheduledAt: null,
          createdAt: new Date('2026-09-26T03:00:00.000Z'),
          completedAt: null,
          segment: {},
          recipientCounts: { SENT: 1 },
        },
      ],
      industries: [],
    });
    state.retry.mockResolvedValue({
      kind: 'SCHEDULED',
      broadcastId: 'broadcast-1',
      recipientCount: 2,
      scheduledAt: new Date('2026-09-26T03:30:00.000Z'),
    });
    state.cancel.mockResolvedValue({
      kind: 'CANCELLED',
      broadcastId: 'broadcast-1',
      cancelledAt: new Date('2026-09-26T03:30:00.000Z'),
    });
    state.enqueue.mockResolvedValue({ id: 'job-1' });
  });

  it('lists and exports through the scoped operations repository', async () => {
    const listResponse = await listServiceLineBroadcastsResponse(request('GET'), 'service');
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      data: [{ id: 'broadcast-1', recipients: { SENT: 1 } }],
    });

    const exportResponse = await exportServiceLineBroadcastsResponse(request('GET'), 'service');
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers.get('content-type')).toContain('text/csv');
    expect(state.list).toHaveBeenNthCalledWith(1, {
      workspaceId: 'workspace-1',
      groupId: 'group-1',
      actorUserId: 'manager-1',
      limit: 30,
      includeIndustries: true,
    });
    expect(state.list).toHaveBeenNthCalledWith(2, {
      workspaceId: 'workspace-1',
      groupId: 'group-1',
      actorUserId: 'manager-1',
      limit: 5_000,
      includeIndustries: false,
    });
  });

  it('retries failed recipients and enqueues only after the atomic reset', async () => {
    const response = await retryServiceLineBroadcastResponse(
      request('POST', { reason: 'operator retry' }),
      'service',
      'broadcast-1',
    );
    expect(response.status).toBe(200);
    expect(state.retry).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'PRODUCTION',
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        actorUserId: 'manager-1',
        broadcastId: 'broadcast-1',
      }),
    );
    expect(state.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        payloadReference: 'service-line-broadcast:broadcast-1',
      }),
    );
  });

  it('cancels through the repository-owned transaction', async () => {
    const response = await cancelServiceLineBroadcastResponse(
      request('POST', { reason: 'operator cancel' }),
      'service',
      'broadcast-1',
    );
    expect(response.status).toBe(200);
    expect(state.cancel).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'PRODUCTION',
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        actorUserId: 'manager-1',
        broadcastId: 'broadcast-1',
      }),
    );
  });
});
