import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const card = readFileSync(
  new URL('../app/s/[serviceSlug]/bunshins/[bunshinId]/activity-barrier-card.tsx', import.meta.url),
  'utf8',
);
const detail = readFileSync(
  new URL(
    '../app/s/[serviceSlug]/bunshins/[bunshinId]/service-bunshin-detail-data.ts',
    import.meta.url,
  ),
  'utf8',
);
const http = readFileSync(
  new URL('../src/http/service-social-activity-barrier.ts', import.meta.url),
  'utf8',
);

describe('social activity barrier participant UI', () => {
  it('shows one plain-language question and a small support action', () => {
    expect(card).toContain('続けやすくするための確認');
    expect(card).toContain('当てはまる項目を一つ選択');
    expect(card).toContain('回答してサポートを見る');
    expect(card).toContain('今日のサポート');
    expect(card).toContain('このサポートを始める');
    expect(card).toContain('できました');
    expect(card).toContain('今回は見送る');
    expect(card).not.toContain('ruleVersion');
    expect(card).not.toContain('evidenceCode');
  });

  it('keeps answer retries idempotent and protects the mutation by same origin', () => {
    expect(card).toContain('idempotencyKey.current ??= crypto.randomUUID()');
    expect(card).toContain('idempotencyKey: idempotencyKey.current');
    expect(http).toContain('requireSameOrigin(request)');
    expect(http).toContain('transitionSupport');
    expect(http).toContain('resolveMemberServiceContext(serviceSlug, actor.userId)');
  });

  it('scopes both page and API reads to membership, user, and bunshin ownership', () => {
    expect(detail).toContain('PrismaSocialActivityBarrierConfirmationRepository');
    expect(detail).toContain('groupMembershipId: membership.id');
    expect(detail).toContain('getActiveSupport');
    expect(http).toContain('ownerUserId: actor.userId');
    expect(http).toContain('groupMembershipId: membership.id');
  });
});
