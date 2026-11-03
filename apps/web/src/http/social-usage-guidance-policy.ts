import 'server-only';
import { managedFeaturePolicyResponse } from './managed-feature-policy';
export function socialUsageGuidancePolicyResponse(request: Request, slug: string) {
  return managedFeaturePolicyResponse(request, slug, 'usage-guidance', async () => {
    const db = await import('@bunshin/database');
    return new db.PrismaSocialUsageGuidancePolicyRepository();
  });
}
