import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('OEM SNS support candidate admin', () => {
  it('uses managed service authorization and audited scoped transitions', () => {
    const action = readFileSync(
      join(
        process.cwd(),
        'app/s/[serviceSlug]/manage/personalization/oem-support-candidate-actions.ts',
      ),
      'utf8',
    );
    expect(action).toContain('resolveManagedServiceContext');
    expect(action).toContain('transitionSocialActivityOemSupportCandidate');
    expect(action).toContain('actorUserId: actor.userId');
  });

  it('does not expose participant content or memory on the candidate list', () => {
    const page = readFileSync(
      join(process.cwd(), 'app/s/[serviceSlug]/manage/personalization/page.tsx'),
      'utf8',
    );
    expect(page).toContain('支援候補');
    expect(page).toContain('営業や契約は自動実行されません');
    expect(page).not.toContain('candidate.memory');
    expect(page).not.toContain('candidate.postBody');
  });
});
