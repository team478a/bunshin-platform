import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';

const fake = vi.hoisted(() => ({
  actor: vi.fn(),
  service: vi.fn(),
  execute: vi.fn(),
  list: vi.fn(),
}));

vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: fake.actor }),
}));
vi.mock('../src/services/public-service', () => ({ resolveManagedServiceContext: fake.service }));
vi.mock('../src/services/ai-training-skill-lifecycle-admin', () => ({
  executeTrainingSupportSkillAdmin: fake.execute,
  listTrainingSupportSkillsForAdmin: fake.list,
}));
vi.mock('../src/auth/request-security', () => ({
  requireSameOrigin: (request: Request) => {
    if (request.headers.get('origin') !== 'https://example.test')
      throw new ApplicationError('FORBIDDEN', 'origin rejected');
  },
}));

import { trainingSupportSkillAdminResponse } from '../src/http/ai-training-skill-lifecycle-admin';

const id = '11111111-1111-4111-8111-111111111111';
const activate = {
  action: 'ACTIVATE',
  skillId: id,
  skillVersionId: '22222222-2222-4222-8222-222222222222',
  expectedRevision: 1,
  idempotencyKey: '33333333-3333-4333-8333-333333333333',
  confirmation: 'ACTIVATE_SKILL_VERSION',
};
const post = (body: unknown, origin = 'https://example.test') =>
  new Request('https://example.test/api/services/fixture/training-support-skills', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  fake.actor.mockResolvedValue({ userId: 'actor' });
  fake.service.mockResolvedValue({
    workspaceId: 'workspace',
    serviceId: 'service',
    serviceRole: 'SERVICE_ADMIN',
  });
  fake.execute.mockResolvedValue({ outcome: 'UPDATED' });
  fake.list.mockResolvedValue([]);
});

describe('AI training support skill admin HTTP boundary', () => {
  it('derives actor and Service scope before an explicit transition', async () => {
    const response = await trainingSupportSkillAdminResponse(post(activate), 'fixture');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(fake.service).toHaveBeenCalledWith('fixture', 'actor', 'ADMINISTRATION');
    expect(fake.execute).toHaveBeenCalledWith({
      workspaceId: 'workspace',
      serviceId: 'service',
      actorUserId: 'actor',
      actorServiceRole: 'SERVICE_ADMIN',
      command: activate,
    });
  });

  it('lists only after manager authorization', async () => {
    const request = new Request(
      'https://example.test/api/services/fixture/training-support-skills',
      { method: 'GET', headers: { origin: 'https://example.test' } },
    );
    const response = await trainingSupportSkillAdminResponse(request, 'fixture');
    expect(response.status).toBe(200);
    expect(fake.list).toHaveBeenCalledWith({ workspaceId: 'workspace', serviceId: 'service' });
  });

  it('rejects cross-origin, missing session, and non-manager roles before writes', async () => {
    expect(
      (await trainingSupportSkillAdminResponse(post(activate, 'https://evil.test'), 'fixture'))
        .status,
    ).toBe(403);
    fake.actor.mockResolvedValue(null);
    expect((await trainingSupportSkillAdminResponse(post(activate), 'fixture')).status).toBe(401);
    fake.actor.mockResolvedValue({ userId: 'actor' });
    fake.service.mockResolvedValue({ serviceRole: 'CONTENT_EDITOR' });
    expect((await trainingSupportSkillAdminResponse(post(activate), 'fixture')).status).toBe(404);
    expect(fake.execute).not.toHaveBeenCalled();
  });

  it.each([
    { ...activate, workspaceId: 'forged' },
    { ...activate, confirmation: 'wrong' },
    { ...activate, expectedRevision: 0 },
    { ...activate, action: 'DEPLOY' },
    '{',
    'x'.repeat(32_769),
  ])('rejects forged, incomplete, or oversized commands', async (body) => {
    expect((await trainingSupportSkillAdminResponse(post(body), 'fixture')).status).toBe(400);
    expect(fake.execute).not.toHaveBeenCalled();
  });
});
