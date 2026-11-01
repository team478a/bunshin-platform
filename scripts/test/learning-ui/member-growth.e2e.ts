import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { growthBase, growthRoadmap, growthUsage } from './growth-fixture';

test('mobile roadmap loads only on request, reads sequentially and shows one safe next step', async ({
  app,
  screen,
  browser,
}) => {
  const calls: { url: string; method: string }[] = [];
  await browser.route('**/api/services/**', async (route) => {
    calls.push({ url: route.request.url, method: route.request.method });
    await route.fulfill({
      json: {
        data: route.request.url.endsWith('member-roadmap') ? growthRoadmap() : growthUsage(),
      },
    });
  });
  await app.open('/?member-growth');
  await expect(screen.getByRole('button', '成長ロードマップを見る')).toBeVisible();
  expect(calls).toHaveLength(0);
  await screen.getByRole('button', '成長ロードマップを見る').tap();
  await expect(screen.getByRole('heading', '5つのステップ')).toBeVisible();
  expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
    growthBase + '/member-roadmap',
    growthBase + '/member-usage',
  ]);
  expect(calls.every((call) => call.method === 'GET' && !new URL(call.url).search)).toBe(true);
  await expect(screen.getByText('15項目中3項目を達成')).toBeVisible();
  await expect(screen.getByRole('link', '投稿案を確認する')).toHaveCount(1);
  await expect(screen.getByText('有効紹介人数・ロードマップ特典は集計準備中です。')).toBeVisible();
  await expect(screen.getByText('達成状況は未確認です')).toHaveCount(11);
  expect(
    await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  expect(
    await browser.evaluate(() =>
      Array.from(document.querySelectorAll('.member-growth button, .member-growth a')).every(
        (el) => el.getBoundingClientRect().height >= 44,
      ),
    ),
  ).toBe(true);
  await app.screenshot('member-growth-mobile');
  await browser.evaluate(() => {
    document.querySelector('.member-growth__stages')!.scrollIntoView();
    return null;
  });
  await app.screenshot('member-growth-stages-mobile');
  await browser.evaluate(() => {
    document.querySelector('.member-growth__referral')!.scrollIntoView();
    return null;
  });
  await app.screenshot('member-growth-referral-mobile');
  await screen.getByRole('link', '投稿案を確認する').tap();
  expect(await browser.evaluate(() => location.hash)).toBe('#today-post');
});

test('loading blocks duplicate reads and never renders partial progress', async ({
  app,
  screen,
  browser,
}) => {
  let finish: (() => void) | undefined;
  let calls = 0;
  await browser.route('**/api/services/**', async (route) => {
    calls += 1;
    if (route.request.url.endsWith('member-roadmap'))
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    await route.fulfill({
      json: {
        data: route.request.url.endsWith('member-roadmap') ? growthRoadmap() : growthUsage(),
      },
    });
  });
  await app.open('/?member-growth');
  await screen.getByRole('button', '成長ロードマップを見る').tap();
  await expect(screen.getByRole('status')).toContainText('活動と進捗を確認しています');
  await expect(screen.getByRole('button', '進捗を確認中…')).toBeDisabled();
  await browser.evaluate(() => {
    document.querySelector<HTMLButtonElement>('.member-growth button')!.click();
    return null;
  });
  expect(calls).toBe(1);
  await expect(screen.getByRole('heading', '5つのステップ')).toHaveCount(0);
  finish!();
  await expect(screen.getByRole('heading', '5つのステップ')).toBeVisible();
  expect(calls).toBe(2);
});

for (const status of [401, 404, 429, 503]) {
  test(`HTTP ${status} shows a safe message without zero progress or automatic retry`, async ({
    app,
    screen,
    browser,
  }) => {
    let calls = 0;
    await browser.route('**/api/services/**', async (route) => {
      calls += 1;
      await route.fulfill({ status, json: { error: { message: 'secret DB detail' } } });
    });
    await app.open('/?member-growth');
    await screen.getByRole('button', '成長ロードマップを見る').tap();
    await expect(screen.getByRole('alert')).toBeVisible();
    await expect(screen.getByText('secret DB detail')).toHaveCount(0);
    await expect(screen.getByRole('heading', '5つのステップ')).toHaveCount(0);
    expect(calls).toBe(1);
    await expect(screen.getByRole('button', '成長ロードマップを見る')).toBeEnabled();
  });
}

test('a failed refresh clears earlier success and does not retain a stale action', async ({
  app,
  screen,
  browser,
}) => {
  let fail = false;
  await browser.route('**/api/services/**', async (route) => {
    const roadmap = route.request.url.endsWith('member-roadmap');
    if (fail && !roadmap) await route.fulfill({ status: 503, json: {} });
    else await route.fulfill({ json: { data: roadmap ? growthRoadmap() : growthUsage() } });
  });
  await app.open('/?member-growth');
  await screen.getByRole('button', '成長ロードマップを見る').tap();
  await expect(screen.getByRole('link', '投稿案を確認する')).toBeVisible();
  fail = true;
  await screen.getByRole('button', '最新の進捗を確認').tap();
  await expect(screen.getByRole('alert')).toBeVisible();
  await expect(screen.getByRole('link', '投稿案を確認する')).toHaveCount(0);
  await expect(screen.getByRole('heading', 'これまでの活動')).toHaveCount(0);
});

test('unknown version or corrupt response does not become a successful empty roadmap', async ({
  app,
  screen,
  browser,
}) => {
  await browser.route('**/api/services/**', async (route) => {
    await route.fulfill({ json: { data: { ...growthRoadmap(), version: 'future-version' } } });
  });
  await app.open('/?member-growth');
  await screen.getByRole('button', '成長ロードマップを見る').tap();
  await expect(screen.getByRole('alert')).toBeVisible();
  await expect(screen.getByRole('heading', '5つのステップ')).toHaveCount(0);
});

test('no candidate preserves achievements and preparing evidence without inventing a link', async ({
  app,
  screen,
  browser,
}) => {
  const data = growthRoadmap();
  data.nextRecommended = null;
  data.stages[0]!.milestones[2]!.status = 'PREPARING';
  data.stages[0]!.milestones[2]!.availability.state = 'UNAVAILABLE';
  await browser.route('**/api/services/**', async (route) => {
    await route.fulfill({
      json: { data: route.request.url.endsWith('member-roadmap') ? data : growthUsage() },
    });
  });
  await app.open('/?member-growth');
  await screen.getByRole('button', '成長ロードマップを見る').tap();
  await expect(screen.getByText('15項目中3項目を達成')).toBeVisible();
  await expect(
    screen.getByText('今は新しいおすすめはありません。', { exact: false }),
  ).toBeVisible();
  await expect(screen.getByRole('link', '投稿案を確認する')).toHaveCount(0);
});

test('legacy generations remain visible without claiming verified activity days', async ({
  app,
  screen,
  browser,
}) => {
  const usage = growthUsage();
  usage.allTime.unknownTriggerGenerations = 2;
  usage.allTime.activeDays = 0;
  usage.last7Days.activeDays = 0;
  usage.last30Days.activeDays = 0;
  await browser.route('**/api/services/**', async (route) => {
    await route.fulfill({
      json: { data: route.request.url.endsWith('member-roadmap') ? growthRoadmap() : usage },
    });
  });
  await app.open('/?member-growth');
  await screen.getByRole('button', '成長ロードマップを見る').tap();
  await expect(
    screen.getByText('起動元を確認できない旧生成が2件あります。', { exact: false }),
  ).toBeVisible();
  await expect(
    screen.getByText('旧生成だけでは活動日と判定しません。', { exact: false }),
  ).toBeVisible();
});

test('switching Bunshin aborts previous work and never shows its late response', async ({
  app,
  screen,
  browser,
}) => {
  let finish: (() => void) | undefined;
  await browser.route('**/api/services/**', async (route) => {
    if (route.request.url.includes('11111111'))
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    await route.fulfill({
      json: {
        data: route.request.url.endsWith('member-roadmap') ? growthRoadmap() : growthUsage(),
      },
    });
  });
  await app.open('/?member-growth');
  await screen.getByRole('button', '成長ロードマップを見る').tap();
  await expect(screen.getByRole('status')).toBeVisible();
  await screen.getByRole('button', 'テスト用Bunshin切替').tap();
  await expect(screen.getByRole('button', '成長ロードマップを見る')).toBeVisible();
  finish!();
  await expect(screen.getByRole('heading', '5つのステップ')).toHaveCount(0);
  await screen.getByRole('button', '成長ロードマップを見る').tap();
  await expect(screen.getByRole('heading', '5つのステップ')).toBeVisible();
});
