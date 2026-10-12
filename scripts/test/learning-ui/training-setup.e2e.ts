import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('new learner must select work and experience rather than accepting inferred defaults', async ({
  app,
  screen,
}) => {
  await app.open('/?training-setup');
  await expect(screen.getByRole('heading', 'あなたの仕事とAI経験')).toBeVisible();
  await expect(screen.getByRole('radio', /.*/, { checked: true })).toHaveCount(0);
  await screen.getByRole('button', '次へ').tap();
  await expect(screen.getByText('仕事の種類とAIの経験を選んでください。')).toBeVisible();
  await screen.getByRole('radio', '事務・バックオフィス').check();
  await screen.getByRole('button', '次へ').tap();
  await expect(screen.getByRole('heading', 'あなたの仕事とAI経験')).toBeVisible();
  await screen.getByRole('radio', '何度か使ったことがある').check();
  await screen.getByRole('button', '次へ').tap();
  await expect(screen.getByRole('heading', '普段の仕事を教えてください')).toBeVisible();
  await expect(screen.getByRole('radio', /.*/, { checked: true })).toHaveCount(0);
});

test('explicit device, usage, goal and time are sent without inferring unanswered choices', async ({
  app,
  screen,
  browser,
}) => {
  const bodies: Record<string, unknown>[] = [];
  await browser.route('**/api/services/**', async (route) => {
    bodies.push(JSON.parse(route.request.postData ?? '{}') as Record<string, unknown>);
    await route.fulfill({
      status: 503,
      json: { error: { message: '合成保存応答です。実DB保存は行いません。' } },
    });
  });
  await app.open('/?training-setup');
  await screen.getByRole('radio', '事務・バックオフィス').check();
  await screen.getByRole('radio', '何度か使ったことがある').check();
  await screen.getByRole('button', '次へ').tap();
  await screen.getByLabel('普段どんな仕事をしていますか？').fill('お店の事務をしています');
  await screen.getByLabel('時間がかかる・面倒だと感じる作業').fill('文章の作成');
  await screen.getByLabel('AIで楽にしたい、上手くなりたい仕事').fill('自分で紹介文を直したい');
  await screen.getByRole('button', '次へ').tap();
  await expect(screen.getByRole('heading', '普段の仕事を教えてください')).toBeVisible();
  await screen.getByRole('radio', 'スマートフォン中心').check();
  await screen.getByRole('button', '次へ').tap();
  await expect(screen.getByRole('checkbox', 'まだ仕事では使っていない')).not.toBeChecked();
  await screen.getByRole('checkbox', '文章作成に時間がかかる').check();
  await screen.getByRole('button', '次へ').tap();
  await expect(screen.getByRole('heading', '今の使い方と困りごと')).toBeVisible();
  await screen.getByRole('checkbox', 'メール・文章作成').check();
  await screen.getByRole('button', '次へ').tap();
  await screen.getByRole('checkbox', '文章作成').check();
  await screen.getByRole('button', '次へ').tap();
  await expect(screen.getByRole('radio', /.*/, { checked: true })).toHaveCount(0);
  await screen.getByRole('button', 'この内容で研修を始める').tap();
  await expect(screen.getByText('学習目標と使える時間を選んでください。')).toBeVisible();
  expect(bodies).toHaveLength(0);
  // Goal labels include the description/recommendation, so scope by the real labelled group.
  await screen
    .getByRole('group', '30日後にできるようになりたいこと')
    .getByRole('radio')
    .first()
    .check();
  await screen.getByRole('radio', '5分').check();
  await screen.getByRole('button', 'この内容で研修を始める').tap();
  await expect(screen.getByText('合成保存応答です。実DB保存は行いません。')).toBeVisible();
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toMatchObject({
    role: 'OFFICE',
    aiLevel: 'INTERMEDIATE',
    aiUseCases: ['EMAIL'],
    dailyMinutes: 5,
    workContext: { deviceType: 'SMARTPHONE', aiImprovementTarget: '自分で紹介文を直したい' },
  });
  expect(bodies[0]?.learningGoalKey).toBe('CREATE_SALES_EMAIL');
});
