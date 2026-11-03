import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InstagramConnectionCard } from '../app/s/[serviceSlug]/bunshins/[bunshinId]/connections/instagram-card';

describe('Instagram connection card', () => {
  it('keeps SNS credentials separate from external read grants and renders no token material', () => {
    const html = renderToStaticMarkup(
      <InstagramConnectionCard
        serviceSlug="official-service"
        bunshinId="11111111-1111-4111-8111-111111111111"
        result="connected"
        connections={[
          {
            id: '22222222-2222-4222-8222-222222222222',
            displayName: 'official.account',
            status: 'CONNECTED',
            tokenExpiresAt: new Date('2027-01-01T00:00:00Z'),
          },
        ]}
      />,
    );
    expect(html).toContain('Instagram公式API接続');
    expect(html).toContain('外部AIへの読取許可や発信設定とは分けて管理');
    expect(html).toContain('@official.account');
    expect(html).not.toMatch(/access[_-]?token|encrypted[_-]?token|PRIVATE_TOKEN/i);
  });

  it('shows reconnect and access-revocation states without exposing an action when forbidden', () => {
    const reconnect = renderToStaticMarkup(
      <InstagramConnectionCard
        serviceSlug="official-service"
        bunshinId="11111111-1111-4111-8111-111111111111"
        connections={[
          {
            id: '22222222-2222-4222-8222-222222222222',
            displayName: 'official.account',
            status: 'RECONNECT_REQUIRED',
            tokenExpiresAt: null,
          },
        ]}
      />,
    );
    expect(reconnect).toContain('再接続が必要');
    expect(reconnect).toContain('再接続');
    const forbidden = renderToStaticMarkup(
      <InstagramConnectionCard
        serviceSlug="official-service"
        bunshinId="11111111-1111-4111-8111-111111111111"
        connections={null}
      />,
    );
    expect(forbidden).toContain('SOCIAL権限ではInstagram接続を利用できません');
    expect(forbidden).not.toContain('<form');
  });
});
