import 'server-only';
import { randomUUID } from 'node:crypto';
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
  const accountUrl = serviceSlug
    ? `${base}/account?service=${encodeURIComponent(serviceSlug)}`
    : `${base}/account`;
  return {
    OPEN_TODAY: serviceBase ? `${serviceBase}/home` : `${base}/today`,
    OPEN_BUNSHINS: serviceBase ? `${serviceBase}/bunshins` : `${base}/bunshins`,
    OPEN_NOTIFICATION_SETTINGS: `${accountUrl}#notifications`,
    OPEN_ACCOUNT: accountUrl,
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
  const providerNamePrefix = `bunshin-group:${input.groupId}:default:`;
  const providerName = `${providerNamePrefix}v4:${randomUUID()}`;
  const chatBarText = `${input.groupName.replace(/公式$/, '').trim()}メニュー`.slice(0, 14);
  const listed = await request(`${endpoint}/v2/bot/richmenu/list`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!listed.ok) throw providerError(listed.status);
  const listBody = (await listed.json()) as {
    richmenus?: Array<{ richMenuId?: unknown; name?: unknown }>;
  };
  const previousMenus = (listBody.richmenus ?? []).flatMap((item) =>
    typeof item.name === 'string' &&
    item.name.startsWith(providerNamePrefix) &&
    typeof item.richMenuId === 'string'
      ? [item.richMenuId]
      : [],
  );
  const created = await request(`${endpoint}/v2/bot/richmenu`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      size: { width: DEFAULT_LINE_RICH_MENU.width, height: DEFAULT_LINE_RICH_MENU.height },
      selected: true,
      name: providerName,
      chatBarText,
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
  const lineRichMenuId = body.richMenuId;
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
  const cleanupFailedIds: string[] = [];
  for (const previousMenuId of previousMenus) {
    const removed = await request(`${endpoint}/v2/bot/richmenu/${previousMenuId}`, {
      method: 'DELETE',
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!removed.ok) cleanupFailedIds.push(previousMenuId);
  }
  return { lineRichMenuId, cleanupFailedIds };
}

/**
 * Link a previously created menu to one verified LINE member. Keep this separate from
 * publishDefaultGroupRichMenu: the latter intentionally changes the channel-wide default.
 */
export async function linkGroupRichMenuToUser(input: {
  request?: typeof fetch;
  accessToken: string;
  providerUserId: string;
  lineRichMenuId: string;
}) {
  if (!input.providerUserId.trim() || !input.lineRichMenuId.trim())
    throw new ApplicationError('VALIDATION_ERROR', 'LINE member and menu are required');
  const response = await (input.request ?? fetch)(
    `${endpoint}/v2/bot/user/${encodeURIComponent(input.providerUserId)}/richmenu/${encodeURIComponent(input.lineRichMenuId)}`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${input.accessToken}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw providerError(response.status);
}

/** Remove only the selected member's override; it falls back to the standard menu. */
export async function unlinkGroupRichMenuFromUser(input: {
  request?: typeof fetch;
  accessToken: string;
  providerUserId: string;
}) {
  if (!input.providerUserId.trim())
    throw new ApplicationError('VALIDATION_ERROR', 'LINE member is required');
  const response = await (input.request ?? fetch)(
    `${endpoint}/v2/bot/user/${encodeURIComponent(input.providerUserId)}/richmenu`,
    {
      method: 'DELETE',
      headers: { authorization: `Bearer ${input.accessToken}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw providerError(response.status);
}

/** Create once, then replace only its image and keep one LINE menu per connected learner. */
export async function activatePersonalLearningGroupRichMenu(input: {
  request?: typeof fetch;
  accessToken: string;
  providerUserId: string;
  groupId: string;
  serviceSlug: string;
  enrollmentId: string;
  appUrl: string;
  image: Buffer;
  existingLineRichMenuId: string | null;
  onCreated?: (lineRichMenuId: string) => Promise<void>;
}) {
  const request = input.request ?? fetch;
  if (
    !input.providerUserId.trim() ||
    !/^[0-9a-f-]{36}$/i.test(input.enrollmentId) ||
    !/^[a-z0-9-]{1,80}$/i.test(input.serviceSlug)
  )
    throw new ApplicationError('VALIDATION_ERROR', 'personal learning LINE scope is invalid');
  const headers = { authorization: `Bearer ${input.accessToken}` };
  let lineRichMenuId = input.existingLineRichMenuId;
  if (!lineRichMenuId) {
    const learningPath = `/s/${encodeURIComponent(input.serviceSlug)}/programs/${encodeURIComponent(input.enrollmentId)}`;
    const created = await request(`${endpoint}/v2/bot/richmenu`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        size: { width: DEFAULT_LINE_RICH_MENU.width, height: DEFAULT_LINE_RICH_MENU.height },
        selected: true,
        name: `bunshin-learning:${input.groupId}:${randomUUID()}`.slice(0, 100),
        chatBarText: '学習メニュー',
        areas: DEFAULT_LINE_RICH_MENU.areas.map((area, index) => ({
          bounds: { x: area.x, y: area.y, width: area.width, height: area.height },
          action: {
            type: 'uri',
            uri: new URL(
              `${learningPath}#${['personal-learning-practice', 'personal-learning-support', 'personal-learning-result', 'personal-learning-plan'][index]}`,
              input.appUrl,
            ).toString(),
          },
        })),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!created.ok) throw providerError(created.status);
    const body = (await created.json()) as { richMenuId?: unknown };
    if (typeof body.richMenuId !== 'string')
      throw new ApplicationError('INTERNAL_ERROR', 'LINEの応答を確認できませんでした');
    lineRichMenuId = body.richMenuId;
    await input.onCreated?.(lineRichMenuId);
  }
  const uploaded = await request(
    `https://api-data.line.me/v2/bot/richmenu/${encodeURIComponent(lineRichMenuId)}/content`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'image/png' },
      body: new Blob([Uint8Array.from(input.image)], { type: 'image/png' }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!uploaded.ok) throw providerError(uploaded.status);
  await linkGroupRichMenuToUser({
    request,
    accessToken: input.accessToken,
    providerUserId: input.providerUserId,
    lineRichMenuId,
  });
  return { lineRichMenuId };
}
