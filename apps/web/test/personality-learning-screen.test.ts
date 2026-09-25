import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const section = readFileSync(
  new URL('../app/(app)/bunshins/[bunshinId]/personality-section.tsx', import.meta.url),
  'utf8',
);
const pageData = readFileSync(
  new URL('../app/(app)/bunshins/[bunshinId]/bunshin-page-data.ts', import.meta.url),
  'utf8',
);

describe('Personality learning review screen', () => {
  it('loads owner-scoped proposals on the server', () => {
    expect(pageData).toContain('ListPersonalityLearningProposals');
    expect(pageData).toContain('actorUserId');
  });

  it('explains that pending proposals are not automatically applied', () => {
    expect(section).toContain('確認するまで自動では反映されません');
    expect(section).toContain('根拠となる評価');
  });

  it('offers approve, reject, and revoke actions', () => {
    expect(section).toContain("act(proposal.id, 'approve')");
    expect(section).toContain("act(proposal.id, 'reject')");
    expect(section).toContain("act(proposal.id, 'revoke')");
  });
});
