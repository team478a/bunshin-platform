import type { BunshinCapabilityAssignment } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const now = new Date('2026-08-19T00:00:00.000Z');
const assignment: BunshinCapabilityAssignment = {
  id: 'assignment-1',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  capabilityType: 'SOCIAL',
  status: 'ACTIVE',
  config: { private: true },
  assignedByUserId: 'user-1',
  activatedAt: now,
  createdAt: now,
  updatedAt: now,
};

const state = vi.hoisted(() => ({
  currentUser: null as { userId: string } | null,
  assignments: [] as BunshinCapabilityAssignment[],
  inaccessible: false,
  assign: vi.fn(),
  setStatus: vi.fn(),
}));

vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () =>
    Promise.resolve({ getCurrentUser: () => Promise.resolve(state.currentUser) }),
}));

vi.mock('@bunshin/database', () => ({
  PrismaBunshinCapabilityAssignmentRepository: class {
    assign = state.assign;
    setStatus = state.setStatus;
    list() {
      return Promise.resolve(state.inaccessible ? null : state.assignments);
    }
    find(input: { capabilityType: string }) {
      return Promise.resolve(
        state.assignments.find((value) => value.capabilityType === input.capabilityType) ?? null,
      );
    }
  },
}));

import {
  assignCapabilityResponse,
  listCapabilitiesResponse,
  setSocialCapabilityStatusResponse,
} from '../src/http/capabilities';

function request(path: string, init?: RequestInit) {
  return new Request(`http://localhost:3000${path}`, {
    ...init,
    headers: { origin: 'http://localhost:3000', ...init?.headers },
  });
}

describe('authenticated Capability Assignment HTTP contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('DATABASE_URL', 'postgresql://local');
    vi.stubEnv('DIRECT_URL', 'postgresql://local');
    vi.stubEnv('SESSION_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('LOG_LEVEL', 'info');
    state.currentUser = { userId: 'user-1' };
    state.assignments = [assignment];
    state.inaccessible = false;
    state.assign.mockResolvedValue(assignment);
    state.setStatus.mockImplementation((input: { status: 'ACTIVE' | 'SUSPENDED' }) =>
      Promise.resolve({ ...assignment, status: input.status }),
    );
  });

  it('returns no-store DTOs without config or assignment actor', async () => {
    const response = await listCapabilitiesResponse(
      request('/api/workspaces/workspace-1/bunshins/bunshin-1/capabilities'),
      'workspace-1',
      'bunshin-1',
    );
    const body = (await response.json()) as { data: Array<Record<string, unknown>> };
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.data[0]).not.toHaveProperty('config');
    expect(body.data[0]).not.toHaveProperty('assignedByUserId');
  });

  it('rejects unauthenticated reads', async () => {
    state.currentUser = null;
    const response = await listCapabilitiesResponse(
      request('/api/workspaces/workspace-1/bunshins/bunshin-1/capabilities'),
      'workspace-1',
      'bunshin-1',
    );
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain('private');
  });

  it('maps an inaccessible Workspace or Bunshin to not found', async () => {
    state.inaccessible = true;
    const response = await listCapabilitiesResponse(
      request('/api/workspaces/other-workspace/bunshins/other-bunshin/capabilities'),
      'other-workspace',
      'other-bunshin',
    );
    expect(response.status).toBe(404);
  });

  it('accepts only a strict SOCIAL assignment body', async () => {
    for (const body of [
      { capabilityType: 'BLOG' },
      { capabilityType: 'SOCIAL', status: 'ACTIVE' },
      { capabilityType: 'SOCIAL', config: {} },
    ]) {
      const response = await assignCapabilityResponse(
        request('/api/workspaces/workspace-1/bunshins/bunshin-1/capabilities', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        'workspace-1',
        'bunshin-1',
      );
      expect(response.status).toBe(400);
    }
    expect(state.assign).not.toHaveBeenCalled();
  });

  it('keeps assign and state transitions idempotent at HTTP 200', async () => {
    const assigned = await assignCapabilityResponse(
      request('/api/workspaces/workspace-1/bunshins/bunshin-1/capabilities', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ capabilityType: 'SOCIAL' }),
      }),
      'workspace-1',
      'bunshin-1',
    );
    const suspended = await setSocialCapabilityStatusResponse(
      request('/api/workspaces/workspace-1/bunshins/bunshin-1/capabilities/SOCIAL/suspend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      'workspace-1',
      'bunshin-1',
      false,
    );
    expect(assigned.status).toBe(200);
    expect(suspended.status).toBe(200);
    expect(state.assign).toHaveBeenCalledTimes(1);
    expect(state.setStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUSPENDED' }));
  });

  it('rejects cross-origin mutation and maps LOCKED to conflict', async () => {
    const crossOrigin = await setSocialCapabilityStatusResponse(
      new Request(
        'http://localhost:3000/api/workspaces/workspace-1/bunshins/bunshin-1/capabilities/SOCIAL/activate',
        {
          method: 'POST',
          headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
          body: '{}',
        },
      ),
      'workspace-1',
      'bunshin-1',
      true,
    );
    state.setStatus.mockRejectedValueOnce(
      new ApplicationError('CONFLICT', 'locked capability cannot be changed'),
    );
    const locked = await setSocialCapabilityStatusResponse(
      request('/api/workspaces/workspace-1/bunshins/bunshin-1/capabilities/SOCIAL/activate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      'workspace-1',
      'bunshin-1',
      true,
    );
    expect(crossOrigin.status).toBe(403);
    expect(locked.status).toBe(409);
  });
});
