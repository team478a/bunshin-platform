import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  linkGroupRichMenuToUser,
  publishDefaultGroupRichMenu,
  unlinkGroupRichMenuFromUser,
} from '../src/line/group-rich-menu-provider';

describe('dedicated group LINE rich menu', () => {
  it('creates and activates the default menu with service-scoped links', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ richmenus: [] }))
      .mockResolvedValueOnce(Response.json({ richMenuId: 'richmenu-group' }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(
      publishDefaultGroupRichMenu({
        request,
        accessToken: 'dedicated-token',
        groupId: 'group-1',
        groupName: '千ノ国メディア',
        appUrl: 'https://app.example.com',
        serviceSlug: 'sennokuni',
        image: Buffer.from([1, 2, 3]),
      }),
    ).resolves.toEqual({ lineRichMenuId: 'richmenu-group', cleanupFailedIds: [] });
    const definition = JSON.parse(request.mock.calls[1]?.[1]?.body as string) as {
      chatBarText: string;
      areas: Array<{ action: { uri: string } }>;
    };
    expect(definition.chatBarText).toBe('千ノ国メディアメニュー');
    expect(definition.areas.map((area) => area.action.uri)).toEqual([
      'https://app.example.com/s/sennokuni/home',
      'https://app.example.com/s/sennokuni/bunshins',
      'https://app.example.com/account?service=sennokuni#notifications',
      'https://app.example.com/account?service=sennokuni',
    ]);
    expect(request.mock.calls[3]?.[0]).toBe(
      'https://api.line.me/v2/bot/user/all/richmenu/richmenu-group',
    );
  });

  it('creates a replacement menu and removes the previous image-backed menu', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          richmenus: [{ name: 'bunshin-group:group-1:default:v3', richMenuId: 'existing' }],
        }),
      )
      .mockResolvedValueOnce(Response.json({ richMenuId: 'replacement' }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(
      publishDefaultGroupRichMenu({
        request,
        accessToken: 'dedicated-token',
        groupId: 'group-1',
        groupName: '千ノ国メディア',
        appUrl: 'https://app.example.com',
        serviceSlug: null,
        image: Buffer.from([1]),
      }),
    ).resolves.toEqual({ lineRichMenuId: 'replacement', cleanupFailedIds: [] });
    expect(request).toHaveBeenCalledTimes(5);
    expect(request.mock.calls[4]?.[0]).toBe('https://api.line.me/v2/bot/richmenu/existing');
    expect(request.mock.calls[4]?.[1]?.method).toBe('DELETE');
  });

  it('uses a participant-facing service label in the chat bar', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ richmenus: [] }))
      .mockResolvedValueOnce(Response.json({ richMenuId: 'richmenu-official' }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await publishDefaultGroupRichMenu({
      request,
      accessToken: 'dedicated-token',
      groupId: 'group-1',
      groupName: 'ワタシワークス公式',
      appUrl: 'https://app.example.com',
      serviceSlug: 'watashi-works-official',
      image: Buffer.from([1]),
    });
    const definition = JSON.parse(request.mock.calls[1]?.[1]?.body as string) as {
      chatBarText: string;
    };
    expect(definition.chatBarText).toBe('ワタシワークスメニュー');
  });
});

describe('per-user group LINE rich menu links', () => {
  it('links one member without changing the channel-wide default', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    await linkGroupRichMenuToUser({
      request,
      accessToken: 'test-token',
      providerUserId: 'U/member?&',
      lineRichMenuId: 'richmenu-personal',
    });
    expect(request).toHaveBeenCalledWith(
      'https://api.line.me/v2/bot/user/U%2Fmember%3F%26/richmenu/richmenu-personal',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(request.mock.calls[0]?.[0]).not.toBe(
      'https://api.line.me/v2/bot/user/all/richmenu/richmenu-personal',
    );
  });

  it('unlinks only the member override so the standard menu can resume', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    await unlinkGroupRichMenuFromUser({
      request,
      accessToken: 'test-token',
      providerUserId: 'U/member',
    });
    expect(request).toHaveBeenCalledWith(
      'https://api.line.me/v2/bot/user/U%2Fmember/richmenu',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('does not treat a failed provider call as a successful link', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 429 }));
    await expect(
      linkGroupRichMenuToUser({
        request,
        accessToken: 'test-token',
        providerUserId: 'U/member',
        lineRichMenuId: 'richmenu-personal',
      }),
    ).rejects.toThrow('LINEの利用上限に達しています');
  });
});
