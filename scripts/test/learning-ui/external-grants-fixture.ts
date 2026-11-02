import type { ComponentProps } from 'react';
import type { ExternalGrantOwnerCard } from '../../../apps/web/app/s/[serviceSlug]/bunshins/[bunshinId]/connections/card';
export function externalGrantFixture(
  stopped = false,
): ComponentProps<typeof ExternalGrantOwnerCard>['initial'] {
  return {
    version: 'external-grant-owner-v1',
    consentVersion: 'external-read-consent-v1',
    targetName: '合成データの投稿パートナー',
    managementAvailable: true,
    clients: stopped ? [] : [{ id: 'synthetic-client', name: '検証用接続先' }],
    grants: stopped
      ? [
          {
            id: '11111111-1111-4111-8111-111111111111',
            clientName: '検証用接続先',
            state: 'ACTIVE',
            revision: 1,
            grantedAt: '2026-11-03T00:00:00.000Z',
            expiresAt: '2026-11-03T01:00:00.000Z',
          },
        ]
      : [],
  };
}
