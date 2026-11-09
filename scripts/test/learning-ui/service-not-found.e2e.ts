import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('mobile service 404 keeps the matching service recovery paths', async ({
  app,
  browser,
  screen,
}) => {
  await app.open('/?service-not-found');

  await expect(screen.getByRole('heading', 'お探しのページが見つかりません')).toBeVisible();
  await expect(screen.getByRole('link', 'サービスホームへ戻る')).toHaveAttribute(
    'href',
    '/s/manaberu-style/home',
  );
  await expect(screen.getByRole('link', 'このサービスのログイン画面を開く')).toHaveAttribute(
    'href',
    '/login?returnTo=%2Fs%2Fmanaberu-style%2Fhome',
  );
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
});
