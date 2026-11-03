import 'server-only';
import { managedFeaturePolicyResponse } from './managed-feature-policy';
export { managedFeaturePolicyTarget as recommendationPolicyTarget } from './managed-feature-policy';
export function socialRecommendationPolicyResponse(request: Request, slug: string) {
  return managedFeaturePolicyResponse(request, slug, 'recommendations', async () => {
    const db = await import('@bunshin/database');
    return new db.PrismaSocialRecommendationPolicyRepository();
  });
}
