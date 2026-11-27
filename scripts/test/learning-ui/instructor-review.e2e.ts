import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('checks the price and exact excerpt on a phone without changing the practice draft', async ({
  app,
  screen,
}) => {
  await app.open('/instructor-review.html');
  await expect(screen.getByRole('button', 'フィードバックを見る')).toBeVisible();
  await screen.getByRole('button', '講師に相談する（有料）').tap();
  await expect(screen.getByText('税込総額')).toBeVisible();
  await expect(screen.getByText(/1,500/)).toBeVisible();
  await expect(screen.getByText(/48 時間以内/)).toBeVisible();
  await screen.getByLabel('どこを見てほしいですか？').fill('改善点が明確か');
  await screen.getByLabel('講師に共有する下書き・抜粋').fill('共有してよい部分のみ');
  await screen.getByRole('button', '申込内容を確認する').tap();
  await expect(screen.getByText('共有してよい部分のみ')).toBeVisible();
  await screen.getByRole('button', '課題に戻る').tap();
  await expect(screen.getByLabel('下書き')).toHaveValue('週報の最初の下書き');
});

test('submits only the reviewed excerpt on a desktop viewport', async ({
  app,
  browser,
  screen,
}) => {
  await browser.setViewport({ width: 1280, height: 800 });
  await app.open('/instructor-review.html');
  await screen.getByRole('button', '講師に相談する（有料）').tap();
  await screen.getByLabel('どこを見てほしいですか？').fill('読みやすさ');
  await screen.getByLabel('講師に共有する下書き・抜粋').fill('確認済みの一文');
  await screen.getByRole('button', '申込内容を確認する').tap();
  await screen.getByRole('button', '申し込んで決済へ進む').tap();
  await expect(screen.getByRole('status')).toContainText('確認済みの一文');
});

test('keeps the same real learner-card draft on return from the optional review route', async ({
  app,
  screen,
}) => {
  const practice = '/?simple-start&resume&instructor#practice-evidence';
  await app.open(practice);
  const draft = screen.getByLabel('練習の下書き');
  await draft.fill('この課題の未保存の下書き');
  await expect(screen.getByRole('button', 'フィードバックを見る')).toBeEnabled();
  await screen.getByRole('link', '講師に相談する（有料）').tap();
  await expect(screen.getByRole('heading', { name: '営業週報を書く' })).toBeVisible();
  await app.open(practice);
  await expect(draft).toHaveValue('この課題の未保存の下書き');
});
