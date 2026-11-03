import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { recommendationPolicyFixture } from './recommendation-policy-fixture';

test('OEM saves bounded conditions on mobile with a versioned command and no supplied scope', async ({
  app,
  screen,
  browser,
}) => {
  const commands: Record<string, unknown>[] = [];
  await browser.route('**/api/synthetic/recommendation-policy', async (route) => {
    const command = JSON.parse(route.request.postData ?? '{}') as Record<string, unknown>;
    commands.push(command);
    const value = recommendationPolicyFixture();
    value.revision = 2;
    value.service = {
      ...value.effective,
      minimumAccepted: 6,
      cooldownDays: 90,
      categories: ['TIME'],
    };
    value.effective = value.service;
    await route.fulfill({
      body: JSON.stringify({ data: value }),
      headers: { 'content-type': 'application/json' },
    });
  });
  await app.open('/?recommendation-policy');
  await screen.getByRole('spinbutton', '採用後未報告の判定件数').fill('6');
  await screen.getByRole('spinbutton', '見送り後の抑制日数').fill('90');
  await screen.getByRole('checkbox', '操作や進め方が分からない').tap();
  await screen.getByRole('textbox', '変更理由').fill('継続利用に合わせて間隔を調整');
  await screen.getByRole('button', '条件を保存').tap();
  await expect(screen.getByRole('status')).toContainText('設定を保存しました');
  expect(commands).toHaveLength(1);
  expect(commands[0]?.['authority']).toBe('SERVICE');
  expect(commands[0]?.['expectedRevision']).toBe(1);
  expect(commands[0]?.['commandId']).toBeTruthy();
  expect(commands[0]?.['serviceId']).toBeUndefined();
  expect(commands[0]?.['settings']).toEqual({
    enabled: true,
    minimumAccepted: 6,
    cooldownDays: 90,
    categories: ['TIME'],
  });
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await app.screenshot('recommendation-policy-mobile');
  await browser.evaluate(() => {
    window.scrollTo(0, 0);
    return null;
  });
  await app.screenshot('recommendation-policy-summary-mobile');
});

test('stale updates require an explicit refresh and revocation clears old settings', async ({
  app,
  screen,
  browser,
}) => {
  let revoked = false;
  await browser.route('**/api/synthetic/recommendation-policy', async (route) => {
    if (route.request.method === 'PUT') {
      await route.fulfill({ status: 409, json: { error: { code: 'CONFLICT' } } });
      return;
    }
    if (revoked) {
      await route.fulfill({ status: 403, json: { error: { code: 'FORBIDDEN' } } });
      return;
    }
    const value = recommendationPolicyFixture();
    value.revision = 2;
    value.headquarters = { ...value.effective, minimumAccepted: 7 };
    value.effective = value.headquarters;
    await route.fulfill({
      body: JSON.stringify({ data: value }),
      headers: { 'content-type': 'application/json' },
    });
  });
  await app.open('/?recommendation-policy');
  await screen.getByRole('textbox', '変更理由').fill('変更');
  await screen.getByRole('button', '条件を保存').tap();
  await expect(screen.getByRole('status')).toContainText('他の変更が反映されています');
  await screen.getByRole('button', '最新の設定を取得').tap();
  await expect(screen.getByRole('status')).toContainText('最新の設定を取得しました');
  expect(
    await browser.evaluate(
      () =>
        document.querySelector<HTMLInputElement>('input[aria-label="採用後未報告の判定件数"]')!
          .value,
    ),
  ).toBe('7');
  revoked = true;
  await screen.getByRole('button', '最新の設定を取得').tap();
  await expect(screen.getByRole('alert')).toContainText('管理権限');
  await expect(screen.getByRole('spinbutton', '採用後未報告の判定件数')).toHaveCount(0);
});

test('OEM cannot initialize headquarters settings and malformed success is not accepted', async ({
  app,
  screen,
  browser,
}) => {
  await app.open('/?recommendation-policy&unconfigured');
  await screen.getByRole('textbox', '変更理由').fill('未設定');
  await expect(screen.getByRole('button', '条件を保存')).toBeDisabled();
  await expect(screen.getByText('本部設定の保存後に、自社の条件を変更できます。')).toBeVisible();
  await browser.route('**/api/synthetic/recommendation-policy', async (route) => {
    await route.fulfill({ json: { data: { revision: 2 } } });
  });
  await app.open('/?recommendation-policy&hq');
  await screen.getByRole('textbox', '変更理由').fill('本部確認');
  await screen.getByRole('button', '条件を保存').tap();
  await expect(screen.getByRole('status')).toContainText('取得した設定を確認できません');
});
