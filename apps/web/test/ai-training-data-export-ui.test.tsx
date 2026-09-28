import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AiTrainingDataExportCard } from '../app/s/[serviceSlug]/programs/[programEnrollmentId]/ai-training-data-export-card';

describe('training personal data download UI', () => {
  it('requires explicit confirmation and explains that exporting does not delete data', () => {
    const html = renderToStaticMarkup(
      <AiTrainingDataExportCard serviceSlug="training" programEnrollmentId="enrollment" />,
    );
    expect(html).toContain('データは削除されません');
    expect(html).toContain('共有端末');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('90日');
  });
  it('has download and failure handling without putting answer bodies in storage or URLs', () => {
    const source = readFileSync(
      new URL(
        '../app/s/[serviceSlug]/programs/[programEnrollmentId]/ai-training-data-export-card.tsx',
        import.meta.url,
      ),
      'utf8',
    );
    expect(source).toContain("method: 'POST'");
    expect(source).toContain('response.status === 413');
    expect(source).toContain('URL.revokeObjectURL');
    expect(source).not.toMatch(/localStorage|console\./);
  });
  it('provides a discovery entry for completed and expired training as well', () => {
    const source = readFileSync(
      new URL('../app/s/[serviceSlug]/programs/page.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain("['COMPLETED', 'EXPIRED']");
    expect(source).toContain('endedTrainingPrograms');
    expect(source).toContain('groupMembershipId: membership.id');
  });
});
