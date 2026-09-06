import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
const m = vi.hoisted(() => ({
  actor: vi.fn(),
  authorize: vi.fn(),
  eligible: vi.fn(),
  save: vi.fn(),
  enqueue: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://example.com' }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: async () => ({ getCurrentUser: m.actor }),
}));
vi.mock('../src/services/public-service', () => ({
  resolvePublicServiceContext: async () => ({ workspaceId: 'workspace', serviceId: 'service' }),
}));
vi.mock('../src/line/secure-configuration', () => ({ currentLineEnvironment: () => 'PRODUCTION' }));
vi.mock('../src/jobs/service-automatic-week', () => ({ mondayForDate: () => '2026-09-07' }));
vi.mock('../src/line/ensure-user-workspace-connection', () => ({
  ensureUserWorkspaceLineConnection: async () => true,
}));
vi.mock('@bunshin/application', () => ({
  GetBunshin: class {
    execute = m.authorize;
  },
  UpdateLineNotificationPreference: class {
    execute = m.save;
  },
  ScheduleWeeklyPlanPreparation: class {
    execute = m.enqueue;
  },
  EnqueueJob: class {},
}));
vi.mock('@bunshin/database', () => ({
  PrismaBunshinRepository: class {},
  PrismaLineNotificationPreferenceRepository: class {},
  PrismaJobRepository: class {},
  PrismaMissionAutomationScopeRepository: class {
    validateWeekly = m.eligible;
  },
}));
import { updateServiceAutomaticDelivery } from '../src/http/service-automatic-delivery';
const id = '00000000-0000-4000-8000-000000000001';
const call = (body: unknown) =>
  updateServiceAutomaticDelivery(
    new Request('https://example.com/api/automatic-delivery', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://example.com' },
      body: JSON.stringify(body),
    }),
    'my-service',
    id,
  );
describe('service automatic delivery settings', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.actor.mockResolvedValue({ userId: 'member' });
    m.eligible.mockResolvedValue(true);
  });
  it('saves consent and queues preparation using the authenticated service scope', async () => {
    expect((await call({ enabled: true, localTime: '08:00' })).status).toBe(200);
    expect(m.authorize).toHaveBeenCalledWith({
      workspaceId: 'workspace',
      groupId: 'service',
      bunshinId: id,
      actorUserId: 'member',
    });
    expect(m.save).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, consentGranted: true, localTime: '08:00' }),
    );
    expect(m.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'PRODUCTION', actorUserId: 'member', bunshinId: id }),
    );
  });
  it('stops notifications without queuing another preparation', async () => {
    expect((await call({ enabled: false, localTime: '08:00' })).status).toBe(200);
    expect(m.save).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, consentGranted: false }),
    );
    expect(m.enqueue).not.toHaveBeenCalled();
  });
  it('rejects another owner and does not change notification consent', async () => {
    m.authorize.mockRejectedValue(new ApplicationError('NOT_FOUND', 'not found'));
    expect((await call({ enabled: true, localTime: '08:00' })).status).toBe(404);
    expect(m.save).not.toHaveBeenCalled();
    expect(m.enqueue).not.toHaveBeenCalled();
  });
  it('rejects missing setup, unauthenticated requests and supplied authority', async () => {
    m.eligible.mockResolvedValue(false);
    expect((await call({ enabled: true, localTime: '08:00' })).status).toBe(409);
    m.actor.mockResolvedValue(null);
    expect((await call({ enabled: true, localTime: '08:00' })).status).toBe(401);
    expect(
      (await call({ enabled: true, localTime: '08:00', workspaceId: 'other' })).status,
    ).toBeGreaterThanOrEqual(400);
    expect(m.save).not.toHaveBeenCalled();
  });
});
