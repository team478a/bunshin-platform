import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const stage = process.env['BUNSHIN_FORTUNE_TEST_STAGE'];
const deepStage = stage === 'deep';
const referral = stage === 'referral';
const referralAdmin = stage === 'referral-admin';
const appearanceEditor = stage === 'appearance-editor';
const creditEditor = stage === 'credit-editor';
const creditExchange = stage === 'credit-exchange';
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
          : referral
            ? 'a Fortune member can share and view their referral history on mobile'
            : referralAdmin
              ? 'a Fortune operator sees qualified referrals and settings on mobile'
              : creditEditor
                ? 'an operator can save exchange settings on mobile'
                : creditExchange
                  ? 'a referred member exchanges credit for a follow-up and sees their ledger on mobile'
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
    const entry =
      invitationPath ||
      `/s/${slug}/${appearanceEditor || creditEditor ? 'manage/fortune' : referralAdmin ? 'manage/referrals' : referral ? 'home' : 'today'}`;
    if (invitationPath && !invitationPath.startsWith(`/s/${slug}/join/`)) {
      throw new Error('An invitation scoped to the disposable service is required');
    }
    await app.open(entry);
    await expect(screen.getByRole('heading', { name: /ログイン/ })).toBeVisible();
    await browser.setCookies(
      cookies.map(({ name, value }) => ({ name, value, url, httpOnly: true })),
    );
    await app.open(entry);
    if (creditEditor) {
      await screen.getByLabel('利用者に表示する名称').fill('星の特典');
      await screen.getByLabel('追加質問1回に必要なクレジット数').fill('2');
      await screen.getByLabel('クレジット交換を受け付ける').tap();
      await screen.getByRole('button', '交換設定を保存する').tap();
      await expect(screen.getByText('交換設定を保存しました。')).toBeVisible({ timeout: 45_000 });
      return;
    }
    if (creditExchange) {
      await expect(
        screen.getByText('追加質問1回に星の特典を2使います。', { exact: false }),
      ).toBeVisible({ timeout: 45_000 });
      await screen.getByLabel('AIへの質問').fill('追加質問の交換を確認したい');
      await screen.getByRole('button', '2クレジットで質問する').tap();
      await expect(
        screen.getByText('考えを一つに絞ると、次の一歩を決めやすくなります。'),
      ).toBeVisible({ timeout: 45_000 });
      await screen.getByRole('link', '残高・履歴と利用条件を見る').tap();
      await browser.waitForURL(`${url}/s/${slug}/credits`, { timeout: 45_000 });
      await expect(screen.getByRole('heading', '星の特典')).toBeVisible();
      await expect(screen.getByRole('heading', '追加質問に使いました')).toBeVisible();
      await expect(screen.getByRole('heading', '紹介特典')).toBeVisible();
      return;
    }
    if (referralAdmin) {
      await expect(screen.getByRole('heading', '紹介の審査・確定')).toBeVisible();
      await expect(screen.getByRole('heading', '紹介実績')).toBeVisible();
      await expect(screen.getByText('初回の無料鑑定を読む')).toBeVisible();
      await expect(screen.getByText('確定済み', { exact: false })).toBeVisible();
      await expect(screen.getByText('本人による初回投稿案作成')).toHaveCount(0);
      return;
    }
    if (referral) {
      await screen.getByRole('link', '友だちに紹介する').tap();
      await browser.waitForURL(`${url}/s/${slug}/activity`, { timeout: 45_000 });
      await expect(screen.getByRole('heading', '友だちに紹介する')).toBeVisible();
      await expect(screen.getByText('紹介経由で登録しました')).toBeVisible();
      const stats = browser.locator('[aria-label="紹介の状況"]');
      await expect(stats.getByText('1回', { exact: true })).toBeVisible();
      await expect(stats.getByText('1人', { exact: true })).toBeVisible();
      await expect(stats.getByText('0人', { exact: true })).toBeVisible();
      await expect(screen.getByRole('link', 'LINEで送る')).toBeVisible();
      await expect(browser.locator('a[href^="https://line.me/R/share?text="]')).toBeVisible();
      await screen.getByText('QRコードを表示').tap();
      await expect(screen.getByRole('img', '紹介URLのQRコード')).toBeVisible();
      // SNS copy generation requires HTTPS and is covered by service-referral-content.test.ts.
      await expect(screen.getByRole('button', '紹介用の投稿文を作る')).toBeVisible();
      await expect(screen.getByText('最初の投稿まで進んだ人数')).toHaveCount(0);
      await expect(screen.getByRole('heading', '画像作成回数')).toHaveCount(0);
      await expect(screen.getByRole('heading', 'ポイント・バッジ')).toHaveCount(0);
      const width = await browser.evaluate(() => ({
        viewport: innerWidth,
        page: document.documentElement.scrollWidth,
      }));
      expect(width).toEqual({ viewport: 390, page: 390 });
      return;
    }
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
    const reveal = screen.getByRole('button', '今日の一枚をめくる');
    await expect(reveal).toBeDisabled();
    await screen.getByRole('button', /仕事や今後の動き/).tap();
    await expect(reveal).toBeEnabled();
    await reveal.tap();
    await expect(screen.getByRole('heading', '今日の一歩')).toBeVisible({ timeout: 30_000 });
    await expect(screen.getByRole('heading', 'カードの象徴')).toBeVisible();
    await expect(screen.getByText(/最初の10分で行うこと/)).toBeVisible();
    const artwork = browser.locator('.fortune-daily-result__hero img');
    await expect(artwork).toBeVisible();
    const imageSrc = await artwork.getAttribute('src');
    expect(imageSrc).toMatch(/^\/fortune\/tarot\/.+\.webp$/);
    await expect(screen.getByRole('button', '参考になった')).toBeHidden();
    await screen.getByText('この鑑定を評価する', { exact: true }).tap();
    await expect(screen.getByRole('button', '参考になった')).toBeVisible();
    await app.open(`/s/${slug}/today`);
    await expect(screen.getByRole('heading', '今日の一歩')).toBeVisible({ timeout: 30_000 });
    expect(await artwork.getAttribute('src')).toBe(imageSrc);
    await expect(reveal).toHaveCount(0);
    await expect(screen.getByRole('heading', '何について占いますか？')).toHaveCount(0);
  },
);
