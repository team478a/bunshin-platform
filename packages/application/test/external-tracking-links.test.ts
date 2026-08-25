import { describe, expect, it } from 'vitest';
import {
  externalTrackingScopeKey,
  normalizeTrackingHostname,
  selectExternalTrackingLink,
  validateExternalTrackingUrl,
  type ExternalTrackingLinkCandidate,
  type ExternalTrackingLinkScopeType,
} from '../src';

const at = new Date('2026-08-25T12:00:00.000Z');
const domain = {
  id: 'domain',
  hostname: 'example.jp',
  allowSubdomains: false,
  shortener: false,
  status: 'ACTIVE' as const,
};
const link = (
  scopeType: ExternalTrackingLinkScopeType,
  overrides: Partial<ExternalTrackingLinkCandidate> = {},
): ExternalTrackingLinkCandidate => ({
  id: `link-${scopeType}`,
  name: `${scopeType} link`,
  groupId: 'group-a',
  scopeType,
  groupMembershipId: scopeType.includes('MEMBER') || scopeType === 'MEMBER' ? 'member-a' : null,
  productPackId: scopeType.includes('PRODUCT') || scopeType === 'PRODUCT' ? 'product-a' : null,
  campaignId: scopeType.includes('CAMPAIGN') || scopeType === 'CAMPAIGN' ? 'campaign-a' : null,
  url: `https://example.jp/product?ref=${scopeType}`,
  status: 'ACTIVE',
  startsAt: null,
  expiresAt: null,
  systemStatus: 'ACTIVE',
  domain,
  ...overrides,
});

describe('external tracking link policy', () => {
  it('キャンペーン＋参加者からグループ共通まで指定順で選ぶ', () => {
    const links = [
      link('GROUP'),
      link('PRODUCT'),
      link('CAMPAIGN'),
      link('MEMBER'),
      link('PRODUCT_MEMBER'),
      link('CAMPAIGN_MEMBER'),
    ];
    expect(
      selectExternalTrackingLink({
        groupId: 'group-a',
        groupMembershipId: 'member-a',
        productPackId: 'product-a',
        campaignId: 'campaign-a',
        at,
        links,
      })?.scopeType,
    ).toBe('CAMPAIGN_MEMBER');
  });

  it('別参加者・別グループ・期限切れ・停止中を候補から除外する', () => {
    const selected = selectExternalTrackingLink({
      groupId: 'group-a',
      groupMembershipId: 'member-a',
      productPackId: 'product-a',
      campaignId: 'campaign-a',
      at,
      links: [
        link('CAMPAIGN_MEMBER', { groupMembershipId: 'member-b' }),
        link('PRODUCT_MEMBER', { groupId: 'group-b' }),
        link('MEMBER', { expiresAt: at }),
        link('CAMPAIGN', { status: 'SUSPENDED' }),
        link('PRODUCT'),
      ],
    });
    expect(selected?.scopeType).toBe('PRODUCT');
  });

  it('同じ優先順位が複数あれば推測で選ばない', () => {
    expect(() =>
      selectExternalTrackingLink({
        groupId: 'group-a',
        groupMembershipId: 'member-a',
        productPackId: 'product-a',
        campaignId: null,
        at,
        links: [link('PRODUCT'), link('PRODUCT', { id: 'duplicate' })],
      }),
    ).toThrow(/same priority/);
  });

  it('scopeと参照IDの組合せを固定する', () => {
    expect(externalTrackingScopeKey({ scopeType: 'GROUP' })).toBe('GROUP');
    expect(
      externalTrackingScopeKey({
        scopeType: 'PRODUCT_MEMBER',
        memberIdentityId: 'member',
        productPackId: 'product',
      }),
    ).toBe('PRODUCT_MEMBER:product:member');
    expect(() => externalTrackingScopeKey({ scopeType: 'MEMBER' })).toThrow(/scope/);
  });

  it('HTTPS・許可hostだけを受け付け、認証情報と個人情報parameterを拒否する', () => {
    expect(validateExternalTrackingUrl('https://example.jp/product?ref=ABC', domain)).toBe(
      'https://example.jp/product?ref=ABC',
    );
    expect(() => validateExternalTrackingUrl('http://example.jp/product', domain)).toThrow();
    expect(() =>
      validateExternalTrackingUrl('https://user:pass@example.jp/product', domain),
    ).toThrow();
    expect(() => validateExternalTrackingUrl('https://evil.example/product', domain)).toThrow();
    expect(() =>
      validateExternalTrackingUrl('https://example.jp/?email=a@example.jp', domain),
    ).toThrow(/personal data/);
  });

  it('localhost・IP・不正な許可domainを拒否する', () => {
    expect(() => normalizeTrackingHostname('localhost')).toThrow();
    expect(() => normalizeTrackingHostname('127.0.0.1')).toThrow();
    expect(() => normalizeTrackingHostname('-bad.example')).toThrow();
  });
});
