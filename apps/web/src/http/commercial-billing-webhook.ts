import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { createHash } from 'node:crypto';
import {
  platformBillingWebhookSecret,
  processCommercialBillingStripeEvent,
  type StripeCommercialBillingEvent,
} from '../payments/commercial-invoice-payment';
import { verifyStripeWebhookSignature } from '../payments/secure-configuration';

const json = (data: unknown, requestId: string, status = 200) =>
  Response.json({ data, requestId }, { status, headers: { 'cache-control': 'private, no-store' } });

export async function commercialBillingWebhookResponse(request: Request) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const signature = request.headers.get('stripe-signature');
    if (!signature) throw new ApplicationError('FORBIDDEN', 'Stripe signature required');
    const rawBody = await request.text();
    if (rawBody.length > 1_000_000)
      throw new ApplicationError('VALIDATION_ERROR', 'payload too large');
    if (
      !verifyStripeWebhookSignature({
        rawBody,
        signatureHeader: signature,
        webhookSecret: platformBillingWebhookSecret(),
      })
    ) {
      throw new ApplicationError('FORBIDDEN', 'invalid Stripe signature');
    }
    const event = JSON.parse(rawBody) as StripeCommercialBillingEvent;
    const db = await import('@bunshin/database');
    const payloadDigest = createHash('sha256').update(rawBody).digest('hex');
    await processCommercialBillingStripeEvent(db.prisma, event, payloadDigest);
    return json({ received: true }, requestId);
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
