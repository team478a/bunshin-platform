import 'server-only';
import type {
  LineRichMenu,
  LineRichMenuAction,
  LineRichMenuProviderPort,
} from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { ActiveLineDeliveryConfigurationAdapter } from './delivery-configuration';
import { LineRichMenuStorage } from './rich-menu-storage';

const endpoint = 'https://api.line.me';

function providerError(status: number): ApplicationError {
  if (status === 401 || status === 403)
    return new ApplicationError('CONFIGURATION_ERROR', 'LINE認証情報を確認してください');
  if (status === 429) return new ApplicationError('CONFLICT', 'LINEの利用上限に達しています');
  return new ApplicationError('INTERNAL_ERROR', 'LINEへ接続できませんでした');
}

function actionUrl(action: LineRichMenuAction) {
  const base = new URL(getServerEnvironment().APP_URL).origin;
  return {
    OPEN_TODAY: `${base}/today`,
    OPEN_BUNSHINS: `${base}/bunshins`,
    OPEN_NOTIFICATION_SETTINGS: `${base}/account#notifications`,
    OPEN_ACCOUNT: `${base}/account`,
  }[action];
}

export class LineRichMenuApiAdapter implements LineRichMenuProviderPort {
  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly configuration: Pick<
      ActiveLineDeliveryConfigurationAdapter,
      'getActive'
    > = new ActiveLineDeliveryConfigurationAdapter(),
    private readonly storage: Pick<LineRichMenuStorage, 'download'> = new LineRichMenuStorage(),
  ) {}

  private async token(menu: LineRichMenu) {
    const configuration = await this.configuration.getActive(menu.environment);
    if (!configuration || configuration.globallyPaused)
      throw new ApplicationError('CONFIGURATION_ERROR', '使用可能なLINE設定がありません');
    return configuration.accessToken;
  }

  async publish(input: { menu: LineRichMenu; idempotencyKey: string }) {
    const accessToken = await this.token(input.menu);
    const headers = { authorization: `Bearer ${accessToken}` };
    const providerName = `bunshin:${input.menu.environment}:${input.menu.id}:v${input.menu.version}`;
    const listed = await this.request(`${endpoint}/v2/bot/richmenu/list`, {
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
      const created = await this.request(`${endpoint}/v2/bot/richmenu`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          size: { width: input.menu.imageWidth, height: input.menu.imageHeight },
          selected: true,
          name: providerName,
          chatBarText: input.menu.name.slice(0, 14),
          areas: input.menu.areas.map((area) => ({
            bounds: { x: area.x, y: area.y, width: area.width, height: area.height },
            action: { type: 'uri', uri: actionUrl(area.action) },
          })),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!created.ok) throw providerError(created.status);
      const createdBody = (await created.json()) as { richMenuId?: unknown };
      if (typeof createdBody.richMenuId !== 'string')
        throw new ApplicationError('INTERNAL_ERROR', 'LINEの応答を確認できませんでした');
      lineRichMenuId = createdBody.richMenuId;
    }
    const image = await this.storage.download(input.menu.imageObjectKey);
    const uploaded = await this.request(
      `https://api-data.line.me/v2/bot/richmenu/${lineRichMenuId}/content`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': input.menu.imageContentType,
        },
        body: image,
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!uploaded.ok) throw providerError(uploaded.status);
    const activated = await this.request(`${endpoint}/v2/bot/user/all/richmenu/${lineRichMenuId}`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!activated.ok) throw providerError(activated.status);
    return { lineRichMenuId };
  }

  async disable(input: { lineRichMenuId: string; idempotencyKey: string }) {
    void input.idempotencyKey;
    const environment = {
      development: 'DEVELOPMENT',
      staging: 'STAGING',
      production: 'PRODUCTION',
    } as const;
    const active = await this.configuration.getActive(environment[getServerEnvironment().APP_ENV]);
    if (!active)
      throw new ApplicationError('CONFIGURATION_ERROR', '使用可能なLINE設定がありません');
    const response = await this.request(`${endpoint}/v2/bot/user/all/richmenu`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${active.accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok && response.status !== 404) throw providerError(response.status);
    const removed = await this.request(`${endpoint}/v2/bot/richmenu/${input.lineRichMenuId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${active.accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!removed.ok && removed.status !== 404) throw providerError(removed.status);
  }
}
