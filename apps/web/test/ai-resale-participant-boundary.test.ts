import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const http = source('src/http/ai-resale-participant.ts');
const page = source('app/s/[serviceSlug]/programs/[programEnrollmentId]/page.tsx');
const card = source('app/s/[serviceSlug]/programs/[programEnrollmentId]/ai-resale-action-card.tsx');

describe('AI resale participant web boundary', () => {
  it('requires a session, active member service context, same origin, and strict input', () => {
    expect(http).toContain('getCurrentUser()');
    expect(http).toContain('resolveMemberServiceContext(serviceSlug, actor.userId)');
    expect(http).toContain('requireSameOrigin(request)');
    expect(http).toContain('.strict()');
    expect(http).toContain('workspaceId: service.workspaceId');
    expect(http).toContain('groupId: service.serviceId');
    expect(http).toContain('actorUserId: actor.userId');
  });

  it('uses a mobile action page and shows WAIT without completion controls', () => {
    expect(page).toContain('AiResaleActionCard');
    expect(page).toContain('今日の一歩');
    expect(card).toContain("action.mode === 'WAIT'");
    expect(card).toContain('今日は作業しなくて大丈夫です');
    expect(card).toContain("submit('DONE')");
    expect(card).toContain("submit('PARTIAL')");
    expect(card).toContain("submit('NOT_DONE')");
  });

  it('preserves one idempotency key when the same result is retried', () => {
    expect(card).toContain('retryKey.current?.status === resultStatus');
    expect(card).toContain('key: crypto.randomUUID()');
    expect(card).toContain('retryKey.current = request');
    expect(card).toContain('retryKey.current = null');
  });
});
