import { describe, expect, it, vi } from 'vitest';
import {
  CreateLineRichMenuDraft,
  DisableLineRichMenu,
  PublishLineRichMenu,
  type LineRichMenu,
  type LineRichMenuProviderPort,
  type LineRichMenuRepository,
} from '../src/index';

const menu: LineRichMenu = {
  id: '00000000-0000-4000-8000-000000000001',
  environment: 'PRODUCTION',
  version: 2,
  name: '標準メニュー',
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

function repository(overrides: Partial<LineRichMenuRepository> = {}): LineRichMenuRepository {
  return {
    listForAdmin: vi.fn(),
    getForPublish: vi.fn(() => Promise.resolve(menu)),
    createDraft: vi.fn(() => Promise.resolve(menu)),
    markVerified: vi.fn(),
    activate: vi.fn(() => Promise.resolve({ ...menu, status: 'ACTIVE' as const })),
    disable: vi.fn(() => Promise.resolve({ ...menu, status: 'DISABLED' as const })),
    ...overrides,
  };
}

const createInput = {
  actorUserId: 'actor',
  environment: 'PRODUCTION' as const,
  reason: '本番用メニューを作成',
  name: '標準メニュー',
  description: null,
  imageObjectKey: menu.imageObjectKey,
  imageSha256: menu.imageSha256,
  imageContentType: menu.imageContentType,
  imageWidth: menu.imageWidth,
  imageHeight: menu.imageHeight,
  areas: menu.areas,
};

describe('CreateLineRichMenuDraft', () => {
  it('固定された4操作と安全な画像情報を保存する', async () => {
    const createDraft = vi.fn(() => Promise.resolve(menu));
    await new CreateLineRichMenuDraft(repository({ createDraft })).execute(createInput);
    expect(createDraft).toHaveBeenCalledWith(createInput);
  });

  it('重なった領域を拒否する', async () => {
    const areas = menu.areas.map((area) => ({ ...area }));
    areas[1]!.x = 500;
    await expect(
      new CreateLineRichMenuDraft(repository()).execute({ ...createInput, areas }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('異なる環境の画像キーを拒否する', async () => {
    await expect(
      new CreateLineRichMenuDraft(repository()).execute({
        ...createInput,
        imageObjectKey: 'staging/line-rich-menus/menu.png',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('PublishLineRichMenu', () => {
  it('決定的な再実行キーで公開してから有効化する', async () => {
    const activate = vi.fn(() => Promise.resolve({ ...menu, status: 'ACTIVE' as const }));
    const repo = repository({ activate });
    const publish = vi.fn(() => Promise.resolve({ lineRichMenuId: 'richmenu-line-1' }));
    const provider: LineRichMenuProviderPort = { publish, disable: vi.fn() };
    await new PublishLineRichMenu(repo, provider).execute({
      actorUserId: 'actor',
      richMenuId: menu.id,
      environment: 'PRODUCTION',
      reason: '本番で公開する',
    });
    expect(publish).toHaveBeenCalledWith({
      menu,
      idempotencyKey: `LINE_RICH_MENU_PUBLISH:PRODUCTION:${menu.id}:2`,
    });
    expect(activate).toHaveBeenCalledWith(
      expect.objectContaining({ lineRichMenuId: 'richmenu-line-1' }),
    );
  });

  it('外部公開に失敗した場合は有効化しない', async () => {
    const activate = vi.fn();
    const provider: LineRichMenuProviderPort = {
      publish: vi.fn(() => Promise.reject(new Error('provider unavailable'))),
      disable: vi.fn(),
    };
    await expect(
      new PublishLineRichMenu(repository({ activate }), provider).execute({
        actorUserId: 'actor',
        richMenuId: menu.id,
        environment: 'PRODUCTION',
        reason: '本番で公開する',
      }),
    ).rejects.toThrow('provider unavailable');
    expect(activate).not.toHaveBeenCalled();
  });
});

describe('DisableLineRichMenu', () => {
  it('LINE側を停止してからDB状態を停止済みにする', async () => {
    const active = { ...menu, status: 'ACTIVE' as const, lineRichMenuId: 'richmenu-line-1' };
    const disableRecord = vi.fn(() => Promise.resolve({ ...active, status: 'DISABLED' as const }));
    const providerDisable = vi.fn();
    const provider: LineRichMenuProviderPort = { publish: vi.fn(), disable: providerDisable };
    await new DisableLineRichMenu(
      repository({
        getForPublish: vi.fn(() => Promise.resolve(active)),
        disable: disableRecord,
      }),
      provider,
    ).execute({
      actorUserId: 'actor',
      richMenuId: menu.id,
      environment: 'PRODUCTION',
      reason: '緊急停止を実施',
    });
    expect(providerDisable).toHaveBeenCalledWith(
      expect.objectContaining({ lineRichMenuId: 'richmenu-line-1' }),
    );
    expect(disableRecord).toHaveBeenCalledOnce();
  });
});
