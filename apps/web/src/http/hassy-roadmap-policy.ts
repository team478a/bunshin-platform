import 'server-only';
import { managedFeaturePolicyResponse } from './managed-feature-policy';
export function hassyRoadmapPolicyResponse(request: Request, slug: string) {
  return managedFeaturePolicyResponse(request, slug, async () => {
    const { hassyRoadmapPolicyRepository } = await import('../services/hassy-roadmap-policy-store');
    return hassyRoadmapPolicyRepository();
  });
}
