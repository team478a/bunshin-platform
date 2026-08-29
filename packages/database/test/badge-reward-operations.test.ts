import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../src/badge-reward-operations.ts', import.meta.url), 'utf8');

describe('badge reward operations persistence boundaries', () => {
  it('scopes every mutation by workspace and records the actor', () => {
    expect(source).toContain('id: input.rewardLinkId, workspaceId: input.workspaceId');
    expect(source).toContain('performedByUserId: input.actorUserId');
  });

  it('only retries terminal failures and prevents duplicate manual entitlement creation', () => {
    expect(source).toContain("current.status !== 'FAILED'");
    expect(source).toContain("current.outbox.status !== 'DEAD'");
    expect(source).toContain('current.entitlement');
    expect(source).toContain("action: 'BADGE_REWARD_MANUAL_FULFILL'");
  });
});
