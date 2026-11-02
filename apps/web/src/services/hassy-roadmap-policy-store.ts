import 'server-only';
import {
  PrismaManagedFeaturePolicyRepository,
  prisma,
  type PrismaClient,
  readManagedFeaturePolicyValue,
} from '@bunshin/database';
import {
  HASSY_ROADMAP_POLICY_CONFIG_KEY,
  readHassyRoadmapPolicy,
  normalizeHassyRoadmapSettings,
  effectiveHassyRoadmapSettings,
  assertServiceHassyRoadmapSettings,
  type HassyRoadmapSettings,
  type HassyRoadmapPolicy,
} from './hassy-roadmap-settings';
const descriptor = {
  featureKey: 'SOCIAL.ACTIVITY_SUPPORT',
  configKey: HASSY_ROADMAP_POLICY_CONFIG_KEY,
};
export function hassyRoadmapPolicyRepository(client: PrismaClient = prisma) {
  return new PrismaManagedFeaturePolicyRepository<HassyRoadmapSettings, HassyRoadmapPolicy>(
    {
      ...descriptor,
      requiredOnboardingTemplate: 'HASSY',
      read: readHassyRoadmapPolicy,
      normalize: normalizeHassyRoadmapSettings,
      effective: effectiveHassyRoadmapSettings,
      assertService: assertServiceHassyRoadmapSettings,
    },
    client,
  );
}
/** Member-read composition rechecks membership/consent before returning the evaluated roadmap. */
export async function readRuntimeHassyRoadmapPolicy(scope: {
  workspaceId: string;
  serviceId: string;
}) {
  return readHassyRoadmapPolicy(await readManagedFeaturePolicyValue(prisma, scope, descriptor));
}
