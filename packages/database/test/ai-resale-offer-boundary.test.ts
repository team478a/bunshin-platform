import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src', 'resale-offer.ts'), 'utf8');

describe('AI resale offer persistence boundaries', () => {
  it('scopes the completed trial and paid options to the same tenant participant', () => {
    expect(source).toContain('workspaceId: input.workspaceId');
    expect(source).toContain('groupId: input.groupId');
    expect(source).toContain('userId: input.actorUserId');
    expect(source).toContain("serviceRole: 'PARTICIPANT'");
    expect(source).toContain("freeSettings?.policyKey !== 'FREE_7D'");
    expect(source).toContain("settings?.policyKey === 'PAID_90D'");
  });

  it('reads the amount from active paid offerings and never fabricates payment', () => {
    expect(source).toContain('parseAiResaleOfferTerms(offering.termsSnapshot)');
    expect(source).toContain('priceReference: offering.priceReference');
    expect(source).not.toContain('29_800');
    expect(source).not.toMatch(/payment.*create/i);
  });

  it('stores shown, decline, and selection events with serializable idempotency', () => {
    expect(source).toContain("'STANDARD_OFFER_SHOWN'");
    expect(source).toContain("'STANDARD_OFFER_DECLINED'");
    expect(source).toContain("'MONITOR_OFFER_SHOWN'");
    expect(source).toContain("'STANDARD_OFFER_SELECTED'");
    expect(source).toContain("'MONITOR_OFFER_SELECTED'");
    expect(source).toContain("isolationLevel: 'Serializable'");
    expect(source).toContain('workspaceId_groupId_idempotencyKey');
  });
});
