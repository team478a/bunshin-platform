import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { supportFixture } from './activity-support-fixture';
test('answers, accepts, opens a manual action and saves the decline reason', async ({
  app,
  screen,
  browser,
}) => {
  const commands: Record<string, unknown>[] = [];
  const exposure: string[] = [];
  await browser.route('**/api/synthetic/activity-support**', async (route) => {
    if (route.request.url.endsWith('/exposure')) {
      exposure.push((JSON.parse(route.request.postData ?? '{}') as { kind: string }).kind);
      await route.fulfill({ json: { data: { recorded: true } } });
      return;
    }
    const command = JSON.parse(route.request.postData ?? '{}') as Record<string, unknown>;
    commands.push(command);
    const status = command['action'] === 'ACCEPT' ? 'ACCEPTED' : 'SKIPPED';
    await route.fulfill({
      body: JSON.stringify(
        route.request.method === 'POST'
          ? { data: { supportProgress: { ...supportFixture } } }
          : { data: { ...supportFixture, status } },
      ),
      headers: { 'content-type': 'application/json' },
    });
  });
  await app.open('/?activity-support');
  await screen.getByRole('radio', '投稿する時間がない').tap();
  await screen.getByRole('button', '回答してサポートを見る').tap();
  await expect(screen.getByRole('heading', '5分で終わる内容にする')).toBeVisible();
  await screen.getByText('サポートの詳しい進め方', { exact: true }).tap();
  await expect(screen.getByRole('link', '投稿の準備を進める')).toHaveCount(0);
  await screen.getByRole('button', 'このサポートを始める').tap();
  await screen.getByRole('link', '投稿の準備を進める').tap();
  expect(await browser.evaluate(() => location.hash)).toBe('#today-post');
  expect(
    await browser.evaluate(
      () =>
        document
          .querySelector<HTMLInputElement>('.activity-barrier-support__reason input')!
          .getBoundingClientRect().width >= 200,
    ),
  ).toBe(true);
  await app.screenshot('activity-support-mobile');
  await screen.getByRole('textbox', '見送る理由（任意）').fill('投稿はすでに済んでいます');
  await screen.getByRole('button', '今回は見送る').tap();
  await expect(screen.getByText('今回は見送りました。')).toBeVisible();
  expect(exposure.filter((kind) => kind === 'DISPLAY')).toHaveLength(1);
  expect(exposure.filter((kind) => kind === 'DETAILS')).toHaveLength(1);
  expect(commands[2]?.['reason']).toBe('投稿はすでに済んでいます');
  expect(commands.map((command) => command['action'] ?? 'ANSWER')).toEqual([
    'ANSWER',
    'ACCEPT',
    'SKIP',
  ]);
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
});
test('an existing support takes precedence over another pending question', async ({
  app,
  screen,
}) => {
  await app.open('/?activity-support&offered');
  await expect(screen.getByRole('heading', '5分で終わる内容にする')).toBeVisible();
  await expect(screen.getByRole('radio', '投稿する時間がない')).toHaveCount(0);
});
test('malformed success never starts guidance', async ({ app, screen, browser }) => {
  await browser.route('**/api/synthetic/activity-support', async (route) => {
    await route.fulfill({ status: 200, json: { data: {} } });
  });
  await app.open('/?activity-support&offered');
  await screen.getByRole('button', 'このサポートを始める').tap();
  await expect(
    screen.getByText('保存した状態を確認できません。画面を更新してください。'),
  ).toBeVisible();
  await expect(screen.getByRole('link', '投稿の準備を進める')).toHaveCount(0);
  await expect(screen.getByRole('button', 'このサポートを始める')).toBeVisible();
});

test('closed drawer is not counted; opening and reopening records first exposure only', async ({
  app,
  screen,
  browser,
}) => {
  const events: string[] = [];
  await browser.route('**/api/synthetic/activity-support/exposure', async (route) => {
    events.push((JSON.parse(route.request.postData ?? '{}') as { kind: string }).kind);
    await route.fulfill({ json: { data: { recorded: true } } });
  });
  await app.open('/?activity-support&offered&hidden');
  await expect(screen.getByRole('heading', '5分で終わる内容にする')).not.toBeVisible();
  expect(events).toEqual([]);
  await screen.getByText('サポートを開く', { exact: true }).tap();
  await expect(screen.getByRole('heading', '5分で終わる内容にする')).toBeVisible();
  await screen.getByText('サポートの詳しい進め方', { exact: true }).tap();
  await expect(screen.getByText('作業を小さく分けます。')).toBeVisible();
  await screen.getByText('サポートの詳しい進め方', { exact: true }).tap();
  await screen.getByText('サポートの詳しい進め方', { exact: true }).tap();
  expect(events.filter((kind) => kind === 'DISPLAY')).toHaveLength(1);
  expect(events.filter((kind) => kind === 'DETAILS')).toHaveLength(1);
});

test('exposure API failure does not prevent accepting support', async ({
  app,
  screen,
  browser,
}) => {
  await browser.route('**/api/synthetic/activity-support**', async (route) => {
    if (route.request.url.endsWith('/exposure'))
      await route.fulfill({ status: 500, json: { error: {} } });
    else await route.fulfill({ json: { data: { ...supportFixture, status: 'ACCEPTED' } } });
  });
  await app.open('/?activity-support&offered');
  await screen.getByRole('button', 'このサポートを始める').tap();
  await expect(screen.getByRole('link', '投稿の準備を進める')).toBeVisible();
});
