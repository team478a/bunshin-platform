import 'server-only';
import {
  ServiceRegistrationResendAdapter,
  serviceEmailApiKey,
} from '../email/service-registration-email';

export async function runServiceRegistrationEmailWorker(
  now = new Date(),
  sender = new ServiceRegistrationResendAdapter(),
) {
  const db = await import('@bunshin/database');
  const candidates = await db.prisma.serviceRegistrationEmailDelivery.findMany({
    where: {
      status: { in: ['PENDING', 'FAILED'] },
      attemptCount: { lt: 3 },
      nextAttemptAt: { lte: now },
    },
    include: { emailConfiguration: true },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });
  let sent = 0;
  let failed = 0;
  for (const delivery of candidates) {
    const claimed = await db.prisma.serviceRegistrationEmailDelivery.updateMany({
      where: {
        id: delivery.id,
        status: { in: ['PENDING', 'FAILED'] },
        attemptCount: delivery.attemptCount,
      },
      data: { status: 'SENDING', attemptCount: { increment: 1 } },
    });
    if (claimed.count !== 1) continue;
    try {
      if (!delivery.emailConfiguration.enabled || !delivery.emailConfiguration.lastVerifiedAt) {
        await db.prisma.serviceRegistrationEmailDelivery.update({
          where: { id: delivery.id },
          data: { status: 'SKIPPED', lastErrorCategory: 'CONFIGURATION_DISABLED' },
        });
        continue;
      }
      const providerMessageId = await sender.send({
        apiKey: await serviceEmailApiKey(delivery.emailConfiguration),
        fromName: delivery.fromName,
        fromEmail: delivery.fromEmail,
        replyToEmail: delivery.replyToEmail,
        to: delivery.recipientEmail,
        subject: delivery.subject,
        body: delivery.body,
        idempotencyKey: `registration-email:${delivery.id}`,
      });
      await db.prisma.serviceRegistrationEmailDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'SENT',
          providerMessageId,
          sentAt: now,
          lastErrorCategory: null,
        },
      });
      sent += 1;
    } catch (error) {
      await db.prisma.serviceRegistrationEmailDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'FAILED',
          nextAttemptAt: new Date(now.getTime() + 5 * 60_000),
          lastErrorCategory: error instanceof Error ? error.message.slice(0, 80) : 'UNKNOWN',
        },
      });
      failed += 1;
    }
  }
  return { selected: candidates.length, sent, failed };
}
