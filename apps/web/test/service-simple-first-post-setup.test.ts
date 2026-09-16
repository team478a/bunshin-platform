import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const setup = source('app/s/[serviceSlug]/bunshins/[bunshinId]/simple-first-post-setup.tsx');
const page = source('app/s/[serviceSlug]/bunshins/[bunshinId]/page.tsx');

describe('simple service first-post setup', () => {
  it('asks members only for the posting destination, pace when unlocked, and delivery time', () => {
    expect(setup).toContain('<legend>投稿するSNS</legend>');
    expect(setup).toContain('<legend>投稿するペース</legend>');
    expect(setup).toContain('受け取る時刻（日本時間）');
    expect(setup).toContain('deliveryPolicy.enabled && deliveryPolicy.lockCadence');
    expect(setup).toContain("? deliveryPolicy.cadence : 'WEEKLY'");
    expect(setup).toContain('serviceContentAssistanceLevel(deliveryPolicy.contentMode)');
  });

  it('prepares the existing guarded workflow in order', () => {
    const endpoints = [
      '/content-pillars',
      '/social-profiles',
      '/social-account-strategies/generate',
      '/approve',
      '/automatic-delivery',
    ];
    endpoints.forEach((endpoint) => expect(setup).toContain(endpoint));
    expect(setup).toContain("goal: 'BRAND_AWARENESS'");
    expect(setup).not.toContain('post-record');
    expect(setup).not.toContain('/daily-missions/generate');
    expect(setup).not.toContain('/weekly-plans/generate');
  });

  it('keeps detailed controls available without making them the primary path', () => {
    expect(page).toContain('<SimpleFirstPostSetup');
    expect(page).toContain('<details className="service-advanced-settings">');
    expect(page).toContain('細かい設定を自分で変える（必要な方だけ）');
    expect(page).toContain('id="today-post"');
  });

  it('explains when today is not a delivery day and shows the next date', () => {
    expect(page).toContain('resolveDeliveryScheduleStatus');
    expect(setup).toContain('今日は投稿予定がないため、LINE配信はありません。');
    expect(setup).toContain('次回は${nextDeliveryLabel}の予定です。');
  });

  it('blocks false completion until the dedicated service LINE is connected', () => {
    expect(page).toContain('serviceLineRequired={Boolean(dedicatedLine)}');
    expect(page).toContain('serviceLineConnected={Boolean(dedicatedLineConnection)}');
    expect(page).toContain('serviceName={service.configuration.displayName}');
    expect(setup).toContain('serviceLineRequired && !serviceLineConnected');
    expect(setup).toContain('LINEとの接続を確認する');
    expect(setup).toContain('会員登録や投稿設定をやり直す必要はありません。');
    expect(setup).toContain('投稿の設定は保存されています。');
  });
});
