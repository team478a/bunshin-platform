import type { MemberRoadmapPolicy } from '@bunshin/application';
// Neutral test policy for DB evidence composition. No product default is owned by the DB adapter.
export const evidenceTestPolicy: MemberRoadmapPolicy = {
  createDefinition(scope) {
    return {
      version: 'evidence-composition-test-v1',
      scope: { workspaceId: scope.workspaceId, serviceId: scope.serviceId },
      stages: [
        {
          id: 'STEP_1',
          title: 'Evidence composition',
          milestones: [
            {
              id: 'FIRST_DECISION',
              title: 'Decision',
              criterion: { kind: 'USAGE', metric: 'decisions', target: 1 },
            },
            ...[
              'INITIAL_SETUP',
              'WEEKLY_PLAN',
              'POST_PREPARATION',
              'SNS_METRICS',
              'POST_HISTORY',
            ].map((id) => ({
              id,
              title: id,
              criterion: { kind: 'FACT' as const, fact: id },
            })),
          ],
        },
      ],
    };
  },
  validateDefinition() {},
};
