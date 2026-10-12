import {
  BuildServiceImprovementOverview,
  SOCIAL_PROGRESS_OBSERVATION_DEFINITION,
  TRAINING_PROGRESS_OBSERVATION_DEFINITION,
  IMPROVEMENT_FEEDBACK_OBSERVATION_DEFINITION,
  type ServiceImprovementSource,
} from '@bunshin/application';
import {
  HASSY_SUPPORT_IMPROVEMENT_DEFINITION,
  HASSY_PHOTO_QUALITY_DEFINITION,
} from '@bunshin/capability-social';
import type { OverviewPackage } from '../src/services/service-improvement-admin-preview';
export const overviewClock = new Date('2026-10-12T01:00:00Z');
export async function fixtureOverview(
  packageKey: OverviewPackage = 'SOCIAL',
  count = 5,
  completeness: 'COMPLETE' | 'PARTIAL' = 'COMPLETE',
) {
  const scope = {
    tenantRef: 'workspace',
    workspaceId: 'workspace',
    serviceId: 'service',
    environment: 'DEVELOPMENT' as const,
  };
  const specs =
    packageKey === 'SOCIAL'
      ? [
          {
            definition: SOCIAL_PROGRESS_OBSERVATION_DEFINITION,
            flags: ['accepted', 'rejected', 'posted'],
          },
          { definition: IMPROVEMENT_FEEDBACK_OBSERVATION_DEFINITION, flags: [] },
          {
            definition: HASSY_SUPPORT_IMPROVEMENT_DEFINITION,
            flags: ['acceptedByCutoff', 'completedByCutoff', 'skippedByCutoff'],
          },
          { definition: HASSY_PHOTO_QUALITY_DEFINITION, flags: ['unconfirmedFact', 'hadIssues'] },
        ]
      : [
          {
            definition: TRAINING_PROGRESS_OBSERVATION_DEFINITION,
            flags: ['started', 'completed', 'submitted', 'evaluationReady', 'evaluationFailed'],
          },
        ];
  const sources: ServiceImprovementSource[] = specs.map(({ definition, flags }) => ({
    definition,
    metrics: flags.map((key) => ({ key, flag: key })),
    uncertainFlags: [],
    adapter: {
      definition,
      readObservations: () =>
        Promise.resolve({
          observations: Array.from({ length: count }, (_, i) => ({
            scope: { ...scope, packageKey, adapterKey: definition.key },
            source: { kind: 'SYNTHETIC', id: `PRIVATE_${i}`, revision: 'v1' },
            occurredAt: new Date('2026-10-07Z'),
            feature: 'SYNTHETIC',
            action: 'OBSERVE',
            eventType: 'SYNTHETIC',
            status: 'RECORDED',
            category: 'UNKNOWN' as const,
            purpose: 'PRODUCT_IMPROVEMENT' as const,
            subtype: definition.subtypes[0]!,
            errorCode: null,
            correlation: { kind: 'EXPLICIT_REFERENCE' as const, key: `PRIVATE_${i}` },
            releaseSha: null,
            userRef: `PRIVATE_USER_${i}`,
            bunshinRef: packageKey === 'SOCIAL' ? `PRIVATE_BUNSHIN_${i}` : null,
            entityRef: `PRIVATE_${i}`,
            metadata: Object.fromEntries(
              Object.entries(definition.metadataRules).map(([key, rule]) => [
                key,
                rule.kind === 'BOOLEAN'
                  ? [
                      'accepted',
                      'acceptedByCutoff',
                      'started',
                      'submitted',
                      'evaluationReady',
                    ].includes(key)
                  : rule.kind === 'CODE'
                    ? rule.values[0]
                    : 0,
              ]),
            ),
          })),
          coverage: {
            completeness,
            missingCount: completeness === 'COMPLETE' ? 0 : null,
            truncated: completeness !== 'COMPLETE',
          },
        }),
    },
  }));
  return new BuildServiceImprovementOverview(
    { authorize: () => Promise.resolve(true) },
    sources,
  ).execute({
    actorUserId: 'manager',
    scope,
    fromInclusive: new Date('2026-10-04T15:00:00Z'),
    toExclusive: new Date('2026-10-11T15:00:00Z'),
    limit: 1000,
  });
}
