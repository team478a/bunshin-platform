import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  openFeedbackReviewHandle,
  sealFeedbackReviewHandle,
  type FeedbackReviewHandle,
} from '../src/services/improvement-feedback-review-handle';
const secret = 'synthetic-only-session-secret-32-bytes';
const now = new Date('2026-10-03T01:30:00Z');
const value: FeedbackReviewHandle = {
  version: 'feedback-review-handle-v1',
  actorUserId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  serviceId: '00000000-0000-4000-8000-000000000003',
  environment: 'DEVELOPMENT',
  week: '2026-09-21',
  clusterRef: 'a'.repeat(64),
  windowRevision: 'b'.repeat(64),
  bucketRevision: 'c'.repeat(64),
  issuedAt: now.getTime(),
  expiresAt: now.getTime() + 600_000,
  review: null,
};
beforeEach(() =>
  vi.stubGlobal('fetch', () => {
    throw new Error('external communication forbidden');
  }),
);
afterEach(() => vi.unstubAllGlobals());
describe('opaque feedback review handle', () => {
  it('encrypts scope and evidence, is randomized, and round trips without exposing identifiers', () => {
    const token = sealFeedbackReviewHandle(value, secret);
    expect(token).not.toBe(sealFeedbackReviewHandle(value, secret));
    expect(openFeedbackReviewHandle(token, secret, now)).toEqual(value);
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    for (const privateValue of [
      value.actorUserId,
      value.clusterRef,
      'windowRevision',
      value.serviceId,
    ])
      expect(decoded).not.toContain(privateValue);
  });
  it('rejects tampering, another key, malformed input, future issue, and exact expiry', () => {
    const token = sealFeedbackReviewHandle(value, secret);
    const tampered = Buffer.from(token, 'base64url');
    tampered[30] = tampered[30]! ^ 1;
    for (const input of [tampered.toString('base64url'), 'x'.repeat(3001), 'bad!'])
      expect(() => openFeedbackReviewHandle(input, secret, now)).toThrow('requires reload');
    expect(() =>
      openFeedbackReviewHandle(token, 'another-synthetic-secret-with-32-bytes', now),
    ).toThrow();
    expect(() => openFeedbackReviewHandle(token, secret, new Date(value.expiresAt))).toThrow();
    expect(() => openFeedbackReviewHandle(token, secret, new Date(value.issuedAt - 1))).toThrow();
    expect(() =>
      openFeedbackReviewHandle(
        sealFeedbackReviewHandle({ ...value, expiresAt: value.expiresAt + 1 }, secret),
        secret,
        now,
      ),
    ).toThrow();
  });
});
