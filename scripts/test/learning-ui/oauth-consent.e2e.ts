import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
for (const decision of ['approve', 'deny'] as const) {
  test(`mobile OAuth consent submits only the explicit ${decision} choice`, async ({
    app,
    browser,
    screen,
  }) => {
    const submissions: string[] = [];
    await browser.route('**/api/oauth/decision', async (route) => {
      submissions.push(route.request.postData ?? '');
      await route.fulfill({
        body: '<html lang="ja"><body><p role="status">接続元へ戻りました</p></body></html>',
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    });
    await app.open('/?oauth-consent');
    await expect(screen.getByRole('heading', 'テスト用アプリとの接続')).toBeVisible();
    await expect(screen.getByText('メールアドレス', { exact: true })).toBeVisible();
    expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (decision === 'approve') await app.screenshot('oauth-consent-mobile');
    await screen
      .getByRole('button', decision === 'approve' ? '許可する' : '許可しない', { exact: true })
      .tap();
    await expect(screen.getByRole('status')).toContainText('接続元へ戻りました');
    expect(submissions).toHaveLength(1);
    const submitted = new URLSearchParams(submissions[0]);
    expect(submitted.get('decision')).toBe(decision);
    expect(submitted.get('authorization_id')).toBe('synthetic-authorization');
    expect([...submitted.keys()].sort()).toEqual(['authorization_id', 'decision']);
  });
}
