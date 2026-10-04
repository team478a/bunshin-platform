import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ApplicationError } from '@bunshin/shared';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const schema = z
  .object({
    version: z.literal('feedback-review-handle-v1'),
    actorUserId: z.uuid(),
    workspaceId: z.uuid(),
    serviceId: z.uuid(),
    environment: z.enum(['DEVELOPMENT', 'STAGING', 'PRODUCTION']),
    week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    clusterRef: digest,
    windowRevision: digest,
    bucketRevision: digest,
    issuedAt: z.number().int(),
    expiresAt: z.number().int(),
    review: z
      .object({
        candidateId: z.uuid(),
        revision: z.number().int().positive(),
        operationKey: z.uuid(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type FeedbackReviewHandle = z.infer<typeof schema>;
const aad = Buffer.from('feedback-review-handle-v1');
const key = (secret: string) => {
  if (secret.length < 32)
    throw new ApplicationError('CONFIGURATION_ERROR', 'review key unavailable');
  return createHash('sha256').update(aad).update(secret).digest();
};
export function sealFeedbackReviewHandle(value: FeedbackReviewHandle, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
export function openFeedbackReviewHandle(
  token: string,
  secret: string,
  now: Date,
): FeedbackReviewHandle {
  try {
    if (!/^[A-Za-z0-9_-]{64,3000}$/.test(token)) throw new Error('invalid handle');
    const bytes = Buffer.from(token, 'base64url');
    if (bytes.toString('base64url') !== token) throw new Error('invalid encoding');
    const decipher = createDecipheriv('aes-256-gcm', key(secret), bytes.subarray(0, 12));
    decipher.setAAD(aad);
    decipher.setAuthTag(bytes.subarray(12, 28));
    const value = schema.parse(
      JSON.parse(
        Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'),
      ),
    );
    const at = now.getTime();
    if (
      !Number.isFinite(at) ||
      value.issuedAt > at ||
      value.expiresAt <= at ||
      value.expiresAt - value.issuedAt > 600_000 ||
      value.expiresAt <= value.issuedAt
    )
      throw new Error('expired handle');
    return value;
  } catch {
    throw new ApplicationError('CONFLICT', 'feedback review requires reload');
  }
}
