import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { roadmapPolicyFixture } from './roadmap-policy-fixture';
test('mobile OEM changes roadmap targets with a scoped versioned command', async ({
  app,
  browser,
  screen,
}) => {
  const commands: Record<string, unknown>[] = [];
  await browser.route('**/api/synthetic/roadmap-policy', async (route) => {
    const command = JSON.parse(route.request.postData ?? '{}') as Record<string, unknown>;
    commands.push(command);
    const value = roadmapPolicyFixture();
    value.revision = 2;
    value.service = { generated: 4, decisions: 2, activeDays: 7, validReferrals: 0 };
    value.effective = value.service;
    await route.fulfill({
      body: JSON.stringify({ data: value }),
      headers: { 'content-type': 'application/json' },
    });
  });
  await app.open('/?roadmap-policy');
  await screen.getByRole('spinbutton', '投稿案の生成回数').fill('4');
  await screen.getByRole('spinbutton', '実際に活動した日数（累計）').fill('7');
  await screen.getByRole('spinbutton', '任意の紹介目標（0で表示しない）').fill('0');
  await screen.getByRole('textbox', '変更理由').fill('活動の目安を調整');
  await screen.getByRole('button', '条件を保存').tap();
  await expect(screen.getByRole('status')).toContainText('設定を保存しました');
  expect(commands).toHaveLength(1);
  expect(commands[0]?.['expectedRevision']).toBe(1);
  expect(commands[0]?.['authority']).toBe('SERVICE');
  expect(commands[0]?.['commandId']).toBeTruthy();
  expect(commands[0]?.['settings']).toEqual({
    generated: 4,
    decisions: 2,
    activeDays: 7,
    validReferrals: 0,
  });
  expect(commands[0]?.['serviceId']).toBeUndefined();
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await browser.evaluate(() => {
    window.scrollTo(0, 0);
    return null;
  });
  await app.screenshot('roadmap-conditions-mobile');
});
test('conflict refreshes current conditions and revoked access clears the editor', async ({
  app,
  browser,
  screen,
}) => {
  let revoked = false;
  await browser.route('**/api/synthetic/roadmap-policy', async (route) => {
    if (route.request.method === 'PUT') {
      await route.fulfill({ status: 409, json: { error: { code: 'CONFLICT' } } });
      return;
    }
    if (revoked) {
      await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } });
      return;
    }
    const value = roadmapPolicyFixture();
    value.revision = 2;
    value.headquarters!.activeDays = 9;
    value.effective = value.headquarters!;
    await route.fulfill({
      body: JSON.stringify({ data: value }),
      headers: { 'content-type': 'application/json' },
    });
  });
  await app.open('/?roadmap-policy');
  await screen.getByRole('textbox', '変更理由').fill('変更');
  await screen.getByRole('button', '条件を保存').tap();
  await expect(screen.getByRole('status')).toContainText('他の変更が反映されています');
  await screen.getByRole('button', '最新の設定を取得').tap();
  await expect(screen.getByRole('status')).toContainText('最新の設定を取得しました');
  expect(
    await browser.evaluate(
      () =>
        document.querySelector<HTMLInputElement>('input[aria-label="実際に活動した日数（累計）"]')!
          .value,
    ),
  ).toBe('9');
  revoked = true;
  await screen.getByRole('button', '最新の設定を取得').tap();
  await expect(screen.getByRole('alert')).toContainText('管理権限');
  await expect(screen.getByRole('spinbutton')).toHaveCount(0);
});
test('HQ can switch back from unconfigured service settings and initialize the policy', async ({
  app,
  browser,
  screen,
}) => {
  await browser.route('**/api/synthetic/roadmap-policy', async (route) => {
    const command = JSON.parse(route.request.postData ?? '{}') as Record<string, unknown>;
    expect(command['authority']).toBe('HEADQUARTERS');
    expect(command['expectedRevision']).toBe(0);
    const value = roadmapPolicyFixture(true);
    value.headquarters = { generated: 1, decisions: 1, activeDays: 3, validReferrals: 0 };
    value.effective = value.headquarters;
    await route.fulfill({
      body: JSON.stringify({ data: value }),
      headers: { 'content-type': 'application/json' },
    });
  });
  await app.open('/?roadmap-policy&hq&unconfigured');
  await screen.getByRole('combobox', '変更する範囲').selectOption({ value: 'SERVICE' });
  await expect(screen.getByRole('button', '条件を保存')).toBeDisabled();
  await screen.getByRole('combobox', '変更する範囲').selectOption({ value: 'HEADQUARTERS' });
  await screen.getByRole('textbox', '変更理由').fill('本部の基準を設定');
  await screen.getByRole('button', '条件を保存').tap();
  await expect(screen.getByRole('status')).toContainText('設定を保存しました');
});
