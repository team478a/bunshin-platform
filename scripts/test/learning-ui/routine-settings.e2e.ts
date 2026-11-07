import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { serviceSettingsFixture } from '../../../apps/web/test/service-settings-fixture';
for (const width of [1280, 390, 320]) {
  test(`ordinary save and important reason at ${width}px`, async ({ app, screen, browser }) => {
    await browser.setViewport({ width, height: 844 });
    const commands: Record<string, unknown>[] = [];
    await browser.route('**/api/services/social-a/settings', async (route) => {
      const command = JSON.parse(route.request.postData ?? '{}') as Record<string, unknown>;
      commands.push(command);
      const configuration = serviceSettingsFixture().configuration;
      await route.fulfill({
        body: JSON.stringify({
          data: {
            ...configuration,
            description: command['description'],
            registration: { ...configuration.registration, mode: command['registrationMode'] },
          },
        }),
        headers: { 'content-type': 'application/json' },
      });
    });
    await app.open('/?routine-service-settings');
    expect(
      await browser.evaluate(() => document.querySelectorAll('input[name="reason"]').length),
    ).toBe(0);
    await screen.getByRole('textbox', 'サービスの説明', { exact: true }).fill('通常の案内文を変更');
    await screen.getByRole('button', '設定を保存する', { exact: true }).tap();
    await expect(screen.getByRole('status')).toContainText('設定を保存しました');
    expect(commands).toHaveLength(1);
    expect(commands[0]?.['reason']).toBeUndefined();
    await screen.getByText('参加方法・公開条件', { exact: true }).tap();
    await screen
      .getByRole('combobox', '参加できる人', { exact: true })
      .selectOption({ value: 'INVITATION_ONLY' });
    await expect(screen.getByRole('textbox', '変更した理由', { exact: true })).toBeVisible();
    await screen.getByRole('textbox', '変更した理由', { exact: true }).scrollIntoView();
    await app.screenshot(`important-reason-${width}`);
    await screen
      .getByRole('textbox', '変更した理由', { exact: true })
      .fill('招待された参加者だけで運営するため');
    await screen.getByRole('button', '設定を保存する', { exact: true }).tap();
    await expect(screen.getByRole('status')).toContainText('設定を保存しました');
    await expect(screen.getByRole('textbox', '変更した理由', { exact: true })).not.toBeVisible();
    expect(commands).toHaveLength(2);
    expect(commands[1]?.['reason']).toBe('招待された参加者だけで運営するため');
    await screen
      .getByRole('textbox', 'サービスの説明', { exact: true })
      .fill('重要変更を保存した後の通常編集');
    await screen.getByText('初回案内・毎日の配信', { exact: true }).tap();
    await screen.getByRole('textbox', '初期のお届け時刻', { exact: true }).fill('10:30');
    await screen.getByRole('button', '設定を保存する', { exact: true }).tap();
    await expect(screen.getByRole('status')).toContainText('設定を保存しました');
    expect(commands).toHaveLength(3);
    expect(commands[2]?.['reason']).toBeUndefined();
    await screen.getByRole('checkbox', 'LINE通知の同意', { exact: true }).uncheck();
    await expect(screen.getByRole('textbox', '変更した理由', { exact: true })).toBeVisible();
    await screen.getByRole('checkbox', 'LINE通知の同意', { exact: true }).check();
    await expect(screen.getByRole('textbox', '変更した理由', { exact: true })).not.toBeVisible();
    await screen.getByRole('button', '設定を保存する', { exact: true }).scrollIntoView();
    await app.screenshot(`ordinary-save-${width}`);
    expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await app.open('/?routine-weekly-settings');
    const weekly: unknown[] = [];
    await browser.route('**/weekly-report-delivery', async (route) => {
      const body = JSON.parse(route.request.postData ?? '{}') as Record<string, unknown>;
      weekly.push(body);
      await route.fulfill({
        body: JSON.stringify({ data: body }),
        headers: { 'content-type': 'application/json' },
      });
    });
    await screen
      .getByRole('combobox', '届ける曜日', { exact: true })
      .selectOption({ value: 'TUESDAY' });
    await screen.getByRole('textbox', '届ける時刻', { exact: true }).fill('10:30');
    await screen.getByRole('button', '配信設定を保存する', { exact: true }).tap();
    await expect(screen.getByRole('status')).toContainText('自動配信を停止しました');
    expect(weekly).toHaveLength(1);
    expect(weekly[0]).not.toHaveProperty('reason');
    expect(weekly[0]).toMatchObject({ weekday: 'TUESDAY', localTime: '10:30' });
    await app.screenshot(`weekly-save-${width}`);
  });
}

test('a rejected save is shown as an error rather than success', async ({
  app,
  browser,
  screen,
}) => {
  await browser.route('**/api/services/social-a/settings', async (route) => {
    await route.fulfill({
      status: 400,
      body: JSON.stringify({ error: { message: '最新の設定を読み直してください。' } }),
      headers: { 'content-type': 'application/json' },
    });
  });
  await app.open('/?routine-service-settings');
  await screen.getByRole('button', '設定を保存する', { exact: true }).tap();
  await expect(screen.getByRole('alert')).toContainText('最新の設定を読み直してください');
  expect(
    await browser.evaluate(
      () => document.querySelector('[role="alert"]')?.classList.contains('notice--danger') ?? false,
    ),
  ).toBe(true);
});

test('free-business defaults do not turn a normal description edit into an important change', async ({
  app,
  browser,
  screen,
}) => {
  const commands: Record<string, unknown>[] = [];
  await browser.route('**/api/services/social-a/settings', async (route) => {
    const command = JSON.parse(route.request.postData ?? '{}') as Record<string, unknown>;
    commands.push(command);
    await route.fulfill({
      body: JSON.stringify({
        data: {
          ...serviceSettingsFixture(true).configuration,
          description: command['description'],
        },
      }),
      headers: { 'content-type': 'application/json' },
    });
  });
  await app.open('/?routine-service-settings&routine-business-free');
  await screen
    .getByRole('textbox', 'サービスの説明', { exact: true })
    .fill('無料サービスの案内を変更');
  await expect(screen.getByRole('textbox', '変更した理由', { exact: true })).not.toBeVisible();
  await screen.getByRole('button', '設定を保存する', { exact: true }).tap();
  await expect(screen.getByRole('status')).toContainText('設定を保存しました');
  expect(commands).toHaveLength(1);
  expect(commands[0]?.['reason']).toBeUndefined();
  expect(commands[0]).toMatchObject({
    registrationMode: 'PUBLIC',
    emailEnabled: false,
    lineEnabled: true,
    dailyIdeaDelivery: { enabled: true, contentMode: 'READY_TO_USE', mediaMode: 'TEXT_ONLY' },
  });
  await expect(screen.getByRole('textbox', '変更した理由', { exact: true })).not.toBeVisible();
});
