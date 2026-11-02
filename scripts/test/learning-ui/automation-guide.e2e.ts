import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('mobile guide opens on request and copies only the static planning template without API calls', async ({
  app,
  screen,
  browser,
}) => {
  let calls = 0;
  await browser.route('**/api/**', async (route) => {
    calls++;
    await route.fulfill({ status: 500 });
  });
  await app.open('/?automation-guide');
  await browser.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          document.documentElement.dataset['copiedPrompt'] = text;
          return Promise.resolve();
        },
      },
    });
  });
  await screen.getByText('ハッシーだけで投稿を準備する', { exact: true }).tap();
  await expect(
    screen.getByText('時間がない日は、確認や下書きの準備までで大丈夫です。'),
  ).toBeVisible();
  await screen.getByText('相談用の指示文をコピーする', { exact: true }).tap();
  await screen.getByRole('button', '相談用の指示文をコピー').tap();
  await expect(screen.getByRole('status')).toContainText('指示文をコピーしました');
  const copied = await browser.evaluate(() => document.documentElement.dataset['copiedPrompt']);
  expect(copied).toContain('投稿先：[自分で入力]');
  expect(copied).toContain('提案だけにしてください');
  expect(calls).toBe(0);
  expect(
    await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await app.screenshot('automation-guide-mobile');
});

test('clipboard denial keeps a selectable template and Zapier actions are described without connecting', async ({
  app,
  screen,
  browser,
}) => {
  await app.open('/?automation-guide');
  await browser.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('denied')) },
    });
  });
  await screen.getByText('相談用の指示文をコピーする', { exact: true }).tap();
  await screen.getByRole('button', '相談用の指示文をコピー').tap();
  await expect(screen.getByRole('status')).toContainText('入力欄の文章を選択してコピー');
  await expect(screen.getByRole('textbox', '自動化の相談用指示文')).toBeVisible();
  await screen.getByText('Zapierで省力化を考える', { exact: true }).tap();
  await expect(screen.getByRole('link', 'Zapier公式：テスト時の動作（外部サイト）')).toBeVisible();
  expect(await browser.evaluate(() => document.querySelectorAll('form,iframe').length)).toBe(0);
});
