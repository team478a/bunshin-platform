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

const completedBroadcast = {
  id: '33333333-3333-4333-8333-333333333333',
  title: '前回のお知らせ',
  status: 'COMPLETED',
  scheduledAt: '2026-11-03T00:00:00.000Z',
  recipients: { SENT: 3, FAILED: 2 },
  operationalStatus: 'NEEDS_ATTENTION',
  failureRate: 40,
  totalRecipients: 5,
  recoveryAttempts: 0,
};
const scheduledBroadcast = {
  ...completedBroadcast,
  id: '44444444-4444-4444-8444-444444444444',
  title: '予約中のお知らせ',
  status: 'SCHEDULED',
  recipients: { SENT: 1, PENDING: 3, FAILED: 1 },
  operationalStatus: 'SCHEDULED',
};

test('reviews only the completed failed broadcast and confirms retry once on mobile', async ({
  app,
  screen,
  browser,
}) => {
  await browser.setViewport({ width: 390, height: 844 });
  const writes: Array<{ url: string; body: string | null }> = [];
  await browser.route('**/api/services/social-a/line-broadcasts**', async (route) => {
    if (route.request.method === 'GET') {
      await route.fulfill({
        json: {
          data: [
            writes.length ? { ...completedBroadcast, status: 'SCHEDULED' } : completedBroadcast,
            scheduledBroadcast,
          ],
        },
      });
      return;
    }
    writes.push({ url: route.request.url, body: route.request.postData ?? null });
    await route.fulfill({ json: { data: { broadcastId: completedBroadcast.id, retried: 2 } } });
  });
  await app.open('/?line-broadcast');
  const retry = screen.getByRole('button', '失敗分を再送する', { exact: true });
  await expect(retry).toHaveCount(1);
  await retry.tap();
  const review = screen.getByRole('region', '配信操作の最終確認');
  await expect(review).toContainText('テスト用ハッシー');
  await expect(review).toContainText('前回のお知らせ');
  await expect(review).toContainText('2件');
  await screen.getByLabel('再送する理由').fill('理由の下書き');
  await screen.getByRole('button', '実行せず戻る').tap();
  expect(writes).toHaveLength(0);
  await retry.tap();
  await expect(screen.getByLabel('再送する理由')).toHaveValue('');
  await screen.getByLabel('再送する理由').fill('  一時障害から復旧  ');
  await app.screenshot('retry-confirmation-390');
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await browser.evaluate(() => {
    const button = Array.from(document.querySelectorAll('button')).find(
      (item) => item.textContent === '失敗分だけ再送を予約する',
    );
    button?.click();
    button?.click();
    return true;
  });
  await expect(screen.getByRole('status')).toContainText('再送予約が完了しました');
  expect(writes).toHaveLength(1);
  expect(writes[0]?.url).toContain(`/${completedBroadcast.id}/retry`);
  expect(writes[0]?.body).toBe(JSON.stringify({ reason: '一時障害から復旧' }));
  await expect(retry).toHaveCount(0);
});

test('confirms cancellation and preserves the result when the history read fails', async ({
  app,
  screen,
  browser,
}) => {
  await browser.setViewport({ width: 1280, height: 844 });
  const posts: string[] = [];
  let failRead = true;
  await browser.route('**/api/services/social-a/line-broadcasts**', async (route) => {
    if (route.request.method === 'GET') {
      if (posts.length && failRead) {
        failRead = false;
        await route.fulfill({ status: 503, json: {} });
        return;
      }
      await route.fulfill({
        json: {
          data: [
            posts.length
              ? { ...scheduledBroadcast, status: 'CANCELLED', operationalStatus: 'CANCELLED' }
              : scheduledBroadcast,
          ],
        },
      });
      return;
    }
    posts.push(route.request.url);
    await route.fulfill({
      json: {
        data: { broadcastId: scheduledBroadcast.id, cancelledAt: '2026-11-03T00:01:00.000Z' },
      },
    });
  });
  await app.open('/?line-broadcast');
  const cancel = screen.getByRole('button', '配信を取り消す', { exact: true });
  await cancel.tap();
  const review = screen.getByRole('region', '配信操作の最終確認');
  await expect(review).toContainText('予約中のお知らせ');
  await expect(review).toContainText('3件');
  await expect(review).toContainText('実行中の送信は停止できない場合があります');
  await screen.getByLabel('取り消す理由').fill('日程の変更');
  await screen.getByRole('button', '未送信の予約を取り消す').tap();
  await expect(screen.getByRole('status')).toContainText(
    '取消が完了しました。履歴を取得できませんでした',
  );
  await expect(cancel).toBeDisabled();
  await screen.getByRole('button', '配信履歴を再取得する').tap();
  await expect(cancel).toHaveCount(0);
  expect(posts).toHaveLength(1);
  expect(posts[0]).toContain(`/${scheduledBroadcast.id}/cancel`);
});

test('unknown retry result can only reload history, including after an unavailable read', async ({
  app,
  screen,
  browser,
}) => {
  await browser.setViewport({ width: 320, height: 844 });
  let posts = 0;
  let reads = 0;
  await browser.route('**/api/services/social-a/line-broadcasts**', async (route) => {
    if (route.request.method === 'GET') {
      reads++;
      if (reads === 2) {
        await route.fulfill({ status: 503, json: {} });
        return;
      }
      await route.fulfill({ json: { data: [completedBroadcast] } });
      return;
    }
    posts++;
    await route.fulfill({ status: 503, json: {} });
  });
  await app.open('/?line-broadcast');
  await screen.getByRole('button', '失敗分を再送する', { exact: true }).tap();
  await screen.getByLabel('再送する理由').fill('障害から復旧');
  await screen.getByRole('button', '失敗分だけ再送を予約する').tap();
  const readOnly = screen.getByRole('button', '操作せず履歴だけを確認する');
  await expect(readOnly).toBeVisible();
  await expect(screen.getByRole('button', '失敗分だけ再送を予約する')).toHaveCount(0);
  await readOnly.tap();
  await expect(screen.getByRole('status')).toContainText('履歴を取得できません');
  await expect(readOnly).toBeVisible();
  await readOnly.tap();
  await expect(screen.getByRole('status')).toContainText('最新の履歴を取得しました');
  await expect(readOnly).toHaveCount(0);
  expect(posts).toBe(1);
  expect(reads).toBe(3);
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
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
