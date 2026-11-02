import 'server-only';
import type { MemberRoadmapPolicy, MemberUsageScope } from '@bunshin/application';
import {
  createConfiguredHassyRoadmapDefinition,
  type HassyRoadmapPolicy,
} from './hassy-roadmap-settings';
import { ApplicationError } from '@bunshin/shared';
import type { PublicServiceContext } from './public-service';
import { HASSY_MEMBER_ROADMAP_POLICY } from './hassy-growth-policy';

/** Only a resolved, owner-authorized ServiceContext may select a product policy. */
export function selectServiceMemberRoadmapPolicy(
  service: PublicServiceContext,
  managedPolicy?: HassyRoadmapPolicy,
): MemberRoadmapPolicy | null {
  const configuration = service.configuration;
  if (
    !configuration ||
    !service.workspaceId ||
    !service.serviceId ||
    configuration.workspaceId !== service.workspaceId ||
    configuration.groupId !== service.serviceId
  )
    return null;
  const settings: unknown = configuration.registration?.onboardingConfig;
  if (
    !settings ||
    typeof settings !== 'object' ||
    Array.isArray(settings) ||
    !Object.hasOwn(settings, 'templateKey') ||
    (settings as Record<string, unknown>)['templateKey'] !== 'HASSY'
  )
    return null;
  const snapshot = managedPolicy ? structuredClone(managedPolicy) : undefined;
  const workspaceId = service.workspaceId;
  const serviceId = service.serviceId;
  const checkScope = (scope: MemberUsageScope) => {
    if (scope.workspaceId !== workspaceId || scope.serviceId !== serviceId)
      throw new ApplicationError('VALIDATION_ERROR', 'roadmap policy scope mismatch');
  };
  return {
    createDefinition(scope) {
      checkScope(scope);
      const definition = createConfiguredHassyRoadmapDefinition(
        snapshot ?? {
          version: 'hassy-roadmap-policy-v1',
          revision: 0,
          headquarters: null,
          service: null,
        },
        scope,
      );
      definition.scope = { workspaceId, serviceId };
      return definition;
    },
    validateDefinition(definition, scope) {
      checkScope(scope);
      if (definition.scope?.workspaceId !== workspaceId || definition.scope.serviceId !== serviceId)
        throw new ApplicationError('VALIDATION_ERROR', 'roadmap definition scope mismatch');
      HASSY_MEMBER_ROADMAP_POLICY.validateDefinition(definition, scope);
    },
  };
}
