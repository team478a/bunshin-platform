import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const stage = process.env['BUNSHIN_FORTUNE_TEST_STAGE'];
const basicStage = stage === 'basic';
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
    let allowDraw = () => {};
    let networkInterrupted = false;
    const drawGate = new Promise<void>((resolve) => {
      allowDraw = resolve;
    });
    await browser.route('**/*', async (route) => {
      const target = new URL(route.request.url);
      if (target.origin !== url) return route.abort();
      if (
        (basicStage || deepStage) &&
        route.request.method === 'POST' &&
        target.pathname === `/api/services/${slug}/fortune/today`
      ) {
        if (basicStage && !networkInterrupted) {
          networkInterrupted = true;
          return route.abort();
        }
        await drawGate;
      }
      await route.continue();
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
      await screen.getByLabel('占いの演出').selectOption({ value: 'standard' });
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
      await screen.getByText('カードの管理', { exact: true }).tap();
      await expect(browser.locator('.fortune-deck-preview .fortune-tarot-art')).toHaveCount(3);
      await expect(browser.locator('.fortune-deck-preview .fortune-tarot-back')).toBeVisible();
      expect(await browser.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
      await browser.evaluate(() => {
        document.querySelector('.fortune-deck-preview')?.scrollIntoView({ block: 'center' });
      });
      await app.screenshot('fortune-deck-preview-390px');
      const imageUrl = screen.getByLabel('絵柄の公開HTTPS画像URL');
      await imageUrl.fill('https://example.invalid/cards/moon-preview.webp');
      const savedCard = browser.waitForResponse(`**/api/services/${slug}/fortune-operations`);
      await screen.getByRole('button', 'カード画像を保存').tap();
      expect((await savedCard).status).toBe(200);
      await expect(screen.getByText('カードを保存しました。')).toBeVisible();
      await screen.getByLabel('編集するカード').selectOption({ value: 'new' });
      await expect(screen.getByLabel('カード名')).toBeVisible();
      await expect(screen.getByLabel('抽選対象にする')).toBeVisible();
      return;
    }
    if (appearanceViewer) {
      const appearance = browser.locator('.fortune-appearance[data-corners="square"]');
      await expect(appearance).toBeVisible();
      await expect(browser.locator('.fortune-oracle-book')).toHaveCount(0);
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
      await expect(screen.getByText('ステラ', { exact: true })).toBeVisible();
      await screen.getByRole('button', /仕事や今後の動き/).tap();
      await screen.getByText('前に保存した相談内容', { exact: true }).tap();
      await expect(screen.getByText(/以前は家族との時間を重視していた/)).toBeVisible();
      await screen.getByLabel('今回の相談（任意）').fill('今は働き方を整理したい');
      await screen.getByRole('button', 'AIに相談してみる').tap();
      await screen.getByRole('button', '質問をスキップする').tap();
      await expect(screen.getByText('ここまでの内容で占えます。')).toBeVisible();
      await screen.getByRole('button', 'ここまでで占う').tap();
      await expect(screen.getByText('ステラ', { exact: true })).toBeVisible();
      await browser.evaluate(() => {
        const metrics = document.documentElement.dataset;
        let summonedAt: number | undefined;
        const observer = new MutationObserver(() => {
          const phase = document.querySelector('.fortune-summoning')?.getAttribute('data-phase');
          if (phase === 'pending') summonedAt ??= performance.now();
          if (phase === 'reveal' && summonedAt !== undefined) {
            metrics.summoningBackMs = String(performance.now() - summonedAt);
            observer.disconnect();
          }
        });
        observer.observe(document.body, { subtree: true, childList: true, attributes: true });
        document.addEventListener('animationend', (event) => {
          if (event.animationName === 'fortune-summoning-cinematic-flip') {
            metrics.summoningFlipMs = String(event.elapsedTime * 1000);
          }
        });
      });
      try {
        await screen.getByRole('button', 'この内容で占う').tap();
        const skip = screen.getByRole('button', '演出をスキップ');
        await expect(skip).toBeVisible();
        await expect(
          browser.locator('.fortune-summoning').getByText('セレーネ', { exact: true }),
        ).toBeVisible();
        const clearOfNav = await browser.evaluate(() => {
          const button = document.querySelector('.fortune-summoning button');
          const nav = document.querySelector('.fortune-nav');
          return Boolean(
            button &&
            nav &&
            button.getBoundingClientRect().bottom <= nav.getBoundingClientRect().top,
          );
        });
        expect(clearOfNav).toBe(true);
        await expect(browser.locator('.fortune-tarot-back__crest')).toBeVisible();
        await app.screenshot('fortune-cinematic-card-back-390px');
      } finally {
        allowDraw();
      }
      const reveal = browser.locator('.fortune-summoning[data-phase="reveal"]');
      await expect(reveal.getByText('一枚のカードがひらきます')).toBeVisible({ timeout: 75_000 });
      const moonGate = browser.locator('.fortune-moon-stage[data-scene="gate"]');
      await expect(moonGate).toBeVisible({ timeout: 75_000 });
      const pacing = await browser.evaluate(() => ({
        backMs: Number(document.documentElement.dataset.summoningBackMs),
        flipMs: Number(document.documentElement.dataset.summoningFlipMs),
      }));
      expect(pacing.backMs).toBeGreaterThanOrEqual(900);
      expect(pacing.flipMs).toBe(2200);
      await app.screenshot('fortune-moon-gate-390px');
      const entrance = browser.locator('.fortune-moon-stage[data-scene="entrance"]');
      await expect(entrance).toBeVisible();
      await expect(entrance.getByText('セレーネ', { exact: true })).toBeVisible();
      await app.screenshot('fortune-selene-fallback-390px');
      await expect(browser.locator('.fortune-oracle-opening')).toBeVisible();
      await expect(screen.getByRole('heading', '考えられる選択肢')).toBeVisible({
        timeout: 75_000,
      });
      const book = browser.locator('article.fortune-oracle-book');
      await expect(book).toBeVisible();
      await expect(book.getByText('セレーネ', { exact: true })).toBeVisible();
      await expect(screen.getByText('今は働き方を整理したい', { exact: true })).toBeVisible();
      await expect(screen.getByRole('heading', 'この鑑定についてAIに聞く')).toBeVisible();
      await screen.getByText('次回の振り返りを見る', { exact: true }).tap();
      await expect(screen.getByText('書き出してみて、気持ちに変化はありましたか？')).toBeVisible();
      const layout = await browser.evaluate(() => {
        const book = document.querySelector('.fortune-oracle-book');
        const reading = book?.querySelector('.fortune-reading-body');
        const select = window.getSelection();
        if (reading) select?.selectAllChildren(reading);
        const selected = select?.toString();
        select?.removeAllRanges();
        book?.scrollIntoView({ block: 'start', behavior: 'instant' });
        return { selected, width: document.documentElement.scrollWidth };
      });
      expect(layout.selected).toContain('今は働き方を整理したい');
      expect(layout.width).toBeLessThanOrEqual(390);
      await app.screenshot('fortune-oracle-book-390px');
      await app.open(`/s/${slug}/today`);
      await expect(screen.getByRole('heading', '考えられる選択肢')).toBeVisible({
        timeout: 30_000,
      });
      await expect(browser.locator('.fortune-moon-stage')).toHaveCount(0);
      await expect(browser.locator('.fortune-oracle-opening')).toHaveCount(0);
      await app.open(`/s/${slug}/history`);
      await expect(book).toHaveCount(0);
      const readingPath = await browser.evaluate(() =>
        document.querySelector('.fortune-reading-link')?.getAttribute('href'),
      );
      expect(readingPath).toMatch(/\/readings\//);
      await app.open(readingPath!);
      await expect(book).toBeVisible({ timeout: 45_000 });
      await expect(browser.locator('.fortune-oracle-opening')).toHaveCount(0);
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
    await expect(screen.getByText('ノア', { exact: true })).toBeVisible();
    await browser.evaluate(() => {
      document.addEventListener('animationstart', (event) => {
        if (event.animationName !== 'fortune-summoning-flip') return;
        const scene = document.querySelector('.fortune-summoning');
        const image = scene?.querySelector('img');
        if (image instanceof HTMLImageElement)
          document.documentElement.dataset.summonedCard = image.getAttribute('src') ?? '';
        document.documentElement.dataset.summonedName =
          scene?.querySelector('p')?.textContent ?? '';
      });
    });
    const drawButton = screen.getByRole('button', /仕事や今後の動き/);
    await drawButton.tap();
    await expect(
      screen.getByText('占いに接続できませんでした。もう一度お試しください。'),
    ).toBeVisible();
    await expect(browser.locator('.fortune-summoning')).toHaveCount(0);
    try {
      await drawButton.tap();
      const pending = browser.locator('.fortune-summoning[data-phase="pending"]');
      await expect(pending.getByText('ノア', { exact: true })).toBeVisible();
      await expect(screen.getByRole('button', '演出をスキップ')).toBeVisible();
      await expect(
        browser.locator('.fortune-summoning__orbit, .fortune-summoning__stars'),
      ).toHaveCount(0);
      await app.screenshot('fortune-standard-motion-noah-390px');
    } finally {
      allowDraw();
    }
    await expect(screen.getByRole('heading', '今日の提案')).toBeVisible({ timeout: 75_000 });
    const summoned = await browser.evaluate(() => ({
      card: document.documentElement.dataset.summonedCard,
      name: document.documentElement.dataset.summonedName,
      result: document.querySelector('.fortune-reading-card h2')?.textContent,
      width: document.documentElement.scrollWidth,
    }));
    expect(summoned.card).toMatch(/^\/fortune\/tarot\/.+\.webp$/);
    await expect(browser.locator('.fortune-moon-stage')).toHaveCount(0);
    await expect(browser.locator('.fortune-oracle-book')).toHaveCount(0);
    expect(summoned.name).toBe(summoned.result?.replace(' （', '・').replace('）', ''));
    expect(summoned.width).toBeLessThanOrEqual(390);
    await expect(screen.getByText(/最初の10分で行うこと/)).toBeVisible();
    await app.open(`/s/${slug}/today`);
    await expect(screen.getByRole('heading', '今日の提案')).toBeVisible({ timeout: 30_000 });
    await expect(screen.getByRole('button', '演出をスキップ')).toHaveCount(0);
    await expect(screen.getByRole('heading', '何について占いますか？')).toHaveCount(0);
  },
);
