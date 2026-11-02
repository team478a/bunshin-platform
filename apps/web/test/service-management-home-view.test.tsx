import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ServiceManagementHomeView } from '../app/s/[serviceSlug]/manage/service-management-home-view';
import { serviceHomeFixture } from './service-management-home-fixture';

vi.mock('../app/ui/public-shell', () => ({
  PublicShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('service management home presentation', () => {
  it('shows training operations without SNS metrics and explains separate training authority', () => {
    const html = renderToStaticMarkup(<ServiceManagementHomeView model={serviceHomeFixture()} />);
    expect(html).toContain('マナベルスタイルの運営');
    expect(html).toContain('/manage/programs');
    expect(html).toContain('/manage/training');
    expect(html).toContain('研修内容の承認やAI利用・開始条件');
    expect(html).not.toContain('作られた投稿案');
    expect(html).not.toContain('次週の投稿改善');
    expect(html).not.toContain('/manage/recommendations');
  });

  it('keeps SNS metrics for a social service with navigation before long aggregates', () => {
    const html = renderToStaticMarkup(
      <ServiceManagementHomeView model={serviceHomeFixture(false)} />,
    );
    expect(html).toContain('ハッシーの運営');
    expect(html).toContain('作られた投稿案');
    expect(html.indexOf('運営メニュー')).toBeLessThan(html.indexOf('直近7日間の活動'));
  });

  it('keeps settings accessible without claiming zero or successful readiness after summary failure', () => {
    const fixture = serviceHomeFixture();
    fixture.summary = null;
    const html = renderToStaticMarkup(<ServiceManagementHomeView model={fixture} />);
    expect(html).toContain('運用集計を取得できませんでした');
    expect(html).toContain('/manage/settings');
    expect(html).toContain('利用中の参加者：2名');
    expect(html).not.toContain('送信0件');
    expect(html).not.toContain('項目完了');
  });
});
