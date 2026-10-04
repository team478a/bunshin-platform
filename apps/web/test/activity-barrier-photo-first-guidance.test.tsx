import type {
  SocialActivitySupportKey,
  SocialActivitySupportProgress,
} from '@bunshin/capability-social';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActivityBarrierCard } from '../app/s/[serviceSlug]/bunshins/[bunshinId]/activity-barrier-card';

function support(key: SocialActivitySupportKey): SocialActivitySupportProgress {
  return {
    id: `support-${key}`,
    status: 'ACCEPTED',
    support: {
      key,
      title: '今日の小さなサポート',
      reason: '次に進みやすくします。',
      steps: ['写真を確認する'],
    },
  };
}

function renderSupport(key: SocialActivitySupportKey, photoFirstHref?: string) {
  return renderToStaticMarkup(
    <ActivityBarrierCard
      endpoint="/api/services/hassy/bunshins/bunshin-1/activity-barrier"
      initialQuestion={null}
      initialSupport={support(key)}
      {...(photoFirstHref ? { photoFirstHref } : {})}
    />,
  );
}

describe('Hassy activity barrier Photo First guidance', () => {
  it.each([
    ['CONTENT_REVIEW', '写真から投稿内容を考え直す'],
    ['MEDIA_PREPARATION', '写真を1枚残す'],
    ['LOW_RISK_PUBLISHING', '写真の使い方と投稿案を確認する'],
  ] as const)('connects %s support to the existing Photo First section', (key, label) => {
    const html = renderSupport(key, '#daily-action');

    expect(html).toContain(`href="#daily-action"`);
    expect(html).toContain(label);
    expect(html).toContain('できました');
  });

  it('does not expose the Hassy-only guidance when no destination is supplied', () => {
    const html = renderSupport('CONTENT_REVIEW');

    expect(html).not.toContain('href="#daily-action"');
    expect(html).not.toContain('写真から投稿内容を考え直す');
  });

  it('does not route unrelated support to Photo First', () => {
    const html = renderSupport('MEASUREMENT_SETUP', '#daily-action');

    expect(html).not.toContain('href="#daily-action"');
  });
});
