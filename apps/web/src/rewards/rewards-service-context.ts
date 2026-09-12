import type { RewardsPilotServiceAccess } from '@bunshin/database';

export type RewardsServiceContext = RewardsPilotServiceAccess & {
  workspaceName: string;
};

export function selectRewardsServiceContext(input: {
  contexts: RewardsServiceContext[];
  requestedWorkspaceId?: string;
  requestedServiceSlug?: string;
}): RewardsServiceContext | null {
  if (input.requestedServiceSlug) {
    const matches = input.contexts.filter(
      (context) =>
        context.serviceSlug === input.requestedServiceSlug &&
        (!input.requestedWorkspaceId || context.workspaceId === input.requestedWorkspaceId),
    );
    return matches.length === 1 ? matches[0]! : null;
  }
  const candidates = input.requestedWorkspaceId
    ? input.contexts.filter((context) => context.workspaceId === input.requestedWorkspaceId)
    : input.contexts;
  return candidates.length === 1 ? candidates[0]! : null;
}
