import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ServiceHomeAccessGuidance } from '../app/s/[serviceSlug]/home/service-home-access-guidance';
import { serviceAuthBrandForSlug } from '../src/services/service-auth-brand';

describe('service home access guidance', () => {
  it('explains why LINE users may need to log in and preserves the home return path', () => {
    const html = renderToStaticMarkup(
      createElement(ServiceHomeAccessGuidance, {
        state: 'LOGIN_REQUIRED',
        serviceName: 'マナベルスタイル',
        serviceLogoUrl: 'https://assets.example/manaberu.png',
        poweredBy: true,
        serviceSlug: 'manaberu-style',
      }),
    );

    expect(html).toContain('マナベルスタイルを利用するにはログインが必要です');
    expect(html).toContain('LINE内のブラウザでは');
    expect(html).toContain('ログインして続ける');
    expect(html).toContain('/login?returnTo=%2Fs%2Fmanaberu-style%2Fhome');
    expect(html).toContain('/s/manaberu-style');
    expect(html).toContain('マナベルスタイルのロゴ');
    expect(html).toContain('ワタシワークスを利用しています');
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

  it('explains that the service management screen requires an operator role', () => {
    const html = renderToStaticMarkup(
      createElement(ServiceHomeAccessGuidance, {
        state: 'MANAGEMENT_REQUIRED',
        serviceName: 'ハッシー',
        serviceSlug: 'hassy',
      }),
    );

    expect(html).toContain('ハッシーの管理画面を利用できません');
    expect(html).toContain('サービス管理者として登録されたアカウント');
    expect(html).toContain('ハッシーの利用画面へ');
    expect(html).toContain('/s/hassy/home');
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

    expect(html).toContain('サービスの利用設定を確認できません');
    expect(html).toContain('ログインは完了しています');
    expect(html).toContain('サービスの利用確認');
    expect(html).not.toContain('LINEからのご利用');
    expect(html).not.toContain('LINEでログインし直す');
    expect(html).not.toContain('/login?returnTo=');
    expect(html).not.toContain('service-auth-brand');
    expect(html).not.toContain('/s/unknown-service');
  });

  it.each([
    ['manaberu-style', 'マナベルスタイル'],
    ['hassy', 'ハッシー'],
    ['sennokuni-media', '千ノ国メディア'],
  ])('shows only the approved %s brand on an unresolved service-link screen', (slug, name) => {
    const brand = serviceAuthBrandForSlug(slug);
    expect(brand).toEqual({ serviceName: name, logoUrl: null, poweredBy: true });

    const html = renderToStaticMarkup(
      createElement(ServiceHomeAccessGuidance, {
        state: 'LINK_UNAVAILABLE',
        serviceSlug: slug,
        brand,
      }),
    );

    expect(html).toContain(`${name}の利用設定を確認できません`);
    expect(html).toContain(name);
    expect(html).toContain('ワタシワークスを利用しています');
    expect(html).toContain('サービスの利用確認');
    expect(html).toContain('メールとLINEのアカウントは別の認証方法です');
    expect(html).not.toContain('LINEでログインし直す');
    expect(html).toContain('サービスの案内を確認する');
    expect(html).toContain(`/s/${slug}`);
  });
});
