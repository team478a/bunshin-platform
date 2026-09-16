import 'server-only';

import { getServerEnvironment } from '@bunshin/config';
import { createLogger } from '@bunshin/observability';
import { AesGcmLineSecretCrypto, currentLineEnvironment } from '../line/secure-configuration';
import { LineMessagingApiAdapter } from '../line/messaging-provider';

export async function sendRegistrationCompletionLine(input: {
  workspaceId: string;
  groupId: string;
  actorUserId: string;
  serviceSlug: string;
  serviceName: string;
  localTime: string;
  cadence: 'DAILY' | 'WEEKDAYS' | 'SCHEDULED';
}) {
  const logger = createLogger().child({
    workspaceId: input.workspaceId,
    groupId: input.groupId,
    actorUserId: input.actorUserId,
    route: '/service-registration-completion-line',
  });
  try {
    const db = await import('@bunshin/database');
    const environment = currentLineEnvironment();
    const connection = await db.prisma.groupLineConnection.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        friendshipStatus: 'FOLLOWING',
        notificationConsentAt: { not: null },
        groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
        configuration: {
          environment,
          status: 'ACTIVE',
          globallyPaused: false,
          lastVerifiedAt: { not: null },
          lastErrorCategory: null,
        },
        group: {
          status: 'ACTIVE',
          lineRoutingPolicies: {
            some: { environment, mode: 'DEDICATED', pilotEnabled: true },
          },
        },
      },
      select: {
        providerUserId: true,
        configuration: { select: { encryptedAccessToken: true } },
      },
    });
    if (!connection)
      return { status: 'SKIPPED' as const, reason: 'DEDICATED_LINE_UNAVAILABLE' as const };

    const homeUrl = new URL(
      `/s/${encodeURIComponent(input.serviceSlug)}/home`,
      getServerEnvironment().APP_URL,
    ).toString();
    const deliveryTiming =
      input.cadence === 'DAILY'
        ? `毎日${input.localTime}ごろ`
        : input.cadence === 'WEEKDAYS'
          ? `平日の${input.localTime}ごろ`
          : `投稿予定日の${input.localTime}ごろ`;
    const result = await new LineMessagingApiAdapter().pushText({
      accessToken: new AesGcmLineSecretCrypto().decrypt(
        connection.configuration.encryptedAccessToken,
      ),
      recipientId: connection.providerUserId,
      text: [
        '登録が完了しました。',
        '',
        `${input.serviceName}へようこそ。`,
        `${deliveryTiming}、あなた向けの投稿案をLINEでお届けします。`,
        '届いた文章は、内容を確認してからSNSへコピーして使えます。',
        '',
        '今日の画面を見る',
        homeUrl,
      ].join('\n'),
    });
    if (!result.ok) {
      logger.warn('registration completion LINE was not delivered', {
        category: result.category,
        retryable: result.retryable,
      });
      return { status: 'SKIPPED' as const, reason: result.category };
    }
    return { status: 'SENT' as const };
  } catch (error) {
    logger.error('registration completion LINE failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { status: 'SKIPPED' as const, reason: 'DELIVERY_FAILED' as const };
  }
}
