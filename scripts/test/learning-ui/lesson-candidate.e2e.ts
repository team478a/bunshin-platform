import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { lessonCandidate } from './lesson-fixture';
test('homepage candidate is confirmed with exactly its saved ID, not regenerated', async ({
  app,
  browser,
  screen,
}) => {
  const requests: Record<string, unknown>[] = [];
  await browser.route('**/api/synthetic/lesson-candidate', async (route) => {
    const body = JSON.parse(route.request.postData ?? '{}');
    requests.push(body);
    await route.fulfill({
      json: {
        data: {
          ...lessonCandidate,
          confirmedAt: body.action === 'CONFIRM' ? '2026-10-13T00:00:00Z' : null,
        },
      },
    });
  });
  await app.open('/?lesson-candidate');
  await screen.getByRole('button', '最初の実践を提案してもらう').tap();
  await expect(screen.getByText('紹介ページの見出しを自分で直せる')).toBeVisible();
  await screen.getByRole('button', 'この内容を確認').tap();
  await expect(
    screen.getByText('確認済みの候補です。同じ内容から再開します。実践課題への接続は準備中です。'),
  ).toBeVisible();
  expect(requests.map((x) => x.action)).toEqual(['GENERATE', 'CONFIRM']);
  expect(requests[1]).toMatchObject({ candidateId: lessonCandidate.id, requestRevision: 1 });
  expect(requests[1]).not.toHaveProperty('proposal');
});
test('missing context asks only required conditions and is not confirmable', async ({
  app,
  browser,
  screen,
}) => {
  await browser.route('**/api/synthetic/lesson-candidate', async (route) => {
    await route.fulfill({
      json: {
        data: {
          ...lessonCandidate,
          proposal: {
            status: 'NEEDS_CONTEXT',
            reason: '利用環境の確認が必要です',
            questions: ['使うAIツールは何ですか？'],
            outcome: '',
            explanation: '',
            example: '',
            practice: [],
            evidence: [],
            criteria: [],
          },
        },
      },
    });
  });
  await app.open('/?lesson-candidate');
  await screen.getByRole('button', '最初の実践を提案してもらう').tap();
  await expect(screen.getByText('使うAIツールは何ですか？')).toBeVisible();
  await expect(screen.getByRole('button', 'この内容を確認')).not.toBeVisible();
});
test('confirmed candidate reappears without any generation request', async ({
  app,
  browser,
  screen,
}) => {
  let calls = 0;
  await browser.route('**/api/synthetic/lesson-candidate', async (route) => {
    calls++;
    await route.abort();
  });
  await app.open('/?lesson-candidate&confirmed');
  await browser.reload();
  await expect(screen.getByText('紹介ページの見出しを自分で直せる')).toBeVisible();
  await expect(screen.getByRole('button', '最初の実践を提案してもらう')).not.toBeVisible();
  expect(calls).toBe(0);
});
