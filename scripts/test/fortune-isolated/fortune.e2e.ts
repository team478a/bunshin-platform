import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const stage = process.env['BUNSHIN_FORTUNE_TEST_STAGE'];
const deepStage = stage === 'deep';
const appearanceEditor = stage === 'appearance-editor';
const appearanceViewer = stage === 'appearance-viewer';
const invitationPath = process.env['BUNSHIN_FORTUNE_TEST_INVITATION'];
test(
  appearanceEditor
    ? 'an owner previews and saves the service theme on mobile'
    : appearanceViewer
      ? 'a saved theme reaches mobile participants across the Fortune pages'
      : deepStage
        ? 'a returning participant can check saved context and receive a deep reading on mobile'
        : invitationPath
          ? 'an invited visitor can accept the invitation and reach the mobile age gate'
          : 'a verified participant can join, skip intake and draw a standard reading on mobile',
  async ({ app, browser, screen }) => {
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
    const entry = invitationPath || `/s/${slug}/${appearanceEditor ? 'manage/fortune' : 'today'}`;
    if (invitationPath && !invitationPath.startsWith(`/s/${slug}/join/`)) {
      throw new Error('An invitation scoped to the disposable service is required');
    }
    await app.open(entry);
    await expect(screen.getByRole('heading', { name: /ログイン/ })).toBeVisible();
    await browser.setCookies(
      cookies.map(({ name, value }) => ({ name, value, url, httpOnly: true })),
    );
    await app.open(entry);
    if (appearanceEditor) {
      await screen.getByText('利用者画面のデザイン', { exact: true }).tap();
      await screen.getByLabel('基本の配色').selectOption({ value: 'night' });
      await screen.getByLabel('カードの角丸').selectOption({ value: 'square' });
      await screen.getByLabel('スマートフォンプレビューの場面').selectOption({ value: 'deep' });
      await expect(screen.getByRole('heading', '深層パーソナル鑑定')).toBeVisible();
      await expect(
        browser.locator('.fortune-appearance-preview [data-corners="square"]'),
      ).toBeVisible();
      await screen.getByLabel('保存後に占い画面へ適用する').tap();
      const saved = browser.waitForResponse(`**/api/services/${slug}/fortune-operations`);
      await screen.getByRole('button', 'デザインを保存').tap();
      expect((await saved).status).toBe(200);
      await expect(screen.getByText('占いのデザインを保存しました。')).toBeVisible();
      return;
    }
    if (appearanceViewer) {
      const appearance = browser.locator('.fortune-appearance[data-corners="square"]');
      await expect(appearance).toBeVisible();
      const layout = await browser.evaluate(() => {
        const region = document.querySelector('.fortune-appearance');
        return {
          viewport: window.innerWidth,
          content: document.documentElement.scrollWidth,
          background: region ? getComputedStyle(region).backgroundColor : null,
        };
      });
      expect(layout.viewport).toBe(390);
      expect(layout.content).toBeLessThanOrEqual(layout.viewport);
      expect(layout.background).toBe('rgb(23, 22, 43)');
      await app.screenshot('fortune-night-390px');
      await app.open(`/s/${slug}/history`);
      await expect(appearance).toBeVisible();
      await app.open(`/s/${slug}/settings`);
      await expect(appearance).toBeVisible();
      return;
    }
    if (invitationPath) {
      await screen.getByLabel(/サービスへの参加に同意します/).tap();
      await screen.getByRole('button', '同意して参加する').tap();
      await expect(screen.getByRole('heading', '利用規約などの確認')).toBeVisible({
        timeout: 45_000,
      });
      await screen.getByLabel('合成利用規約に同意します').tap();
      await screen.getByLabel('合成プライバシーポリシーに同意します').tap();
      await screen.getByRole('button', '現在の文書へ同意する').tap();
      await expect(screen.getByText('現在有効な文書への同意は完了しています。')).toBeVisible({
        timeout: 30_000,
      });
      await screen.getByRole('link', 'サービスのホームに戻る').tap();
      await expect(screen.getByRole('heading', '最初に年齢を確認します')).toBeVisible({
        timeout: 45_000,
      });
      return;
    }
    if (deepStage) {
      await screen.getByRole('button', 'AIと相談を整理してから占う').tap();
      await screen.getByRole('button', /仕事や今後の動き/).tap();
      await screen.getByText('前に保存した相談内容', { exact: true }).tap();
      await expect(screen.getByText(/以前は家族との時間を重視していた/)).toBeVisible();
      await screen.getByLabel('今回の相談（任意）').fill('今は働き方を整理したい');
      await screen.getByRole('button', 'AIに相談してみる').tap();
      await screen.getByRole('button', '質問をスキップする').tap();
      await expect(screen.getByText('ここまでの内容で占えます。')).toBeVisible();
      await screen.getByRole('button', 'ここまでで占う').tap();
      await screen.getByRole('button', 'この内容で占う').tap();
      await expect(screen.getByRole('heading', '考えられる選択肢')).toBeVisible({
        timeout: 30_000,
      });
      await expect(screen.getByText('今は働き方を整理したい', { exact: true })).toBeVisible();
      return;
    }
    const join = screen.getByRole('button', '確認して始める');
    await expect(join).toBeDisabled();
    await screen.getByLabel('私は18歳以上です').tap();
    await join.tap();
    const saved = browser.waitForResponse(`**/api/services/${slug}/fortune/profile`);
    await screen.getByRole('button', 'スキップ').tap();
    expect((await saved).status).toBe(200);
    await expect(screen.getByRole('heading', 'あなたに合う占いにする')).toBeHidden();
    await screen.getByRole('button', /仕事や今後の動き/).tap();
    await expect(screen.getByRole('heading', '今日の提案')).toBeVisible({ timeout: 30_000 });
    await expect(screen.getByText(/最初の10分で行うこと/)).toBeVisible();
    await app.open(`/s/${slug}/today`);
    await expect(screen.getByRole('heading', '今日の提案')).toBeVisible({ timeout: 30_000 });
    await expect(screen.getByRole('heading', '何について占いますか？')).toHaveCount(0);
  },
);
