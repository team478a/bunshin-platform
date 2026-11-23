import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const stage = process.env['BUNSHIN_FORTUNE_TEST_STAGE'];
const admin = stage === 'profile-admin';
const skip = stage === 'profile-skip';

test(
  admin
    ? 'the operator configures optional profile fields'
    : skip
      ? 'a member skips every profile question and draws a free card'
      : 'a member saves, edits and withdraws their private profile on mobile',
  async ({ app, browser, screen }) => {
    const slug = process.env['BUNSHIN_FORTUNE_TEST_SLUG'];
    const cookies = JSON.parse(process.env['BUNSHIN_FORTUNE_TEST_SESSION'] ?? '[]') as Array<{
      name: string;
      value: string;
    }>;
    if (!slug?.startsWith('isolated-fortune-') || !cookies.length)
      throw new Error('Disposable Fortune session required');
    const url = 'http://127.0.0.1:19000';
    const base = `/s/${slug}`;
    await browser.route('**/*', async (route) =>
      new URL(route.request.url).origin === url ? route.continue() : route.abort(),
    );
    await browser.setCookies(
      cookies.map(({ name, value }) => ({ name, value, url, httpOnly: true })),
    );
    await app.open(`${base}/${admin ? 'manage/fortune' : 'today'}`);
    if (admin) {
      await screen.getByRole('button', '表示・案内役').tap();
      await screen.getByText('ヒアリングとAI案内役の設定', { exact: true }).tap();
      await screen.getByText('基本プロフィール', { exact: true }).tap();
      await screen.getByLabel('基本プロフィールの入力を受け付ける').tap();
      await screen.getByLabel('初回画面の案内文').fill('答えたい項目だけを選べます。');
      await screen
        .getByLabel('個別化同意の説明文')
        .fill('入力は今後の個別化に備え、このサービス内で保管します。');
      await screen.getByRole('button', '案内設定を保存').tap();
      await expect(screen.getByText('鑑定の案内設定を保存しました。')).toBeVisible();
      return;
    }

    const join = screen.getByRole('button', '確認して始める');
    await expect(join).toBeDisabled();
    await expect(screen.getByText('あなたのことを少し教えてください', { exact: true })).toHaveCount(
      0,
    );
    await screen.getByLabel('私は18歳以上です').tap();
    await join.tap();
    const onboarding = screen.getByRole('heading', 'あなたのことを少し教えてください');
    await expect(onboarding).toBeVisible();
    await expect(screen.getByText('答えたい項目だけを選べます。')).toBeVisible();
    await expect(screen.getByText('ステラ', { exact: true })).toBeVisible();
    const nickname = screen.getByLabel('ニックネーム（任意）');
    const birthDate = screen.getByLabel('生年月日（任意）');
    const sex = screen.getByLabel('性別（任意）');
    if (skip) {
      await screen.getByRole('button', 'スキップして占う').tap();
    } else {
      await nickname.fill('月の旅人');
      await birthDate.fill('2020-01-01');
      await sex.selectOption({ value: 'OTHER' });
      await screen.getByLabel('性別の自由記述（任意）').fill('自由記述の確認');
      await screen.getByLabel('この目的で基本プロフィールを保存することに同意します').tap();
      const save = screen.getByRole('button', '保存して次へ');
      await save.tap();
      await expect(screen.getByText(/入力された生年月日では18歳未満/)).toBeVisible();
      await birthDate.fill('1992-02-29');
      expect(await browser.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
      await app.screenshot('basic-profile-390px');
      await save.tap();
    }

    await expect(onboarding).toHaveCount(0);
    await expect(screen.getByRole('heading', '何について占いますか？')).toBeVisible();
    await expect(screen.getByLabel('今日、特に知りたいこと（任意）')).toHaveCount(0);
    const drawn = browser.waitForResponse(`**/api/services/${slug}/fortune/today`);
    await screen.getByRole('button', /仕事や今後の動き/).tap();
    expect((await drawn).status).toBe(201);
    await expect(browser.locator('.fortune-reading-card')).toBeVisible();
    await app.open(`${base}/history`);
    await expect(browser.locator('.fortune-reading-link')).toHaveCount(1);
    if (skip) return;

    await app.open(`${base}/settings`);
    await expect(browser.locator('input[name="nickname"][value="月の旅人"]')).toBeVisible();
    await expect(browser.locator('input[name="birthDate"][value="1992-02-29"]')).toBeVisible();
    await nickname.fill('月');
    await birthDate.fill('');
    await sex.selectOption({ value: '' });
    await screen.getByRole('button', '変更を保存').tap();
    await expect(screen.getByText('基本プロフィールを更新しました。')).toBeVisible();
    await app.open(`${base}/settings`);
    await expect(browser.locator('input[name="nickname"][value="月"]')).toBeVisible();
    await expect(browser.locator('input[name="birthDate"][value=""]')).toBeVisible();
    await screen.getByRole('button', '同意を撤回して基本プロフィールを削除').tap();
    await expect(screen.getByText('同意を撤回し、基本プロフィールを削除しました。')).toBeVisible();
    await expect(browser.locator('input[name="nickname"][value=""]')).toBeVisible();
    await app.open(`${base}/today`);
    await expect(onboarding).toHaveCount(0);
    await expect(browser.locator('.fortune-reading-card')).toBeVisible();
  },
);
