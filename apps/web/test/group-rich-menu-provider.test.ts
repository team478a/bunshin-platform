import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { publishDefaultGroupRichMenu } from '../src/line/group-rich-menu-provider';

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
    ).resolves.toEqual({ lineRichMenuId: 'richmenu-group' });
    const definition = JSON.parse(request.mock.calls[1]?.[1]?.body as string) as {
      areas: Array<{ action: { uri: string } }>;
    };
    expect(definition.areas.map((area) => area.action.uri)).toEqual([
      'https://app.example.com/s/sennokuni/home',
      'https://app.example.com/s/sennokuni/bunshins',
      'https://app.example.com/account#notifications',
      'https://app.example.com/account',
    ]);
    expect(request.mock.calls[3]?.[0]).toBe(
      'https://api.line.me/v2/bot/user/all/richmenu/richmenu-group',
    );
  });

  it('reuses the deterministic menu on retry', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          richmenus: [{ name: 'bunshin-group:group-1:default:v1', richMenuId: 'existing' }],
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await publishDefaultGroupRichMenu({
      request,
      accessToken: 'dedicated-token',
      groupId: 'group-1',
      groupName: '千ノ国メディア',
      appUrl: 'https://app.example.com',
      serviceSlug: null,
      image: Buffer.from([1]),
    });
    expect(request).toHaveBeenCalledTimes(3);
  });
});
