import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pointsPage = readFileSync(new URL('../app/(app)/points/page.tsx', import.meta.url), 'utf8');
const badgesPage = readFileSync(new URL('../app/(app)/badges/page.tsx', import.meta.url), 'utf8');

describe('reward workspace selection', () => {
  it.each([pointsPage, badgesPage])(
    'selects only an eligible service belonging to the signed-in user',
    (source) => {
      expect(source).toContain('listActiveWorkspacesForUser(user.userId)');
      expect(source).toContain('listActiveRewardsPilotServiceAccesses');
      expect(source).toContain('selectRewardsServiceContext');
      expect(source).toContain('params.serviceSlug');
      expect(source).toContain('RewardsServiceSelector');
    },
  );
});
