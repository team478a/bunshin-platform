import type { ServiceFoundationRepository } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateServiceSettingsResponse } from '../src/http/service-settings';
import { updateServiceWeeklyReportDeliveryResponse } from '../src/http/service-weekly-report-delivery';
import { serviceSettingsFixture } from './service-settings-fixture';

type Save = Parameters<ServiceFoundationRepository['save']>[0];
const mocks = vi.hoisted(() => ({
  actor: vi.fn<() => Promise<{ userId: string } | null>>(),
  context: vi.fn(),
  audio: vi.fn<() => Promise<{ id: string } | null>>(() => Promise.resolve(null)),
  save: vi.fn((input: Save) =>
    Promise.resolve({
      id: 'config-a',
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      ...input.configuration,
    }),
  ),
}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://example.test' }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: mocks.actor }),
}));
vi.mock('../src/services/public-service', () => ({ resolveManagedServiceContext: mocks.context }));
vi.mock('@bunshin/database', () => ({
  prisma: { videoAsset: { findFirst: mocks.audio } },
  PrismaServiceFoundationRepository: class {
    save(input: Save) {
      return mocks.save(input);
    }
  },
}));

const request = (body: unknown, origin = 'https://example.test') =>
  new Request('https://example.test/api/settings', {
    method: 'PATCH',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ userId: 'actor-a' });
  mocks.context.mockResolvedValue({
    workspaceId: 'workspace-a',
    serviceId: 'service-a',
    configuration: serviceSettingsFixture().configuration,
  });
});

describe('ordinary service settings save', () => {
  it('allows ordinary free-business edits after existing policy normalization', async () => {
    const { configuration, payload } = serviceSettingsFixture(true);
    mocks.context.mockResolvedValue({
      workspaceId: 'workspace-a',
      serviceId: 'service-a',
      configuration,
    });
    expect(
      (
        await updateServiceSettingsResponse(
          request({ ...payload, description: '無料サービスの案内更新' }),
          'social-a',
        )
      ).status,
    ).toBe(200);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save.mock.calls[0]?.[0].reason).toBe('サービスの基本設定を更新');
  });
  it('allows presentation changes without a reason when usage conditions are unchanged', async () => {
    const payload = serviceSettingsFixture().payload;
    const result = await updateServiceSettingsResponse(
      request({
        ...payload,
        dailyIdeaDelivery: {
          ...payload.dailyIdeaDelivery,
          videoStyle: 'CALM',
          videoBgm: { ...payload.dailyIdeaDelivery.videoBgm, volumePercent: 20 },
          videoNarration: { ...payload.dailyIdeaDelivery.videoNarration, voice: 'cedar' },
        },
      }),
      'social-a',
    );
    expect(result.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it('still verifies BGM ownership and service scope for otherwise ordinary media selection', async () => {
    const { configuration, payload } = serviceSettingsFixture();
    const dailyIdeaDelivery = {
      ...payload.dailyIdeaDelivery,
      enabled: true,
      mediaMode: 'VIDEO',
      videoBgm: {
        ...payload.dailyIdeaDelivery.videoBgm,
        enabled: true,
        assetId: '11111111-1111-4111-8111-111111111111',
      },
    };
    mocks.context.mockResolvedValue({
      workspaceId: 'workspace-a',
      serviceId: 'service-a',
      configuration: {
        ...configuration,
        registration: { ...configuration.registration, onboardingConfig: { dailyIdeaDelivery } },
      },
    });
    const result = await updateServiceSettingsResponse(
      request({
        ...payload,
        dailyIdeaDelivery: {
          ...dailyIdeaDelivery,
          videoBgm: {
            ...dailyIdeaDelivery.videoBgm,
            assetId: '22222222-2222-4222-8222-222222222222',
          },
        },
      }),
      'social-a',
    );
    expect(result.status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.audio).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-a',
          groupId: 'service-a',
          ownerUserId: 'actor-a',
          id: '22222222-2222-4222-8222-222222222222',
        }),
      }),
    );
  });
  it('supplies an audit reason on the server and keeps actor/scope with one save', async () => {
    const result = await updateServiceSettingsResponse(
      request({ ...serviceSettingsFixture().payload, description: '案内文を更新' }),
      'social-a',
    );
    expect(result.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        actorUserId: 'actor-a',
        reason: 'サービスの基本設定を更新',
        configuration: expect.objectContaining({ description: '案内文を更新' }),
      }),
    );
  });
  it('requires a reason on the server when registration changes, and retains a legacy reason', async () => {
    const body = { ...serviceSettingsFixture().payload, registrationMode: 'INVITATION_ONLY' };
    expect((await updateServiceSettingsResponse(request(body), 'social-a')).status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(
      (
        await updateServiceSettingsResponse(
          request({ ...body, reason: '招待での受付へ変更' }),
          'social-a',
        )
      ).status,
    ).toBe(200);
    expect(mocks.save.mock.calls[0]?.[0].reason).toBe('招待での受付へ変更');
  });
  it('does not allow paid media changes with an empty reason', async () => {
    const payload = serviceSettingsFixture().payload;
    const result = await updateServiceSettingsResponse(
      request({
        ...payload,
        dailyIdeaDelivery: { ...payload.dailyIdeaDelivery, enabled: true, mediaMode: 'VIDEO' },
        reason: '   ',
      }),
      'social-a',
    );
    expect(result.status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each(['origin', 'session', 'membership', 'scope-injection'] as const)(
    'does not save after %s rejection',
    async (kind) => {
      if (kind === 'session') mocks.actor.mockResolvedValue(null);
      if (kind === 'membership')
        mocks.context.mockRejectedValue(new ApplicationError('FORBIDDEN', 'denied'));
      const body = {
        ...serviceSettingsFixture().payload,
        ...(kind === 'scope-injection' ? { workspaceId: 'another-workspace' } : {}),
      };
      const result = await updateServiceSettingsResponse(
        request(body, kind === 'origin' ? 'https://other.test' : undefined),
        'social-a',
      );
      expect(result.status).toBeGreaterThanOrEqual(400);
      expect(mocks.save).not.toHaveBeenCalled();
    },
  );
});

describe('weekly delivery save without manual reason', () => {
  it('reads JSON, adds the existing reason and returns the saved setting in one update', async () => {
    const setting = { enabled: true, weekday: 'TUESDAY', localTime: '10:30' };
    const result = await updateServiceWeeklyReportDeliveryResponse(request(setting), 'social-a');
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ data: setting });
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save.mock.calls[0]?.[0]).toMatchObject({
      reason: '週次レポートの配信設定を更新',
      actorUserId: 'actor-a',
      workspaceId: 'workspace-a',
      groupId: 'service-a',
    });
  });
  it('accepts the previous client reason and rejects invalid settings without a write', async () => {
    expect(
      (
        await updateServiceWeeklyReportDeliveryResponse(
          request({
            enabled: false,
            weekday: 'MONDAY',
            localTime: '09:00',
            reason: '毎週の配信を停止',
          }),
          'social-a',
        )
      ).status,
    ).toBe(200);
    expect(mocks.save.mock.calls[0]?.[0].reason).toBe('毎週の配信を停止');
    mocks.save.mockClear();
    expect(
      (
        await updateServiceWeeklyReportDeliveryResponse(
          request({ enabled: true, weekday: 'MONDAY', localTime: '02:00' }),
          'social-a',
        )
      ).status,
    ).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each(['origin', 'session', 'membership'] as const)(
    'retains the weekly %s guard',
    async (kind) => {
      if (kind === 'session') mocks.actor.mockResolvedValue(null);
      if (kind === 'membership')
        mocks.context.mockRejectedValue(new ApplicationError('FORBIDDEN', 'denied'));
      const result = await updateServiceWeeklyReportDeliveryResponse(
        request(
          { enabled: true, weekday: 'MONDAY', localTime: '09:00' },
          kind === 'origin' ? 'https://other.test' : undefined,
        ),
        'social-a',
      );
      expect(result.status).toBeGreaterThanOrEqual(400);
      expect(mocks.save).not.toHaveBeenCalled();
    },
  );
});
