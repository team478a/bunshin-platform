import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ServiceHomeAccessGuidance } from '../app/s/[serviceSlug]/home/service-home-access-guidance';

describe('service home access guidance', () => {
  it('explains why LINE users may need to log in and preserves the home return path', () => {
    const html = renderToStaticMarkup(
      createElement(ServiceHomeAccessGuidance, {
        state: 'LOGIN_REQUIRED',
        serviceName: 'マナベルスタイル',
        serviceSlug: 'manaberu-style',
      }),
    );

    expect(html).toContain('LINE内のブラウザでは');
    expect(html).toContain('ログインして続ける');
    expect(html).toContain('/login?returnTo=%2Fs%2Fmanaberu-style%2Fhome');
    expect(html).toContain('/s/manaberu-style');
  });

  it('guides a signed-in user whose service participation is not confirmed', () => {
    const html = renderToStaticMarkup(
      createElement(ServiceHomeAccessGuidance, {
        state: 'MEMBERSHIP_REQUIRED',
        serviceName: 'マナベルスタイル',
        serviceSlug: 'manaberu-style',
      }),
    );

    expect(html).toContain('マナベルスタイルへの参加登録を確認できません');
    expect(html).toContain('参加案内を確認する');
  });

  it('keeps a login action available without exposing a private service entry', () => {
    const html = renderToStaticMarkup(
      createElement(ServiceHomeAccessGuidance, {
        state: 'LOGIN_REQUIRED',
        serviceSlug: 'private-service',
      }),
    );

    expect(html).toContain('ログインして続ける');
    expect(html).not.toContain('/s/private-service');
  });

  it('does not disclose a service name or entry link when the service cannot be resolved', () => {
    const html = renderToStaticMarkup(
      createElement(ServiceHomeAccessGuidance, {
        state: 'LINK_UNAVAILABLE',
        serviceSlug: 'unknown-service',
      }),
    );

    expect(html).toContain('サービスの利用状態を確認できません');
    expect(html).not.toContain('/s/unknown-service');
  });
});
