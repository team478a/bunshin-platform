import 'server-only';
import type { ReactNode } from 'react';
import type { PublicServiceContext } from '../../../src/services/public-service';
import { selectServiceMemberRoadmapPolicy } from '../../../src/services/service-growth-policy';

/** Service policy visibility only. The containing owner page and APIs still authorize access. */
export function HassyGrowthPolicyGate({
  service,
  children,
}: {
  service: PublicServiceContext;
  children: ReactNode;
}) {
  return selectServiceMemberRoadmapPolicy(service) ? children : null;
}
