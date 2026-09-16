import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({
  user: null as { userId: string } | null,
  status: vi.fn(),
  importPack: vi.fn(),
  importStandard: vi.fn(),
  installStandard: vi.fn(),
  setEnabled: vi.fn(),
  setAiEnabled: vi.fn(),
  setWeeklyNotification: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: () => Promise.resolve(state.user) }),
}));
vi.mock('../src/fortune/operator', () => ({
  fortuneOperatorStatus: state.status,
  importFortuneKnowledge: state.importPack,
  importStandardFortuneKnowledge: state.importStandard,
  installStandardFortunePackage: state.installStandard,
  setFortuneEnabled: state.setEnabled,
  setFortuneAiEnabled: state.setAiEnabled,
  setFortuneWeeklyNotification: state.setWeeklyNotification,
}));

import {
  getFortuneOperationsResponse,
  updateFortuneOperationsResponse,
} from '../src/http/fortune-operations';

const request = (body?: unknown, origin = 'http://localhost:3000') =>
  new Request(
    'http://localhost:3000/api/services/fortune/fortune-operations',
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { origin, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  );

describe('fortune operator HTTP boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('DATABASE_URL', 'postgresql://local');
    vi.stubEnv('DIRECT_URL', 'postgresql://local');
    vi.stubEnv('SESSION_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('LOG_LEVEL', 'info');
    state.user = { userId: 'manager-1' };
    state.status.mockResolvedValue({ configured: false });
    state.importPack.mockResolvedValue({ version: 1, meaningCount: 468 });
    state.importStandard.mockResolvedValue({ version: 1, meaningCount: 468 });
    state.installStandard.mockResolvedValue({
      installed: true,
      bunshinId: '11111111-1111-4111-8111-111111111111',
      version: 1,
      meaningCount: 468,
    });
    state.setEnabled.mockResolvedValue({ enabled: true });
    state.setWeeklyNotification.mockResolvedValue({
      weeklyNotificationEnabled: true,
      weeklyNotificationDay: 3,
      weeklyNotificationHour: 19,
    });
  });

  it('requires authentication for readiness data', async () => {
    state.user = null;
    expect((await getFortuneOperationsResponse(request(), 'fortune')).status).toBe(401);
  });

  it('rejects cross-origin and authority fields before importing', async () => {
    const crossOrigin = await updateFortuneOperationsResponse(
      request({ action: 'SET_ENABLED', enabled: true }, 'https://attacker.example'),
      'fortune',
    );
    expect(crossOrigin.status).toBe(403);
    const injected = await updateFortuneOperationsResponse(
      request({ action: 'SET_ENABLED', enabled: true, actorUserId: 'attacker' }),
      'fortune',
    );
    expect(injected.status).toBe(400);
    expect(state.setEnabled).not.toHaveBeenCalled();
  });

  it('passes only the authenticated manager and service scope to import', async () => {
    const pack = { promptVersion: 'v1', meanings: [] };
    const response = await updateFortuneOperationsResponse(
      request({
        action: 'IMPORT_KNOWLEDGE',
        bunshinId: '11111111-1111-4111-8111-111111111111',
        pack,
      }),
      'fortune',
    );
    expect(response.status).toBe(201);
    expect(state.importPack).toHaveBeenCalledWith({
      serviceSlug: 'fortune',
      actorUserId: 'manager-1',
      bunshinId: '11111111-1111-4111-8111-111111111111',
      pack,
    });
  });

  it('downloads and imports the server-owned standard pack after manager authorization', async () => {
    const download = await getFortuneOperationsResponse(
      new Request(
        'http://localhost:3000/api/services/fortune/fortune-operations?download=standard',
      ),
      'fortune',
    );
    expect(download.status).toBe(200);
    expect(download.headers.get('content-disposition')).toContain('fortune-standard-ja-v1.json');
    expect(((await download.json()) as { meanings: unknown[] }).meanings).toHaveLength(468);

    const response = await updateFortuneOperationsResponse(
      request({
        action: 'IMPORT_STANDARD_KNOWLEDGE',
        bunshinId: '11111111-1111-4111-8111-111111111111',
      }),
      'fortune',
    );
    expect(response.status).toBe(201);
    expect(state.importStandard).toHaveBeenCalledWith({
      serviceSlug: 'fortune',
      actorUserId: 'manager-1',
      bunshinId: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('installs the standard package using only the authenticated service scope', async () => {
    const response = await updateFortuneOperationsResponse(
      request({ action: 'INSTALL_STANDARD_PACKAGE' }),
      'fortune',
    );
    expect(response.status).toBe(201);
    expect(state.installStandard).toHaveBeenCalledWith({
      serviceSlug: 'fortune',
      actorUserId: 'manager-1',
    });
  });

  it('updates the weekly notification schedule within the authenticated service scope', async () => {
    const response = await updateFortuneOperationsResponse(
      request({
        action: 'SET_WEEKLY_NOTIFICATION',
        enabled: true,
        weekday: 5,
        hour: 18,
      }),
      'fortune',
    );
    expect(response.status).toBe(200);
    expect(state.setWeeklyNotification).toHaveBeenCalledWith({
      serviceSlug: 'fortune',
      actorUserId: 'manager-1',
      enabled: true,
      weekday: 5,
      hour: 18,
    });
  });
});
