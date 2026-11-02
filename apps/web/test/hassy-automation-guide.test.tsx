import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ServiceFoundationRecord } from '@bunshin/application';
import type { PublicServiceContext } from '../src/services/public-service';
import { HassyGrowthPolicyGate } from '../app/ui/member-growth-roadmap/policy-gate';
import {
  HassyAutomationGuide,
  HASSY_AUTOMATION_PLANNING_PROMPT,
} from '../app/ui/hassy-automation-guide/card';

describe('Hassy-only manual automation guidance', () => {
  it.each(['HASSY', 'CUSTOM', 'MANABERU_STYLE', null])(
    'reuses explicit service policy selection for %s',
    (templateKey) => {
      const service: PublicServiceContext = {
        workspaceId: 'w',
        serviceId: 's',
        configuration: {
          workspaceId: 'w',
          groupId: 's',
          registration: { onboardingConfig: { templateKey } },
        } as ServiceFoundationRecord,
      };
      const html = renderToStaticMarkup(
        <HassyGrowthPolicyGate service={service}>
          <HassyAutomationGuide />
        </HassyGrowthPolicyGate>,
      );
      expect(html.includes('投稿の負担を小さくする')).toBe(templateKey === 'HASSY');
      service.configuration.groupId = 'other';
      expect(
        renderToStaticMarkup(
          <HassyGrowthPolicyGate service={service}>
            <HassyAutomationGuide />
          </HassyGrowthPolicyGate>,
        ),
      ).toBe('');
    },
  );
  it('renders static guidance without connection claims, private data or invented provider endpoints', () => {
    const html = renderToStaticMarkup(<HassyAutomationGuide />);
    expect(html).toContain('外部サービスに登録しなくても');
    expect(html).toContain('テストも実際の送信や更新');
    expect(html).not.toMatch(/<form|<iframe|\/api\/|oauth|MUSE/);
    expect(html.match(/target="_blank"/g)).toHaveLength(3);
    expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(3);
    expect(HASSY_AUTOMATION_PLANNING_PROMPT).toContain('[自分で入力]');
    expect(HASSY_AUTOMATION_PLANNING_PROMPT).not.toContain('PRIVATE');
  });
});
