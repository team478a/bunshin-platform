import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = ['group-members-data.ts', 'group-members-view.tsx']
  .map((name) =>
    readFileSync(new URL(`../app/(app)/groups/[groupId]/members/${name}`, import.meta.url), 'utf8'),
  )
  .join('\n');

describe('service member LINE diagnostics boundary', () => {
  it('uses the current environment and the same eligibility signals as delivery', () => {
    expect(source).toContain('currentLineEnvironment()');
    expect(source).toContain('notificationConsentAt');
    expect(source).toContain('friendshipStatus');
    expect(source).toContain('membership.consentedAt');
    expect(source).toContain('membership.user.status');
  });

  it('shows actionable member status without reading the provider user identifier', () => {
    expect(source).toContain('LINE配信の状態');
    expect(source).toContain('LINE確認必要');
    expect(source).not.toContain('providerUserId');
  });
});
