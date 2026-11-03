import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { externalGrantFixture } from './external-grants-fixture';
test('mobile owner explicitly consents to exact client and duration, without claiming a connection', async ({
  app,
  browser,
  screen,
}) => {
  const calls: Record<string, unknown>[] = [];
  await browser.route('**/api/synthetic/external-grants', async (route) => {
    if (route.request.method === 'POST') {
      calls.push(JSON.parse(route.request.postData ?? '{}') as Record<string, unknown>);
      await route.fulfill({ json: { data: { saved: true } } });
    } else await route.fulfill({ json: { data: externalGrantFixture() } });
  });
  await app.open('/?external-grants');
  await expect(screen.getByRole('button', '同意して読取を許可する')).toBeDisabled();
  const consent = screen.getByRole('checkbox');
  await consent.tap();
  await screen.getByRole('combobox', '許可する期間').selectOption({ value: '15' });
  await expect(consent).not.toBeChecked();
  await expect(screen.getByRole('button', '同意して読取を許可する')).toBeDisabled();
  await consent.tap();
  await screen.getByRole('button', '同意して読取を許可する').tap();
  await expect(screen.getByRole('status')).toContainText(
    '外部サービスとの接続はまだ完了していません',
  );
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    clientId: 'synthetic-client',
    operation: 'member-usage:read',
    expiresInMinutes: 15,
    consentVersion: 'external-read-consent-v1',
  });
  expect(calls[0]?.['userId']).toBeUndefined();
  expect(calls[0]?.['environment']).toBeUndefined();
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await browser.evaluate(() => {
    window.scrollTo(0, 0);
    return null;
  });
  await app.screenshot('external-grants-consent-mobile');
});
test('network retry keeps the original issue command ID', async ({ app, browser, screen }) => {
  const calls: Record<string, unknown>[] = [];
  await browser.route('**/api/synthetic/external-grants', async (route) => {
    if (route.request.method === 'POST') {
      calls.push(JSON.parse(route.request.postData ?? '{}') as Record<string, unknown>);
      await route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE' } } });
    } else await route.fulfill({ json: { data: externalGrantFixture() } });
  });
  await app.open('/?external-grants');
  await screen.getByRole('checkbox').tap();
  await screen.getByRole('button', '同意して読取を許可する').tap();
  await expect(screen.getByRole('alert')).toBeVisible();
  await screen.getByRole('button', '同意して読取を許可する').tap();
  await expect(screen.getByRole('button', '同意して読取を許可する')).toBeEnabled();
  expect(calls).toHaveLength(2);
  expect(calls[0]?.['commandId']).toBe(calls[1]?.['commandId']);
  await expect(screen.getByRole('status')).not.toBeVisible();
});
test('stopped issuance still lets the owner confirm and revoke a saved grant', async ({
  app,
  browser,
  screen,
}) => {
  const commands: unknown[] = [];
  const view = externalGrantFixture(true);
  await browser.route('**/api/synthetic/external-grants', async (route) => {
    if (route.request.method === 'DELETE') {
      commands.push(JSON.parse(route.request.postData ?? '{}'));
      view.grants[0]!.state = 'REVOKED';
      await route.fulfill({ json: { data: { saved: true } } });
    } else await route.fulfill({ json: { data: view } });
  });
  await app.open('/?external-grants&stopped');
  await expect(screen.getByRole('button', '同意して読取を許可する')).not.toBeVisible();
  await screen.getByRole('button', 'この許可を解除する').tap();
  expect(commands).toHaveLength(0);
  await screen.getByRole('button', '確認して解除する').tap();
  await expect(screen.getByRole('status')).toContainText('解除しました');
  await expect(screen.getByText('解除済み', { exact: true })).toBeVisible();
  expect(commands).toEqual([
    { connectionId: '11111111-1111-4111-8111-111111111111', expectedRevision: 1 },
  ]);
  await app.screenshot('external-grants-revoked-mobile');
});
test('revision conflict is an error and preserves the saved list for refresh', async ({
  app,
  browser,
  screen,
}) => {
  await browser.route('**/api/synthetic/external-grants', async (route) => {
    await route.fulfill({ status: 409, json: { error: { code: 'CONFLICT' } } });
  });
  await app.open('/?external-grants&stopped');
  await screen.getByRole('button', 'この許可を解除する').tap();
  await screen.getByRole('button', '確認して解除する').tap();
  await expect(screen.getByRole('alert')).toContainText('再読込');
  await expect(screen.getByRole('status')).not.toBeVisible();
  await expect(screen.getByText('許可中', { exact: true })).toBeVisible();
});
test('successful mutation with failed refresh is not shown as an unsuccessful mutation', async ({
  app,
  browser,
  screen,
}) => {
  await browser.route('**/api/synthetic/external-grants', async (route) => {
    if (route.request.method === 'POST') await route.fulfill({ json: { data: { saved: true } } });
    else await route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE' } } });
  });
  await app.open('/?external-grants');
  await screen.getByRole('checkbox').tap();
  await screen.getByRole('button', '同意して読取を許可する').tap();
  await expect(screen.getByRole('status')).toContainText('保存しました');
  await expect(screen.getByRole('alert')).toContainText('操作は保存済み');
  await expect(screen.getByRole('button', '同意して読取を許可する')).toBeDisabled();
});
