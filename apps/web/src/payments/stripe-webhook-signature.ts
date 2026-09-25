import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
export function verifyStripeWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string;
  webhookSecret: string;
  now?: Date;
  toleranceSeconds?: number;
}) {
  const parts = input.signatureHeader.split(',').map((part) => part.trim().split('='));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value ?? '');
  const seconds = Number(timestamp);
  const now = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (
    !timestamp ||
    !Number.isInteger(seconds) ||
    Math.abs(now - seconds) > (input.toleranceSeconds ?? 300) ||
    signatures.length === 0
  ) {
    return false;
  }
  const expected = createHmac('sha256', input.webhookSecret)
    .update(`${timestamp}.${input.rawBody}`, 'utf8')
    .digest();
  return signatures.some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const received = Buffer.from(signature, 'hex');
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}
