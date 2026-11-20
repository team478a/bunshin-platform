import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('a verified participant can join, skip intake and draw a standard reading on mobile', async ({
  app,
  browser,
  screen,
}) => {
  const slug = process.env['BUNSHIN_FORTUNE_TEST_SLUG'];
  if (!slug?.startsWith('isolated-fortune-'))
    throw new Error('Disposable Fortune fixture required');
  const url = 'http://127.0.0.1:19000';
  const cookies = JSON.parse(process.env['BUNSHIN_FORTUNE_TEST_SESSION'] ?? '[]') as Array<{
    name: string;
    value: string;
  }>;
  if (!cookies.length) throw new Error('Real local Auth session required');
  await browser.route('**/*', async (route) => {
    if (new URL(route.request.url).origin === url) await route.continue();
    else await route.abort();
  });
  await app.open(`/s/${slug}/today`);
  await expect(screen.getByRole('heading', { name: /ログイン/ })).toBeVisible();
  await browser.setCookies(
    cookies.map(({ name, value }) => ({ name, value, url, httpOnly: true })),
  );
  await app.open(`/s/${slug}/today`);
  const join = screen.getByRole('button', '確認して始める');
  await expect(join).toBeDisabled();
  await screen.getByLabel('私は18歳以上です').tap();
  await join.tap();
  const saved = browser.waitForResponse(`**/api/services/${slug}/fortune/profile`);
  await screen.getByRole('button', 'スキップ').tap();
  expect((await saved).status).toBe(200);
  await expect(screen.getByRole('heading', 'あなたに合う占いにする')).toBeHidden();
  await screen.getByRole('button', /仕事や今後の動き/).tap();
  await expect(screen.getByRole('heading', '今日の提案')).toBeVisible();
  await expect(screen.getByText(/最初の10分で行うこと/)).toBeVisible();
  await app.open(`/s/${slug}/today`);
  await expect(screen.getByRole('heading', '今日の提案')).toBeVisible();
  await expect(screen.getByRole('heading', '何について占いますか？')).toHaveCount(0);
});
