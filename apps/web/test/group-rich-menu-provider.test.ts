import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  createPersonalLearningGroupRichMenu,
  deleteGroupRichMenu,
  linkGroupRichMenuToUser,
  isGroupRichMenuPublicationActive,
  publishDefaultGroupRichMenu,
  unlinkGroupRichMenuFromUser,
  uploadPersonalLearningGroupRichMenuImage,
} from '../src/line/group-rich-menu-provider';

describe('dedicated group LINE rich menu', () => {
  it.each([true, false])('checks the exact publication using only reads (%s)', async (matches) => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ richMenuId: 'menu-id' }))
      .mockResolvedValueOnce(
        Response.json({
          richMenuId: 'menu-id',
          name: `bunshin-group:group-1:default:v4:${matches ? 'attempt-1' : 'other-attempt'}`,
        }),
      );
    await expect(
      isGroupRichMenuPublicationActive({
        request,
        accessToken: 'synthetic',
        groupId: 'group-1',
        operationId: 'attempt-1',
      }),
    ).resolves.toBe(matches);
    expect(request.mock.calls.map(([url, options]) => [url, options?.method])).toEqual([
      ['https://api.line.me/v2/bot/user/all/richmenu', 'GET'],
      ['https://api.line.me/v2/bot/richmenu/menu-id', 'GET'],
    ]);
  });

  it('publishes the three Manaberu tiles with matching bounds and destinations', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ richmenus: [] }))
      .mockResolvedValueOnce(Response.json({ richMenuId: 'richmenu-manaberu' }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await publishDefaultGroupRichMenu({
      request,
      accessToken: 'synthetic',
      groupId: 'group-1',
      groupName: 'マナベルスタイル',
      appUrl: 'https://app.example.com',
      serviceSlug: 'manaberu-style',
      image: Buffer.from([1]),
      layout: 'MANABERU',
    });
    expect(JSON.parse(request.mock.calls[1]?.[1]?.body as string)).toMatchObject({
      size: { width: 2500, height: 843 },
      chatBarText: '学習メニュー',
      areas: [
        {
          bounds: { x: 0, y: 0, width: 1400, height: 843 },
          action: { label: '学習を開く', uri: 'https://app.example.com/s/manaberu-style/home' },
        },
        {
          bounds: { x: 1400, y: 0, width: 1100, height: 421 },
          action: {
            label: '実践を記録',
            uri: 'https://app.example.com/s/manaberu-style/home?learning=record',
          },
        },
        {
          bounds: { x: 1400, y: 421, width: 1100, height: 422 },
          action: { label: '困ったとき', uri: 'https://app.example.com/s/manaberu-style/help' },
        },
      ],
    });
  });

  it('publishes the six Oracle tiles in artwork order with matching bounds and destinations', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ richmenus: [] }))
      .mockResolvedValueOnce(Response.json({ richMenuId: 'richmenu-oracle' }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await publishDefaultGroupRichMenu({
      request,
      accessToken: 'synthetic',
      groupId: 'group-1',
      groupName: '月と星のオラクル',
      appUrl: 'https://app.example.com',
      serviceSlug: 'watashi-fortune',
      image: Buffer.from([1]),
      layout: 'ORACLE',
    });
    const definition = JSON.parse(request.mock.calls[1]?.[1]?.body as string) as {
      size: { width: number; height: number };
      chatBarText: string;
      areas: Array<{
        bounds: { x: number; y: number; width: number; height: number };
        action: { type: string; label: string; uri: string };
      }>;
    };
    expect(definition.size).toEqual({ width: 2500, height: 1686 });
    expect(definition.chatBarText).toBe('占いメニュー');
    expect(
      definition.areas.map(({ bounds, action }) => [
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        action.type,
        action.label,
        action.uri,
      ]),
    ).toEqual([
      [0, 0, 833, 843, 'uri', '今日の占い', 'https://app.example.com/s/watashi-fortune/today'],
      [833, 0, 834, 843, 'uri', '鑑定履歴', 'https://app.example.com/s/watashi-fortune/history'],
      [
        1667,
        0,
        833,
        843,
        'uri',
        '友だち紹介',
        'https://app.example.com/s/watashi-fortune/activity',
      ],
      [0, 843, 833, 843, 'uri', '特典', 'https://app.example.com/s/watashi-fortune/credits'],
      [
        833,
        843,
        834,
        843,
        'uri',
        '通知設定',
        'https://app.example.com/s/watashi-fortune/settings#fortune-notifications',
      ],
      [1667, 843, 833, 843, 'uri', '使い方', 'https://app.example.com/s/watashi-fortune/manual'],
    ]);
  });

  it('rejects the Oracle menu on another service before contacting LINE', async () => {
    const request = vi.fn<typeof fetch>();
    await expect(
      publishDefaultGroupRichMenu({
        request,
        accessToken: 'synthetic',
        groupId: 'group-1',
        groupName: '別の占い',
        appUrl: 'https://app.example.com',
        serviceSlug: 'other-fortune',
        image: Buffer.from([1]),
        layout: 'ORACLE',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(request).not.toHaveBeenCalled();
  });

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
        operationId: 'attempt-1',
      }),
    ).resolves.toEqual({ lineRichMenuId: 'richmenu-group', cleanupFailedIds: [] });
    const definition = JSON.parse(request.mock.calls[1]?.[1]?.body as string) as {
      name: string;
      chatBarText: string;
      areas: Array<{ action: { uri: string } }>;
    };
    expect(definition.name).toBe('bunshin-group:group-1:default:v4:attempt-1');
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

  it('maps the Fortune image quadrants to destinations in the same service', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ richmenus: [] }))
      .mockResolvedValueOnce(Response.json({ richMenuId: 'richmenu-fortune' }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await publishDefaultGroupRichMenu({
      request,
      accessToken: 'synthetic',
      groupId: 'group-1',
      groupName: '占い',
      appUrl: 'https://app.example.com',
      serviceSlug: 'fortune',
      image: Buffer.from([1]),
      layout: 'FORTUNE',
    });
    const definition = JSON.parse(request.mock.calls[1]?.[1]?.body as string) as {
      chatBarText: string;
      areas: Array<{ bounds: { x: number; y: number }; action: { uri: string } }>;
    };
    expect(definition.chatBarText).toBe('占いメニュー');
    expect(definition.areas.map(({ bounds, action }) => [bounds.x, bounds.y, action.uri])).toEqual([
      [0, 0, 'https://app.example.com/s/fortune/today'],
      [1250, 0, 'https://app.example.com/s/fortune/history'],
      [0, 843, 'https://app.example.com/s/fortune/settings#fortune-notifications'],
      [1250, 843, 'https://app.example.com/s/fortune/manual'],
    ]);
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

  it('creates the three Manaberu links for an individual learner', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ richMenuId: 'richmenu-learner' }));
    await expect(
      createPersonalLearningGroupRichMenu({
        request,
        accessToken: 'test-token',
        groupId: 'group-1',
        serviceSlug: 'manaberu-style',
        enrollmentId: '11111111-1111-4111-8111-111111111111',
        appUrl: 'https://app.example.com',
      }),
    ).resolves.toBe('richmenu-learner');
    expect(request.mock.calls[0]?.[0]).toBe('https://api.line.me/v2/bot/richmenu');
    const definition = JSON.parse(request.mock.calls[0]?.[1]?.body as string) as {
      areas: Array<{ action: { uri: string } }>;
    };
    expect(definition.areas.map((area) => area.action.uri)).toEqual([
      'https://app.example.com/s/manaberu-style/home',
      'https://app.example.com/s/manaberu-style/home?learning=record',
      'https://app.example.com/s/manaberu-style/help',
    ]);
  });

  it('never uploads twice to an image-backed menu when updating changed content', async () => {
    const imageBacked = new Set<string>();
    const uploadTargets: string[] = [];
    let menuSequence = 0;
    const request = vi.fn<typeof fetch>(async (input, init) => {
      await Promise.resolve();
      const url = input instanceof Request ? input.url : input.toString();
      const method = init?.method ?? 'GET';
      if (url === 'https://api.line.me/v2/bot/richmenu' && method === 'POST') {
        menuSequence += 1;
        return Response.json({ richMenuId: `richmenu-${menuSequence}` });
      }
      const upload = url.match(
        /^https:\/\/api-data\.line\.me\/v2\/bot\/richmenu\/([^/]+)\/content$/,
      );
      if (upload && method === 'POST') {
        const menuId = decodeURIComponent(upload[1]!);
        uploadTargets.push(menuId);
        if (imageBacked.has(menuId)) return new Response(null, { status: 400 });
        imageBacked.add(menuId);
        return new Response(null, { status: 200 });
      }
      if (url.includes('/v2/bot/user/') && method === 'POST')
        return new Response(null, { status: 200 });
      if (url.includes('/v2/bot/richmenu/') && method === 'DELETE')
        return new Response(null, { status: 200 });
      throw new Error(`unexpected LINE API request: ${method} ${url}`);
    });
    const create = () =>
      createPersonalLearningGroupRichMenu({
        request,
        accessToken: 'test-token',
        groupId: 'group-1',
        serviceSlug: 'manaberu-style',
        enrollmentId: '11111111-1111-4111-8111-111111111111',
        appUrl: 'https://app.example.com',
      });
    const upload = (lineRichMenuId: string) =>
      uploadPersonalLearningGroupRichMenuImage({
        request,
        accessToken: 'test-token',
        lineRichMenuId,
        image: Buffer.from([1]),
      });
    const first = await create();
    await upload(first);
    await linkGroupRichMenuToUser({
      request,
      accessToken: 'test-token',
      providerUserId: 'U/learner',
      lineRichMenuId: first,
    });
    const replacement = await create();
    await upload(replacement);
    await linkGroupRichMenuToUser({
      request,
      accessToken: 'test-token',
      providerUserId: 'U/learner',
      lineRichMenuId: replacement,
    });
    await deleteGroupRichMenu({
      request,
      accessToken: 'test-token',
      lineRichMenuId: first,
    });
    expect(uploadTargets).toEqual(['richmenu-1', 'richmenu-2']);
  });

  it('treats deletion of an already absent pending menu as recovered', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));
    await expect(
      deleteGroupRichMenu({
        request,
        accessToken: 'test-token',
        lineRichMenuId: 'richmenu-already-removed',
      }),
    ).resolves.toBeUndefined();
  });
});
