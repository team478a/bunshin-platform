import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../app/(app)/organizations/[workspaceId]/payment/page.tsx', import.meta.url),
  'utf8',
);

describe('organization payment settings page', () => {
  it('limits access and every mutation to the selected organization', () => {
    expect(source).toContain("role: { in: ['OWNER', 'ADMIN'] }");
    expect(source).toContain("type: 'ORGANIZATION'");
    expect(source).toContain('workspaceId_environment_provider');
    expect(source).toContain('workspaceId: parsed.data.workspaceId');
  });

  it('never renders stored ciphertext and requires verification before activation', () => {
    expect(source).not.toContain('select: { encryptedSecretKey');
    expect(source).toContain("configuration.status !== 'VERIFIED'");
    expect(source).toContain("action: 'CONNECTION_TEST'");
    expect(source).toContain("action: 'ACTIVATE'");
  });

  it('shows the scoped webhook endpoint and requires its signing secret', () => {
    expect(source).toContain('/api/payments/stripe/${configuration.id}/webhook');
    expect(source).toContain('!configuration.encryptedWebhookSecret');
    expect(source).toContain('checkout.session.completed');
    expect(source).toContain('カード番号など購入者の決済情報は、この画面には入力しません');
  });

  it('scopes purchase and webhook operations to the selected organization', () => {
    expect(source).toContain('programPurchase.findMany');
    expect(source).toContain('paymentWebhookEvent.findMany');
    expect(source).toContain('where: { workspaceId: workspace.id }');
    expect(source).toContain("where: { workspaceId: workspace.id, status: 'FAILED' }");
    expect(source).toContain('最近の購入');
    expect(source).toContain('要確認の決済通知');
  });

  it('shows gross payments, cumulative refunds, and net sales', () => {
    expect(source).toContain('_sum: { amountYen: true, refundedAmountYen: true }');
    expect(source).toContain('差引売上');
    expect(source).toContain('返金総額');
    expect(source).toContain('purchase.refundedAmountYen');
  });
});
