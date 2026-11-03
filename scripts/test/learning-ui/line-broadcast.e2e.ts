import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const industry = '22222222-2222-4222-8222-222222222222';
const history = (commands: Record<string, unknown>[] = []) => ({
  data: commands.slice(0, 1).map((c) => ({
    id: c['operationId'],
    title: c['title'],
    status: 'SCHEDULED',
    scheduledAt: '2026-11-03T00:00:00.000Z',
    recipients: { PENDING: 2 },
    operationalStatus: 'SCHEDULED',
    failureRate: 0,
    totalRecipients: 2,
    recoveryAttempts: 0,
  })),
  options: { industries: [{ id: industry, name: 'テスト業種' }] },
});
const receipt = (c: Record<string, unknown>) => ({
  data: {
    broadcastId: c['operationId'],
    requested: 2,
    scheduledAt: c['scheduledAt'] ?? '2026-11-03T00:00:00.000Z',
    replayed: false,
    status: 'SCHEDULED',
  },
});

for (const width of [1280, 390, 320]) {
  test(`one final confirmation freezes content and sends one reservation at ${width}px`, async ({
    app,
    screen,
    browser,
  }) => {
    await browser.setViewport({ width, height: 844 });
    const commands: Record<string, unknown>[] = [];
    const previews: Record<string, unknown>[] = [];
    await browser.route('**/api/services/social-a/line-broadcasts**', async (route) => {
      if (route.request.url.endsWith('/preview')) {
        previews.push(JSON.parse(route.request.postData ?? '{}') as Record<string, unknown>);
        await route.fulfill({
          json: {
            data: {
              reservationContract: 'SERVICE_LINE_BROADCAST_SCHEDULE_V1',
              eligibleRecipientCount: 2,
              capped: false,
            },
          },
        });
        return;
      }
      if (route.request.method === 'GET') {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(history(commands)),
        });
        return;
      }
      const c = JSON.parse(route.request.postData ?? '{}') as Record<string, unknown>;
      commands.push(c);
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(receipt(c)) });
    });
    await app.open('/?line-broadcast');
    if (width === 320)
      await browser.evaluate(() => {
        document.body.style.fontSize = '20px';
        return true;
      });
    await screen.getByLabel('業種', { exact: true }).selectOption({ value: industry });
    await screen.getByLabel('主な目的', { exact: true }).selectOption({ value: 'SALES' });
    await screen.getByLabel('件名', { exact: true }).fill('サービスのお知らせ');
    await screen
      .getByLabel('本文', { exact: true })
      .fill('初めの本文です。\nくわしくはサービスをご覧ください。');
    await screen.getByLabel('送信理由', { exact: true }).fill('参加者へ公式の案内をするため');
    await screen.getByRole('button', '送信内容を確認する', { exact: true }).tap();
    await expect(screen.getByRole('heading', '送信内容の最終確認')).toBeVisible();
    expect(commands).toHaveLength(0);
    expect(previews).toHaveLength(1);
    await expect(screen.getByLabel('本文', { exact: true })).toHaveCount(0);
    await expect(screen.getByRole('region', '送信内容の最終確認')).toContainText(
      'テスト用ハッシー',
    );
    await expect(screen.getByRole('region', '送信内容の最終確認')).toContainText('2人');
    await screen.getByRole('button', '戻って修正する', { exact: true }).tap();
    await screen.getByLabel('本文', { exact: true }).fill('修正した本文です。');
    await screen.getByRole('button', '送信内容を確認する', { exact: true }).tap();
    await expect(screen.getByRole('region', '送信内容の最終確認')).toContainText(
      '修正した本文です。',
    );
    expect(previews).toHaveLength(2);
    await screen.getByRole('heading', '送信内容の最終確認').scrollIntoView();
    await app.screenshot(`broadcast-confirmation-${width}`);
    expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    // Two synchronous native clicks exercise the in-flight guard before React can render disabled.
    await browser.evaluate(() => {
      const button = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent === 'この内容で送信を予約する',
      );
      button?.click();
      button?.click();
      return true;
    });
    await expect(screen.getByRole('status')).toContainText('予約の登録結果を確認しました');
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      message: '修正した本文です。',
      confirmed: 'SERVICE_LINE_BROADCAST_SCHEDULE_V1',
      expectedRecipientCount: 2,
      segment: { industryIds: [industry], purposes: ['SALES'] },
    });
    expect(commands[0]).not.toHaveProperty('scheduledAt');
    await expect(screen.getByLabel('本文', { exact: true })).toHaveValue('');
    expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('unknown result reuses the same reservation and does not allow a new confirmation', async ({
  app,
  screen,
  browser,
}) => {
  const bodies: string[] = [];
  await browser.route('**/api/services/social-a/line-broadcasts**', async (route) => {
    if (route.request.url.endsWith('/preview')) {
      await route.fulfill({
        json: {
          data: {
            reservationContract: 'SERVICE_LINE_BROADCAST_SCHEDULE_V1',
            eligibleRecipientCount: 2,
            capped: false,
          },
        },
      });
      return;
    }
    if (route.request.method === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(history()) });
      return;
    }
    bodies.push(route.request.postData ?? '');
    await route.fulfill(
      bodies.length === 1
        ? { status: 503, json: {} }
        : {
            contentType: 'application/json',
            body: JSON.stringify(receipt(JSON.parse(bodies[0]!) as Record<string, unknown>)),
          },
    );
  });
  await app.open('/?line-broadcast');
  await screen.getByLabel('件名', { exact: true }).fill('確認テスト');
  await screen.getByLabel('本文', { exact: true }).fill('結果不明の予約です。');
  await screen.getByLabel('送信理由', { exact: true }).fill('テスト用');
  await screen.getByRole('button', '送信内容を確認する', { exact: true }).tap();
  await screen.getByRole('button', 'この内容で送信を予約する', { exact: true }).tap();
  await expect(screen.getByRole('status')).toContainText('予約結果を確認できません');
  await expect(screen.getByRole('button', '戻って修正する', { exact: true })).toHaveCount(0);
  await expect(screen.getByLabel('本文', { exact: true })).toHaveCount(0);
  await screen.getByRole('button', '同じ予約の結果を確認する', { exact: true }).tap();
  await expect(screen.getByRole('status')).toContainText('予約の登録結果を確認しました');
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toBe(bodies[1]);
});

test('a recipient conflict requires a fresh preview and does not automatically schedule again', async ({
  app,
  screen,
  browser,
}) => {
  let previews = 0;
  let writes = 0;
  await browser.route('**/api/services/social-a/line-broadcasts**', async (route) => {
    if (route.request.url.endsWith('/preview')) {
      previews++;
      await route.fulfill({
        json: {
          data: {
            reservationContract: 'SERVICE_LINE_BROADCAST_SCHEDULE_V1',
            eligibleRecipientCount: previews === 1 ? 2 : 3,
            capped: false,
          },
        },
      });
      return;
    }
    if (route.request.method === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(history()) });
      return;
    }
    writes++;
    await route.fulfill({ status: 409, json: { error: { message: 'recipient count changed' } } });
  });
  await app.open('/?line-broadcast');
  await screen.getByLabel('件名', { exact: true }).fill('案内');
  await screen.getByLabel('本文', { exact: true }).fill('案内本文');
  await screen.getByLabel('送信理由', { exact: true }).fill('テスト用');
  await screen.getByRole('button', '送信内容を確認する', { exact: true }).tap();
  await screen.getByRole('button', 'この内容で送信を予約する', { exact: true }).tap();
  await expect(screen.getByRole('status')).toContainText('予約は受理されませんでした');
  await expect(screen.getByLabel('本文', { exact: true })).toBeEnabled();
  await screen.getByLabel('主な目的', { exact: true }).selectOption({ value: 'SALES' });
  await screen.getByRole('button', '送信内容を確認する', { exact: true }).tap();
  await expect(screen.getByRole('region', '送信内容の最終確認')).toContainText('3人');
  expect(previews).toBe(2);
  expect(writes).toBe(1);
});

test('history failure after receipt retries only GET and local schedule is serialized as ISO', async ({
  app,
  screen,
  browser,
}) => {
  let reads = 0;
  const commands: Record<string, unknown>[] = [];
  await browser.route('**/api/services/social-a/line-broadcasts**', async (route) => {
    if (route.request.url.endsWith('/preview')) {
      await route.fulfill({
        json: {
          data: {
            reservationContract: 'SERVICE_LINE_BROADCAST_SCHEDULE_V1',
            eligibleRecipientCount: 2,
            capped: false,
          },
        },
      });
      return;
    }
    if (route.request.method === 'GET') {
      reads++;
      await route.fulfill(
        reads === 2
          ? { status: 503, json: {} }
          : { contentType: 'application/json', body: JSON.stringify(history(commands)) },
      );
      return;
    }
    const c = JSON.parse(route.request.postData ?? '{}') as Record<string, unknown>;
    commands.push(c);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(receipt(c)) });
  });
  await app.open('/?line-broadcast');
  await screen.getByLabel('件名', { exact: true }).fill('未来の案内');
  await screen.getByLabel('本文', { exact: true }).fill('日時を確認します。');
  await screen.getByLabel('送信理由', { exact: true }).fill('テスト用');
  await screen.getByLabel('送信予定', { exact: true }).fill('2030-12-01T10:30');
  await screen.getByRole('button', '送信内容を確認する', { exact: true }).tap();
  await screen.getByRole('button', 'この内容で送信を予約する', { exact: true }).tap();
  await expect(screen.getByRole('status')).toContainText('予約を再送せず');
  await screen.getByRole('button', '配信履歴を再取得する', { exact: true }).tap();
  await expect(screen.getByRole('heading', '最近の配信', { exact: true })).toBeVisible();
  expect(commands).toHaveLength(1);
  expect(reads).toBe(3);
  expect(commands[0]?.['scheduledAt']).toBe(
    await browser.evaluate(() => new Date('2030-12-01T10:30').toISOString()),
  );
});

for (const preview of [
  {
    reservationContract: 'SERVICE_LINE_BROADCAST_SCHEDULE_V1',
    eligibleRecipientCount: 0,
    capped: false,
  },
  {
    reservationContract: 'SERVICE_LINE_BROADCAST_SCHEDULE_V1',
    eligibleRecipientCount: 500,
    capped: true,
  },
]) {
  test(`unavailable audience ${JSON.stringify(preview)} never offers a final reservation`, async ({
    app,
    screen,
    browser,
  }) => {
    let writes = 0;
    await browser.route('**/api/services/social-a/line-broadcasts**', async (route) => {
      if (route.request.url.endsWith('/preview')) {
        await route.fulfill({ json: { data: preview } });
        return;
      }
      if (route.request.method !== 'GET') writes++;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(history()) });
    });
    await app.open('/?line-broadcast');
    await screen.getByLabel('件名', { exact: true }).fill('案内');
    await screen.getByLabel('本文', { exact: true }).fill('案内本文');
    await screen.getByLabel('送信理由', { exact: true }).fill('テスト用');
    await screen.getByRole('button', '送信内容を確認する', { exact: true }).tap();
    await expect(screen.getByRole('status')).toContainText(
      preview.capped ? '500人を超えています' : '送信対象がいません',
    );
    await expect(
      screen.getByRole('button', 'この内容で送信を予約する', { exact: true }),
    ).toHaveCount(0);
    expect(writes).toBe(0);
  });
}
