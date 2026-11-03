import type { HassyRoadmapPolicy } from '../src/services/hassy-roadmap-settings';
import { describe, expect, it } from 'vitest';
import type { ServiceFoundationRecord } from '@bunshin/application';
import { selectServiceMemberRoadmapPolicy } from '../src/services/service-growth-policy';
import type { PublicServiceContext } from '../src/services/public-service';

const scope = {
  workspaceId: 'workspace-a',
  serviceId: 'service-a',
  userId: 'owner',
  groupMembershipId: 'member-a',
  bunshinId: 'bunshin-a',
};
function service(template: unknown = 'HASSY'): PublicServiceContext {
  return {
    workspaceId: scope.workspaceId,
    serviceId: scope.serviceId,
    configuration: {
      id: 'configuration-a',
      workspaceId: scope.workspaceId,
      groupId: scope.serviceId,
      slug: 'renamed-oem-service',
      displayName: 'OEM brand',
      registration: { onboardingConfig: { templateKey: template } },
    } as ServiceFoundationRecord,
  };
}
describe('trusted service growth policy selection', () => {
  it('uses the saved template selection independently of brand and slug', () => {
    const policy = selectServiceMemberRoadmapPolicy(service())!;
    const def = policy.createDefinition(scope);
    expect(def.version).toBe('hassy-roadmap-v1');
    expect(def.scope).toEqual({ workspaceId: scope.workspaceId, serviceId: scope.serviceId });
    expect(def.stages).toHaveLength(5);
    policy.validateDefinition(def, scope);
    const second = policy.createDefinition(scope);
    def.stages[0]!.title = 'changed';
    expect(second.stages[0]!.title).toBe('SNS運用を始める');
  });
  it.each(['CUSTOM', 'MANABERU_STYLE', '', null, undefined, 123])(
    'does not default an unknown template %j to Hassy',
    (template) => {
      const value = service();
      (value.configuration.registration.onboardingConfig as Record<string, unknown>)[
        'templateKey'
      ] = template;
      value.configuration.slug = 'hassy';
      value.configuration.displayName = 'ハッシー';
      expect(selectServiceMemberRoadmapPolicy(value)).toBeNull();
    },
  );
  it.each([{}, null, [], { businessProfileEnabled: true }, { templateKey: 'hassy' }])(
    'requires an explicit supported template in %j',
    (settings) => {
      const value = service();
      value.configuration.registration.onboardingConfig = settings;
      expect(selectServiceMemberRoadmapPolicy(value)).toBeNull();
    },
  );
  it('does not use an inherited template key', () => {
    const value = service();
    value.configuration.registration.onboardingConfig = Object.create({
      templateKey: 'HASSY',
    }) as object;
    expect(selectServiceMemberRoadmapPolicy(value)).toBeNull();
  });
  it.each(['workspaceId', 'groupId'] as const)('rejects a configuration from another %s', (key) => {
    const value = service();
    value.configuration[key] = 'foreign';
    expect(selectServiceMemberRoadmapPolicy(value)).toBeNull();
  });
  it.each(['workspaceId', 'serviceId'] as const)(
    'binds the selected policy to the resolved %s',
    (key) => {
      const value = service();
      const policy = selectServiceMemberRoadmapPolicy(value)!;
      const foreign = { ...scope, [key]: 'foreign' };
      expect(() => policy.createDefinition(foreign)).toThrow('scope mismatch');
      const def = policy.createDefinition(scope);
      expect(() => policy.validateDefinition(def, foreign)).toThrow('scope mismatch');
    },
  );
  it('keeps its bound scope even if the caller mutates the resolved service object', () => {
    const value = service();
    const policy = selectServiceMemberRoadmapPolicy(value)!;
    value.workspaceId = 'foreign';
    value.serviceId = 'foreign';
    expect(policy.createDefinition(scope).scope).toEqual({
      workspaceId: scope.workspaceId,
      serviceId: scope.serviceId,
    });
  });
  it('rejects an unbound or foreign definition for the selected product', () => {
    const policy = selectServiceMemberRoadmapPolicy(service())!;
    const def = policy.createDefinition(scope);
    def.scope = null;
    expect(() => policy.validateDefinition(def, scope)).toThrow('definition scope mismatch');
  });
});

it('binds a fresh managed definition snapshot only to the explicitly selected Hassy service', () => {
  const settings: HassyRoadmapPolicy = {
    version: 'hassy-roadmap-policy-v1',
    revision: 2,
    headquarters: { generated: 5, decisions: 3, activeDays: 7, validReferrals: 3 },
    service: null,
  };
  expect(selectServiceMemberRoadmapPolicy(service('CUSTOM'), settings)).toBeNull();
  const selected = selectServiceMemberRoadmapPolicy(service(), settings)!;
  settings.headquarters!.generated = 20;
  const definition = selected.createDefinition(scope);
  expect(definition.stages[0]!.milestones[1]!.criterion).toEqual({
    kind: 'USAGE',
    metric: 'generated',
    target: 5,
  });
  definition.stages[0]!.title = 'mutated';
  expect(selected.createDefinition(scope).stages[0]!.title).toBe('SNS運用を始める');
});
