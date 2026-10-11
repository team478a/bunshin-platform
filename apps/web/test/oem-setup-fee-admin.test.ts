import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  new URL('../app/(app)/admin/organizations/[workspaceId]/commercial/page.tsx', import.meta.url),
  'utf8',
);
const invoiceSections = readFileSync(
  new URL(
    '../app/(app)/admin/organizations/[workspaceId]/commercial/commercial-invoice-sections.tsx',
    import.meta.url,
  ),
  'utf8',
);
const dashboard = readFileSync(
  new URL(
    '../app/(app)/admin/organizations/[workspaceId]/commercial/commercial-admin-dashboard.tsx',
    import.meta.url,
  ),
  'utf8',
);
const contractSection = readFileSync(
  new URL(
    '../app/(app)/admin/organizations/[workspaceId]/commercial/commercial-contract-section.tsx',
    import.meta.url,
  ),
  'utf8',
);
const service = readFileSync(
  new URL('../../../packages/database/src/commercial-billing-service.ts', import.meta.url),
  'utf8',
);
const operations = readFileSync(
  new URL('../app/(app)/admin/commercial-billing/page.tsx', import.meta.url),
  'utf8',
);

describe('OEM setup fee admin', () => {
  it('requires explicit agreement evidence and confirmation before creating a separate draft', () => {
    expect(page).toContain("confirmed: z.literal('on')");
    expect(page).toContain('prepareSetupFeeInvoice');
    expect(invoiceSections).toContain('name="agreementReference"');
    expect(invoiceSections).toContain('name="chargeKey"');
    expect(invoiceSections).toContain('月額とは別請求');
    expect(invoiceSections).toContain('商品名や先行社数から自動計算しません');
    expect(dashboard).toContain("query.setupFeeSaved === '1'");
    expect(dashboard).toContain('初期費用の請求下書きを作成しました');
    expect(dashboard).toContain("query.error === 'setupFee'");
  });

  it('fails closed on missing offering and uses a separate invoice source', () => {
    expect(service).toContain('REVIEW_REQUIRED: product offering at agreement date required');
    expect(service).toContain("kind: 'SETUP_FEE'");
    expect(service).toContain('setupFeeChargeId: charge.id');
    expect(service).toContain('pg_advisory_xact_lock');
  });

  it('explains that setup fees are outside monthly automatic collection consent', () => {
    expect(contractSection).toContain('次回以降の月額料金を保存カードから回収する');
    expect(contractSection).toContain('自動回収の対象は月額料金だけで、初期費用は対象外です');
  });

  it('shows Stripe refund notifications as review-required without auto-settling them', () => {
    expect(operations).toContain('Stripe返金の要照合');
    expect(operations).toContain('内部請求状態は自動変更していません');
    expect(operations).toContain("status === 'REFUND_REVIEW'");
    expect(service).toContain('FULL_REFUND_REVIEW_REQUIRED');
    expect(service).toContain('PARTIAL_REFUND_REVIEW_REQUIRED');
  });
});
