import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ServiceLegalDocumentContent } from '../app/s/[serviceSlug]/service-legal-document';

describe('public service legal document', () => {
  it('renders published markdown-like content as readable headings and paragraphs', () => {
    const rendered = renderToStaticMarkup(
      <ServiceLegalDocumentContent
        document={{
          title: 'ワタシワークス公式 利用規約',
          version: 1,
          content:
            '# ワタシワークス公式 利用規約\n\n## 第1条（適用）\n\n1. 本規約を適用します。\n\n- 運営者: 和愛株式会社',
        }}
      />,
    );

    expect(rendered).not.toContain('<h2>ワタシワークス公式 利用規約</h2>');
    expect(rendered).toContain('<h2>第1条（適用）</h2>');
    expect(rendered).toContain('1. 本規約を適用します。');
    expect(rendered).toContain('運営者: 和愛株式会社');
  });
});
