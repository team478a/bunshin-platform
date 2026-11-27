import 'server-only';

import { getServerEnvironment } from '@bunshin/config';
import { prisma } from '@bunshin/database';
import { createLogger } from '@bunshin/observability';
import { LineMessagingApiAdapter } from '../line/messaging-provider';
import { AesGcmLineSecretCrypto, currentLineEnvironment } from '../line/secure-configuration';

const logger = createLogger();

export async function notifyInstructorReviewAnswered(
  review: {
    id: string;
    workspaceId: string;
    groupId: string;
    buyerUserId: string;
    groupMembershipId: string;
    notifiedAt: Date | null;
  },
  path: string,
) {
  if (review.notifiedAt) return;
  const scope = { workspaceId: review.workspaceId, groupId: review.groupId };
  try {
    const routing = await prisma.groupLineRoutingPolicy.findFirst({
      where: {
        ...scope,
        environment: currentLineEnvironment(),
        mode: 'DEDICATED',
        pilotEnabled: true,
      },
      select: { id: true },
    });
    if (!routing) return;
    const connection = await prisma.groupLineConnection.findFirst({
      where: {
        ...scope,
        groupMembershipId: review.groupMembershipId,
        userId: review.buyerUserId,
        status: 'ACTIVE',
        friendshipStatus: 'FOLLOWING',
        notificationConsentAt: { not: null },
        groupMembership: { status: 'ACTIVE' },
        configuration: {
          environment: currentLineEnvironment(),
          status: 'ACTIVE',
          globallyPaused: false,
          lastVerifiedAt: { not: null },
          lastErrorCategory: null,
        },
      },
      select: { providerUserId: true, configuration: { select: { encryptedAccessToken: true } } },
    });
    if (!connection) return;
    const line = new LineMessagingApiAdapter();
    const accessToken = new AesGcmLineSecretCrypto().decrypt(
      connection.configuration.encryptedAccessToken,
    );
    const result = await line.pushText({
      accessToken,
      recipientId: connection.providerUserId,
      retryKey: review.id,
      text: `講師レビューの回答が届きました。研修画面で確認できます。
${new URL(path, getServerEnvironment().APP_URL)}`,
    });
    if (!result.ok) {
      logger.warn('instructor review LINE delivery did not complete', { reviewId: review.id });
      return;
    }
    await prisma.instructorReview.updateMany({
      where: { ...scope, id: review.id, status: 'ANSWERED', notifiedAt: null },
      data: { notifiedAt: new Date() },
    });
  } catch {
    logger.warn('instructor review notification did not complete', { reviewId: review.id });
  }
}
