import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ServiceFoundationRecord } from '@bunshin/application';
import { HassyGrowthPolicyGate } from '../app/ui/member-growth-roadmap/policy-gate';
import { HassyMemberGrowthRoadmap } from '../app/ui/member-growth-roadmap/card';
import type { PublicServiceContext } from '../src/services/public-service';

function service(templateKey: unknown): PublicServiceContext {
  return {
    workspaceId: 'workspace',
    serviceId: 'service',
    configuration: {
      workspaceId: 'workspace',
      groupId: 'service',
      slug: 'hassy',
      displayName: 'ハッシー',
      registration: { onboardingConfig: { templateKey } },
    } as ServiceFoundationRecord,
  };
}
function render(value: PublicServiceContext) {
  return renderToStaticMarkup(
    <>
      <h1>今日やること</h1>
      <HassyGrowthPolicyGate service={value}>
        <HassyMemberGrowthRoadmap endpointBase="/api/services/synthetic/bunshins/synthetic" />
      </HassyGrowthPolicyGate>
      <p>通常のSNS機能</p>
    </>,
  );
}
describe('service roadmap visibility', () => {
  it('renders the explicitly selected Hassy roadmap without automatic API loading', () => {
    expect(render(service('HASSY'))).toContain('成長ロードマップを見る');
  });
  it.each(['CUSTOM', 'MANABERU_STYLE', null, undefined])(
    'keeps ordinary SNS content while hiding the Hassy roadmap for %s',
    (key) => {
      const html = render(service(key));
      expect(html).toContain('今日やること');
      expect(html).toContain('通常のSNS機能');
      expect(html).not.toContain('成長ロードマップを見る');
    },
  );
  it('does not render a policy from a mismatched configuration scope', () => {
    const value = service('HASSY');
    value.configuration.groupId = 'foreign';
    expect(render(value)).not.toContain('成長ロードマップを見る');
  });
});
