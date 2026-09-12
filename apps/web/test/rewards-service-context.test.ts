import { describe, expect, it } from 'vitest';
import {
  selectRewardsServiceContext,
  type RewardsServiceContext,
} from '../src/rewards/rewards-service-context';

const contexts: RewardsServiceContext[] = [
  {
    membershipId: 'membership-a',
    workspaceId: 'workspace-1',
    workspaceName: '組織',
    groupId: 'group-a',
    serviceSlug: 'service-a',
    serviceName: 'サービスA',
    endsAt: null,
  },
  {
    membershipId: 'membership-b',
    workspaceId: 'workspace-1',
    workspaceName: '組織',
    groupId: 'group-b',
    serviceSlug: 'service-b',
    serviceName: 'サービスB',
    endsAt: null,
  },
];

describe('rewards service context', () => {
  it('requires a choice when multiple services share one workspace', () => {
    expect(
      selectRewardsServiceContext({ contexts, requestedWorkspaceId: 'workspace-1' }),
    ).toBeNull();
  });

  it('selects only the exact requested service and workspace', () => {
    expect(
      selectRewardsServiceContext({
        contexts,
        requestedWorkspaceId: 'workspace-1',
        requestedServiceSlug: 'service-b',
      }),
    ).toEqual(contexts[1]);
    expect(
      selectRewardsServiceContext({
        contexts,
        requestedWorkspaceId: 'another-workspace',
        requestedServiceSlug: 'service-b',
      }),
    ).toBeNull();
  });

  it('opens the only available service without an extra choice', () => {
    expect(selectRewardsServiceContext({ contexts: [contexts[0]!] })).toEqual(contexts[0]);
  });

  it('does not guess when the same slug exists in more than one workspace', () => {
    expect(
      selectRewardsServiceContext({
        contexts: [contexts[0]!, { ...contexts[0]!, workspaceId: 'workspace-2' }],
        requestedServiceSlug: 'service-a',
      }),
    ).toBeNull();
  });
});
