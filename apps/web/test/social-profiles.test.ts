import type { BunshinCapabilityAssignment } from '@bunshin/application';
import type { SocialProfile } from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

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
const profile: SocialProfile = {
  id: 'profile-1',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  platform: 'INSTAGRAM',
  handle: 'bunshin',
  profileUrl: 'https://example.com/bunshin',
  purpose: '発信目的',
  postingFrequency: 'WEEKLY',
  preferredFormats: ['SLIDE'],
  defaultAssistanceLevel: 'READY_TO_USE',
  status: 'ACTIVE',
  createdAt: now,
  updatedAt: now,
};

const state = vi.hoisted<{
  currentUser: { userId: string } | null;
  assignmentStatus: 'MISSING' | 'ACTIVE' | 'SUSPENDED' | 'LOCKED';
  inaccessible: boolean;
  profiles: SocialProfile[];
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  setActive: Mock<(input: { active: boolean }) => Promise<SocialProfile>>;
}>(() => ({
  currentUser: null,
  assignmentStatus: 'ACTIVE',
  inaccessible: false,
  profiles: [] as SocialProfile[],
  create: vi.fn(),
  update: vi.fn(),
  setActive: vi.fn(),
}));

vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () =>
    Promise.resolve({ getCurrentUser: () => Promise.resolve(state.currentUser) }),
}));

vi.mock('@bunshin/database', () => ({
  PrismaBunshinCapabilityAssignmentRepository: class {
    find() {
      if (state.assignmentStatus === 'MISSING') return Promise.resolve(null);
      return Promise.resolve({ ...assignment, status: state.assignmentStatus });
    }
  },
  PrismaSocialProfileRepository: class {
    create = state.create;
    update = state.update;
    setActive = state.setActive;
    list() {
      return Promise.resolve(state.inaccessible ? null : state.profiles);
    }
    findByPlatform(input: { platform: string }) {
      return Promise.resolve(
        state.profiles.find((value) => value.platform === input.platform) ?? null,
      );
    }
  },
}));

import {
  createSocialProfileResponse,
  listSocialProfilesResponse,
  setSocialProfileActiveResponse,
  updateSocialProfileResponse,
} from '../src/http/social-profiles';

function request(path: string, init?: RequestInit) {
  return new Request(`http://localhost:3000${path}`, {
    ...init,
    headers: { origin: 'http://localhost:3000', ...init?.headers },
  });
}

const basePath = '/api/workspaces/workspace-1/bunshins/bunshin-1/social-profiles';
const createBody = {
  platform: 'INSTAGRAM',
  handle: ' bunshin ',
  profileUrl: 'https://example.com/bunshin',
  purpose: ' 発信目的 ',
  postingFrequency: 'WEEKLY',
  preferredFormats: ['SLIDE'],
  defaultAssistanceLevel: 'READY_TO_USE',
};

describe('authenticated Social Profile HTTP contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('DATABASE_URL', 'postgresql://local');
    vi.stubEnv('DIRECT_URL', 'postgresql://local');
    vi.stubEnv('SESSION_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('LOG_LEVEL', 'info');
    state.currentUser = { userId: 'user-1' };
    state.assignmentStatus = 'ACTIVE';
    state.inaccessible = false;
    state.profiles = [profile];
    state.create.mockResolvedValue(profile);
    state.update.mockResolvedValue(profile);
    state.setActive.mockImplementation((input: { active: boolean }) =>
      Promise.resolve({ ...profile, status: input.active ? 'ACTIVE' : 'INACTIVE' }),
    );
  });

  it('returns no-store DTOs with ISO dates and no private assignment data', async () => {
    const response = await listSocialProfilesResponse(
      request(basePath),
      'workspace-1',
      'bunshin-1',
    );
    const body = (await response.json()) as { data: Array<Record<string, unknown>> };
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.data[0]).toMatchObject({
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      defaultAssistanceLevel: 'READY_TO_USE',
    });
    expect(JSON.stringify(body)).not.toContain('private');
    expect(body.data[0]).not.toHaveProperty('assignedByUserId');
  });

  it('rejects unauthenticated and inaccessible reads', async () => {
    state.currentUser = null;
    expect(
      (await listSocialProfilesResponse(request(basePath), 'workspace-1', 'bunshin-1')).status,
    ).toBe(401);
    state.currentUser = { userId: 'user-1' };
    state.inaccessible = true;
    expect(
      (await listSocialProfilesResponse(request(basePath), 'workspace-1', 'bunshin-1')).status,
    ).toBe(404);
  });

  it('creates at 201 and normalizes input', async () => {
    const response = await createSocialProfileResponse(
      request(basePath, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(createBody),
      }),
      'workspace-1',
      'bunshin-1',
    );
    expect(response.status).toBe(201);
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({
        handle: 'bunshin',
        purpose: '発信目的',
        defaultAssistanceLevel: 'READY_TO_USE',
      }),
    );
  });

  it('accepts the expanded platforms and TEXT format', async () => {
    for (const platform of ['THREADS', 'YOUTUBE_SHORTS']) {
      const response = await createSocialProfileResponse(
        request(basePath, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...createBody,
            platform,
            preferredFormats: ['TEXT'],
          }),
        }),
        'workspace-1',
        'bunshin-1',
      );
      expect(response.status).toBe(201);
    }
  });

  it('rejects supplied authority, platform update, invalid formats, and non-HTTPS URLs', async () => {
    for (const body of [
      { ...createBody, actorUserId: 'attacker' },
      { ...createBody, status: 'ACTIVE' },
      { ...createBody, preferredFormats: [] },
      { ...createBody, preferredFormats: ['SLIDE', 'SLIDE'] },
      { ...createBody, preferredFormats: ['UNKNOWN'] },
      { ...createBody, defaultAssistanceLevel: 'UNKNOWN' },
      { ...createBody, profileUrl: 'http://example.com' },
    ]) {
      const response = await createSocialProfileResponse(
        request(basePath, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        'workspace-1',
        'bunshin-1',
      );
      expect(response.status).toBe(400);
    }
    const update = await updateSocialProfileResponse(
      request(`${basePath}/INSTAGRAM`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platform: 'X', purpose: 'changed' }),
      }),
      'workspace-1',
      'bunshin-1',
      'INSTAGRAM',
    );
    expect(update.status).toBe(400);
    expect(state.create).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  });

  it('keeps older create requests compatible with the ready-to-use default', async () => {
    const olderBody = { ...createBody, defaultAssistanceLevel: undefined };
    const response = await createSocialProfileResponse(
      request(basePath, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(olderBody),
      }),
      'workspace-1',
      'bunshin-1',
    );
    expect(response.status).toBe(201);
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({ defaultAssistanceLevel: 'READY_TO_USE' }),
    );
  });

  it('updates only the verified profile assistance level', async () => {
    const response = await updateSocialProfileResponse(
      request(`${basePath}/INSTAGRAM`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ defaultAssistanceLevel: 'GUIDED' }),
      }),
      'workspace-1',
      'bunshin-1',
      'INSTAGRAM',
    );
    expect(response.status).toBe(200);
    expect(state.update).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        bunshinId: 'bunshin-1',
        actorUserId: 'user-1',
        platform: 'INSTAGRAM',
        defaultAssistanceLevel: 'GUIDED',
      }),
    );
  });

  it.each([
    ['MISSING', 404],
    ['SUSPENDED', 403],
    ['LOCKED', 403],
  ] as const)('rejects mutation when SOCIAL assignment is %s', async (status, expected) => {
    state.assignmentStatus = status;
    const response = await createSocialProfileResponse(
      request(basePath, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(createBody),
      }),
      'workspace-1',
      'bunshin-1',
    );
    expect(response.status).toBe(expected);
    expect(state.create).not.toHaveBeenCalled();
  });

  it('allows reads while assignment is suspended', async () => {
    state.assignmentStatus = 'SUSPENDED';
    expect(
      (await listSocialProfilesResponse(request(basePath), 'workspace-1', 'bunshin-1')).status,
    ).toBe(200);
  });

  it('maps duplicate create to conflict and keeps status changes idempotent at 200', async () => {
    state.create.mockRejectedValueOnce(new ApplicationError('CONFLICT', 'duplicate'));
    const duplicate = await createSocialProfileResponse(
      request(basePath, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(createBody),
      }),
      'workspace-1',
      'bunshin-1',
    );
    const deactivated = await setSocialProfileActiveResponse(
      request(`${basePath}/INSTAGRAM/deactivate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      'workspace-1',
      'bunshin-1',
      'INSTAGRAM',
      false,
    );
    expect(duplicate.status).toBe(409);
    expect(deactivated.status).toBe(200);
  });

  it('rejects cross-origin, invalid Content-Type, and unknown platform', async () => {
    const crossOrigin = await setSocialProfileActiveResponse(
      new Request(`${request(basePath).url}/INSTAGRAM/activate`, {
        method: 'POST',
        headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
        body: '{}',
      }),
      'workspace-1',
      'bunshin-1',
      'INSTAGRAM',
      true,
    );
    const contentType = await createSocialProfileResponse(
      request(basePath, { method: 'POST', body: '{}' }),
      'workspace-1',
      'bunshin-1',
    );
    const unknown = await setSocialProfileActiveResponse(
      request(`${basePath}/FACEBOOK/activate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      'workspace-1',
      'bunshin-1',
      'FACEBOOK',
      true,
    );
    expect(crossOrigin.status).toBe(403);
    expect(contentType.status).toBe(400);
    expect(unknown.status).toBe(400);
  });
});
