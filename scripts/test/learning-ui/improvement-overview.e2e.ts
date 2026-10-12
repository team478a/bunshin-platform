import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
const data = (week = '2026-10-05', packageKey: 'SOCIAL' | 'TRAINING' = 'SOCIAL') => ({
  version: 'service-overview-preview-v1',
  week,
  endDate: week === '2026-10-05' ? '2026-10-11' : '2026-10-04',
  packageKey,
  sections: [
    {
      key: packageKey === 'SOCIAL' ? 'SOCIAL_PROGRESS' : 'TRAINING_PROGRESS',
      title: packageKey === 'SOCIAL' ? '投稿案の採否と実投稿' : '研修課題と評価処理の記録',
      sourceVersion: 'synthetic-v1',
      state: 'VISIBLE',
      reasons: [] as string[],
      records: '5〜9',
      subjects: '5〜9',
      metrics:
        packageKey === 'SOCIAL'
          ? [
              { label: '投稿案の採用', value: '5〜9' },
              { label: '本人による投稿記録', value: '該当記録なし' },
            ]
          : [{ label: '評価処理の完了', value: '5〜9' }],
    },
  ],
});

test('mobile read is explicit, GET-only, scoped and separates adopted drafts from actual posts', async ({
  app,
  screen,
  browser,
}) => {
  const calls: { method: string; url: string }[] = [];
  await browser.route('**/api/services/**', async (route) => {
    calls.push({ method: route.request.method, url: route.request.url });
    await route.fulfill({ json: { data: data() } });
  });
  await app.open('/?improvement-overview');
  await expect(screen.getByRole('button', '集計を確認')).toBeVisible();
  expect(
    await browser.evaluate(() =>
      Array.from(document.querySelectorAll('select')).every(
        (select) => select.getBoundingClientRect().height >= 44,
      ),
    ),
  ).toBe(true);
  expect(calls).toHaveLength(0);
  await screen.getByRole('button', '集計を確認').tap();
  await expect(screen.getByRole('heading', '投稿案の採否と実投稿')).toBeVisible();
  await expect(screen.getByText('本人による投稿記録')).toBeVisible();
  await expect(screen.getByText('該当記録なし')).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(calls[0]?.method).toBe('GET');
  expect(calls[0]?.url).toContain(
    '/api/services/synthetic/improvement-overview?kind=SOCIAL&week=2026-10-05',
  );
  expect(
    await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await app.screenshot('service-overview-mobile');
});
test('changing period or kind clears old data and never turns evaluation readiness into learning success', async ({
  app,
  screen,
  browser,
}) => {
  await browser.route('**/api/services/**', async (route) => {
    const url = new URL(route.request.url);
    await route.fulfill({
      json: {
        data: data(
          url.searchParams.get('week')!,
          url.searchParams.get('kind') as 'SOCIAL' | 'TRAINING',
        ),
      },
    });
  });
  await app.open('/?improvement-overview');
  await screen.getByRole('button', '集計を確認').tap();
  await expect(screen.getByRole('heading', '投稿案の採否と実投稿')).toBeVisible();
  await screen.getByLabel('確認する週（日本時間）').selectOption({ value: '2026-09-28' });
  await expect(screen.getByRole('heading', '投稿案の採否と実投稿')).toHaveCount(0);
  await screen.getByLabel('記録の種類').selectOption({ value: 'TRAINING' });
  await screen.getByRole('button', '集計を確認').tap();
  await expect(screen.getByRole('heading', '研修課題と評価処理の記録')).toBeVisible();
  await expect(screen.getByText('評価処理の完了')).toBeVisible();
  await expect(screen.getByRole('status')).toContainText('品質や成果の判定ではありません');
  expect(
    await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});
test('small or incomplete evidence shows withheld rather than zero and has no numeric details', async ({
  app,
  screen,
  browser,
}) => {
  const result = data();
  result.sections[0] = {
    ...result.sections[0]!,
    state: 'WITHHELD',
    records: '非表示',
    subjects: '非表示',
    metrics: [],
    reasons: ['少人数のため非表示（0件と区別しません）', '読取が不完全なため未判定'],
  };
  await browser.route('**/api/services/**', async (route) => {
    await route.fulfill({ json: { data: result } });
  });
  await app.open('/?improvement-overview');
  await screen.getByRole('button', '集計を確認').tap();
  await expect(screen.getByText('少人数のため非表示（0件と区別しません）')).toBeVisible();
  await expect(screen.getByText('保存済み記録の件数範囲')).toHaveCount(0);
  await expect(screen.getByText('5〜9')).toHaveCount(0);
});
test('storage failure and revoked authority remove prior data, without automatic retries', async ({
  app,
  screen,
  browser,
}) => {
  let status = 200;
  let calls = 0;
  await browser.route('**/api/services/**', async (route) => {
    calls++;
    await route.fulfill({
      status,
      json: status === 200 ? { data: data() } : { error: { code: 'UNAVAILABLE' } },
    });
  });
  await app.open('/?improvement-overview');
  await screen.getByRole('button', '集計を確認').tap();
  await expect(screen.getByRole('heading', '投稿案の採否と実投稿')).toBeVisible();
  status = 503;
  await screen.getByRole('button', '集計を確認').tap();
  await expect(screen.getByRole('status')).toContainText('0件とは判定していません');
  await expect(screen.getByRole('heading', '投稿案の採否と実投稿')).toHaveCount(0);
  expect(calls).toBe(2);
  status = 404;
  await screen.getByRole('button', '集計を確認').tap();
  await expect(screen.getByRole('status')).toContainText('権限を再確認');
  expect(calls).toBe(3);
});
test('foreign selection and surplus private response fields are rejected before rendering', async ({
  app,
  screen,
  browser,
}) => {
  let foreign = true;
  await browser.route('**/api/services/**', async (route) => {
    await route.fulfill({
      json: foreign
        ? { data: data('2026-09-28') }
        : { data: { ...data(), privateAnswer: 'DO_NOT_EXPORT' } },
    });
  });
  await app.open('/?improvement-overview');
  await screen.getByRole('button', '集計を確認').tap();
  await expect(screen.getByRole('status')).toContainText('0件とは判定していません');
  foreign = false;
  await screen.getByRole('button', '集計を確認').tap();
  await expect(screen.getByRole('status')).toContainText('0件とは判定していません');
  await expect(screen.getByText('DO_NOT_EXPORT')).toHaveCount(0);
  await expect(screen.getByRole('heading', '投稿案の採否と実投稿')).toHaveCount(0);
});
