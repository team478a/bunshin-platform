import 'server-only';
import type { LineRichMenuAction } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { DEFAULT_LINE_RICH_MENU } from './default-rich-menu';

const endpoint = 'https://api.line.me';

function providerError(status: number) {
  if (status === 401 || status === 403)
    return new ApplicationError('CONFIGURATION_ERROR', '専用LINEの認証情報を確認してください');
  if (status === 429) return new ApplicationError('CONFLICT', 'LINEの利用上限に達しています');
  return new ApplicationError('INTERNAL_ERROR', '専用LINEへ接続できませんでした');
}

function actionUrl(action: LineRichMenuAction, appUrl: string, serviceSlug: string | null) {
  const base = new URL(appUrl).origin;
  const serviceBase = serviceSlug ? `${base}/s/${serviceSlug}` : null;
  return {
    OPEN_TODAY: serviceBase ? `${serviceBase}/home` : `${base}/today`,
    OPEN_BUNSHINS: serviceBase ? `${serviceBase}/bunshins` : `${base}/bunshins`,
    OPEN_NOTIFICATION_SETTINGS: `${base}/account#notifications`,
    OPEN_ACCOUNT: `${base}/account`,
  }[action];
}

export async function publishDefaultGroupRichMenu(input: {
  request?: typeof fetch;
  accessToken: string;
  groupId: string;
  groupName: string;
  appUrl: string;
  serviceSlug: string | null;
  image: Buffer;
}) {
  const request = input.request ?? fetch;
  const headers = { authorization: `Bearer ${input.accessToken}` };
  const providerName = `bunshin-group:${input.groupId}:default:v1`;
  const listed = await request(`${endpoint}/v2/bot/richmenu/list`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!listed.ok) throw providerError(listed.status);
  const listBody = (await listed.json()) as {
    richmenus?: Array<{ richMenuId?: unknown; name?: unknown }>;
  };
  let lineRichMenuId = listBody.richmenus?.find(
    (item) => item.name === providerName && typeof item.richMenuId === 'string',
  )?.richMenuId as string | undefined;
  if (!lineRichMenuId) {
    const created = await request(`${endpoint}/v2/bot/richmenu`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        size: { width: DEFAULT_LINE_RICH_MENU.width, height: DEFAULT_LINE_RICH_MENU.height },
        selected: true,
        name: providerName,
        chatBarText: `${input.groupName}メニュー`.slice(0, 14),
        areas: DEFAULT_LINE_RICH_MENU.areas.map((area) => ({
          bounds: { x: area.x, y: area.y, width: area.width, height: area.height },
          action: { type: 'uri', uri: actionUrl(area.action, input.appUrl, input.serviceSlug) },
        })),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!created.ok) throw providerError(created.status);
    const body = (await created.json()) as { richMenuId?: unknown };
    if (typeof body.richMenuId !== 'string')
      throw new ApplicationError('INTERNAL_ERROR', 'LINEの応答を確認できませんでした');
    lineRichMenuId = body.richMenuId;
  }
  const uploaded = await request(
    `https://api-data.line.me/v2/bot/richmenu/${lineRichMenuId}/content`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'image/png' },
      body: new Blob([Uint8Array.from(input.image)], { type: 'image/png' }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!uploaded.ok) throw providerError(uploaded.status);
  const activated = await request(`${endpoint}/v2/bot/user/all/richmenu/${lineRichMenuId}`, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!activated.ok) throw providerError(activated.status);
  return { lineRichMenuId };
}
