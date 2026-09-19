import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  new URL('../app/(app)/admin/organizations/[workspaceId]/commercial/page.tsx', import.meta.url),
  'utf8',
);
const scheduler = readFileSync(
  new URL('../src/services/commercial-billing-reminder-scheduler.ts', import.meta.url),
  'utf8',
);
const databaseService = readFileSync(
  new URL('../../../packages/database/src/commercial-billing.ts', import.meta.url),
  'utf8',
);

describe('commercial billing reminder operations', () => {
  it('saves the automatic reminder setting with the commercial contract', () => {
    const contractFormStart = page.indexOf('<form className="form-stack" action={saveContract}>');
    const contractFormEnd = page.indexOf('</form>', contractFormStart);
    const contractForm = page.slice(contractFormStart, contractFormEnd);

    expect(contractFormStart).toBeGreaterThan(-1);
    expect(contractForm).toContain('name="automaticRemindersEnabled"');
  });

  it('does not place the contract setting in a custom quote form', () => {
    const quoteFormStart = page.indexOf('action={prepareCustomQuoteInvoice}');
    const quoteFormEnd = page.indexOf('</form>', quoteFormStart);
    const quoteForm = page.slice(quoteFormStart, quoteFormEnd);

    expect(quoteFormStart).toBeGreaterThan(-1);
    expect(quoteForm).not.toContain('name="automaticRemindersEnabled"');
  });

  it('records failed automatic deliveries and shows the recovery guidance', () => {
    expect(scheduler).toContain("'PAYMENT_GUIDANCE_FAILED'");
    expect(scheduler).toContain("'OVERDUE_REMINDER_FAILED'");
    expect(scheduler).toContain('commercialBillingAudit.create');
    expect(databaseService).toContain('entityId: true');
    expect(page).toContain('latestReminderEvents');
    expect(page).toContain('未解決の自動案内メール送信失敗');
    expect(page).toContain('支払い案内をメールする');
  });

  it('tests the saved billing recipient separately from the contract save form', () => {
    const contractFormStart = page.indexOf('<form className="form-stack" action={saveContract}>');
    const contractFormEnd = page.indexOf('</form>', contractFormStart);
    const contractForm = page.slice(contractFormStart, contractFormEnd);
    const testFormStart = page.indexOf('action={sendBillingRecipientTest}');

    expect(testFormStart).toBeGreaterThan(contractFormEnd);
    expect(contractForm).not.toContain('sendBillingRecipientTest');
    expect(page).toContain('請求先へテストメールを送る');
    expect(page).toContain('organizationCommercialContract.billingEmail');
    expect(page).toContain("action: 'BILLING_EMAIL_TEST_SENT'");
    expect(page).toContain("action: 'BILLING_EMAIL_TEST_FAILED'");
    expect(page).toContain('recipientTestSent=1');
  });
});
