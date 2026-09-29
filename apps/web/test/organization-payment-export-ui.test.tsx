import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OrganizationPaymentExport } from '../app/(app)/organizations/[workspaceId]/payment/organization-payment-export';

describe('organization payment export form', () => {
  it('offers accessible date inputs and explains the range and non-truncating limit', () => {
    const html = renderToStaticMarkup(<OrganizationPaymentExport workspaceId="workspace" />);
    expect(html).toContain('受付開始日');
    expect(html).toContain('受付終了日（この日を含む）');
    expect(html).toContain('name="from"');
    expect(html).toContain('name="to"');
    expect(html.match(/type="date"/g)).toHaveLength(2);
    expect(html).toContain('日本時間の受付日');
    expect(html).toContain('入金日・返金日ではありません');
    expect(html).toContain('両方空欄なら全期間');
    expect(html).toContain('10,000件');
    expect(html).toContain('一部だけのCSVを保存せず');
    expect(html).toContain('決済台帳をCSVで保存する');
    expect(html).toContain('aria-live="polite"');
  });
});
