import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import type { LineRichMenu } from '@bunshin/application';
import { LineRichMenuApiAdapter } from '../src/line/rich-menu-provider';

const menu: LineRichMenu = {
  id: '00000000-0000-4000-8000-000000000001',
  environment: 'PRODUCTION',
  version: 3,
  name: 'いつものメニュー',
  description: null,
  status: 'VERIFIED',
  imageObjectKey: 'production/line-rich-menus/menu.png',
  imageSha256: 'a'.repeat(64),
  imageContentType: 'image/png',
  imageWidth: 2500,
  imageHeight: 843,
  lineRichMenuId: null,
  lastSyncedAt: null,
  lastErrorCategory: null,
  areas: [
    { action: 'OPEN_TODAY', x: 0, y: 0, width: 625, height: 843, sortOrder: 0 },
    { action: 'OPEN_BUNSHINS', x: 625, y: 0, width: 625, height: 843, sortOrder: 1 },
    {
      action: 'OPEN_NOTIFICATION_SETTINGS',
      x: 1250,
      y: 0,
      width: 625,
      height: 843,
      sortOrder: 2,
    },
    { action: 'OPEN_ACCOUNT', x: 1875, y: 0, width: 625, height: 843, sortOrder: 3 },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('APP_ENV', 'production');
  vi.stubEnv('APP_URL', 'https://app.example.com');
  vi.stubEnv('DATABASE_URL', 'postgresql://localhost/db');
  vi.stubEnv('DIRECT_URL', 'postgresql://localhost/db');
  vi.stubEnv('SESSION_SECRET', 's'.repeat(32));
});

describe('LINE rich menu provider', () => {
  it('再実行時は同じ名前のLINEメニューを再利用して画像と固定リンクだけを公開する', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          richmenus: [
            {
              richMenuId: 'richmenu-existing',
              name: `bunshin:PRODUCTION:${menu.id}:v3`,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const configuration = {
      getActive: vi.fn(() =>
        Promise.resolve({
          environment: 'PRODUCTION' as const,
          accessToken: 'secret-token',
          globallyPaused: false,
          quotaWarningPercent: 80,
          quotaLowPriorityStop: 90,
        }),
      ),
    };
    const storage = { download: vi.fn(() => Promise.resolve(new Uint8Array([1, 2, 3]))) };
    await expect(
      new LineRichMenuApiAdapter(request, configuration, storage).publish({
        menu,
        idempotencyKey: 'stable-key',
      }),
    ).resolves.toEqual({ lineRichMenuId: 'richmenu-existing' });
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[1]?.[0]).toBe(
      'https://api-data.line.me/v2/bot/richmenu/richmenu-existing/content',
    );
    expect(request.mock.calls[2]?.[0]).toBe(
      'https://api.line.me/v2/bot/user/all/richmenu/richmenu-existing',
    );
  });

  it('初回は任意URLを使わず4つのBUNSHIN固定リンクで作成する', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ richmenus: [] }))
      .mockResolvedValueOnce(Response.json({ richMenuId: 'richmenu-new' }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const configuration = {
      getActive: vi.fn(() =>
        Promise.resolve({
          environment: 'PRODUCTION' as const,
          accessToken: 'secret-token',
          globallyPaused: false,
          quotaWarningPercent: 80,
          quotaLowPriorityStop: 90,
        }),
      ),
    };
    const storage = { download: vi.fn(() => Promise.resolve(new Uint8Array([1]))) };
    await new LineRichMenuApiAdapter(request, configuration, storage).publish({
      menu,
      idempotencyKey: 'stable-key',
    });
    const body = JSON.parse(request.mock.calls[1]?.[1]?.body as string) as {
      areas: Array<{ action: { uri: string } }>;
    };
    expect(body.areas.map((area) => area.action.uri)).toEqual([
      'https://app.example.com/today',
      'https://app.example.com/bunshins',
      'https://app.example.com/account#notifications',
      'https://app.example.com/account',
    ]);
  });

  it('LINE設定が全体停止中なら外部APIを呼ばない', async () => {
    const request = vi.fn<typeof fetch>();
    const configuration = {
      getActive: vi.fn(() =>
        Promise.resolve({
          environment: 'PRODUCTION' as const,
          accessToken: 'secret-token',
          globallyPaused: true,
          quotaWarningPercent: 80,
          quotaLowPriorityStop: 90,
        }),
      ),
    };
    await expect(
      new LineRichMenuApiAdapter(request, configuration, { download: vi.fn() }).publish({
        menu,
        idempotencyKey: 'stable-key',
      }),
    ).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });
    expect(request).not.toHaveBeenCalled();
  });
});
