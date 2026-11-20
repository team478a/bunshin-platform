import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import type { FortuneBrowserFixture } from './fortune-harness';

const reading = {
  id: '22222222-2222-4222-8222-222222222222',
  localDate: '2026-11-21',
  theme: 'WORK',
  cardNameJa: '愚者',
  cardCode: 'THE_FOOL',
  orientation: 'UPRIGHT',
  status: 'READY_AI',
  title: 'はじめの一歩',
  body: '新しい役割に向けて、今の経験をどう使うか考えてみましょう。',
  actionStep: '今の仕事で得意なことを一つ書き出す。',
  reflectionPrompt: '得意なことを言葉にして、考え方は変わりましたか？',
  feedbackRating: null,
  feedbackIssue: null,
  createdAt: '2026-11-21T00:00:00.000Z',
} as const;
const emptyProfile = { consented: false, interest: null, question: null, style: null } as const;
const endpoints = '**/api/services/fixture-fortune/fortune';

test('mobile Fortune completes guided reading, two follow-ups, rating and next-day reflection', async ({
  app,
  screen,
  browser,
}) => {
  const state: FortuneBrowserFixture = { joined: false, completed: false, profile: emptyProfile };
  const writes: Array<{ path: string; body: unknown }> = [];
  const turns: Array<{ turn: number; question: string; answer: string; status: 'READY' }> = [];
  await browser.route('**/__fortune_fixture', (route) =>
    route.fulfill({ json: { ...state, profile: { ...state.profile } } }),
  );
  await browser.route(`${endpoints}/**`, async (route) => {
    const path = new URL(route.request.url).pathname.split('/').at(-1)!;
    const body = JSON.parse(route.request.postData ?? '{}') as Partial<
      FortuneBrowserFixture['profile'] & {
        rating: NonNullable<FortuneBrowserFixture['reading']>['personalFitRating'] | null;
      }
    >;
    if (route.request.method !== 'GET') writes.push({ path, body });
    if (path === 'participation') state.joined = true;
    if (path === 'profile') {
      state.completed = true;
      state.profile = body.consented
        ? {
            consented: true,
            interest: body.interest ?? null,
            question: body.question ?? null,
            style: body.style ?? null,
          }
        : emptyProfile;
    }
    if (path === 'today') state.reading = reading;
    if (path === 'personal-fit' && state.reading) {
      if (body.rating) state.reading = { ...state.reading, personalFitRating: body.rating };
      else state.reading = reading;
    }
    if (path === 'follow-ups') {
      if (route.request.method === 'POST') {
        if (!body.question) throw new Error('Expected a follow-up question in the test request');
        turns.push({
          turn: turns.length + 1,
          question: body.question,
          answer: '今ある経験を使える場面を一つ思い出してみましょう。',
          status: 'READY',
        });
      }
      return route.fulfill({ json: { data: { remaining: 2 - turns.length, turns } } });
    }
    return route.fulfill({ json: { data: { saved: true } } });
  });

  await app.open('/fortune.html');
  const join = screen.getByRole('button', '確認して始める');
  await expect(join).toBeDisabled();
  await screen.getByLabel('私は18歳以上です').tap();
  await join.tap();
  await screen.getByLabel('今、どんなことが気になっていますか？').fill('新しい役割');
  await screen.getByLabel(/入力した希望と過去の鑑定・評価を使うことに同意する/).tap();
  await screen.getByRole('button', '同意して希望を保存').tap();
  await screen.getByLabel('今日、特に知りたいこと（任意）').fill('得意なことを生かしたい');
  await screen.getByRole('button', /仕事や今後の動き/).tap();
  await expect(screen.getByRole('heading', '今日の提案')).toBeVisible();
  await expect(screen.getByText(reading.actionStep)).toBeVisible();
  await screen.getByText('今回の占いは、あなたに合っていましたか？（任意）').tap();
  await screen.getByRole('button', 'とても合っていた').tap();
  await expect(screen.getByText('評価を保存しました。')).toBeVisible();
  await screen.getByRole('button', 'この評価を取り消す').tap();
  await expect(screen.getByText('評価を取り消しました。')).toBeVisible();
  await screen.getByRole('button', '別の見方はある？').tap();
  await screen.getByRole('button', '質問する').tap();
  await expect(screen.getByText(/あと1回質問できます/)).toBeVisible();
  await screen.getByLabel('AIへの質問').fill('ほかにできることは？');
  await screen.getByRole('button', '質問する').tap();
  await expect(screen.getByText(/あと0回質問できます/)).toBeVisible();
  await expect(screen.getByRole('button', '質問する')).toHaveCount(0);

  state.previous = reading;
  delete state.reading;
  await app.open('/fortune.html?day=2');
  await screen.getByText('前回の提案を振り返る（任意）').tap();
  await expect(screen.getByText(reading.reflectionPrompt)).toBeVisible();
  await screen.getByRole('button', '試して変化があった').tap();
  await expect(screen.getByText('回答を保存しました。次の鑑定に活用します。')).toBeVisible();
  await screen.getByRole('button', '同意を取り消して希望を削除').tap();
  await expect(screen.getByText('前回の提案を振り返る（任意）')).toHaveCount(0);
  expect(writes).toEqual([
    { path: 'participation', body: { ageConfirmed: true } },
    {
      path: 'profile',
      body: { consented: true, interest: '新しい役割', question: '', style: null },
    },
    { path: 'today', body: { theme: 'WORK', consultation: '得意なことを生かしたい' } },
    { path: 'personal-fit', body: { rating: 'VERY' } },
    { path: 'personal-fit', body: { rating: null } },
    { path: 'follow-ups', body: { question: '別の見方はある？', requestId: expect.any(String) } },
    {
      path: 'follow-ups',
      body: { question: 'ほかにできることは？', requestId: expect.any(String) },
    },
    { path: 'reflection', body: { answer: 'TRIED_CHANGED' } },
    { path: 'profile', body: { consented: false } },
  ]);
});

test('mobile Fortune can skip intake and still use the standard reading when AI is unavailable', async ({
  app,
  screen,
  browser,
}) => {
  const state: FortuneBrowserFixture = { joined: true, completed: false, profile: emptyProfile };
  await browser.route('**/__fortune_fixture', (route) =>
    route.fulfill({ json: { ...state, profile: { ...state.profile } } }),
  );
  await browser.route(`${endpoints}/profile`, async (route) => {
    expect(JSON.parse(route.request.postData ?? '{}')).toEqual({ consented: false });
    state.completed = true;
    await route.fulfill({ json: { data: { saved: true } } });
  });
  await browser.route(`${endpoints}/today`, (route) => {
    state.reading = { ...reading, status: 'READY_BASIC', body: '承認済みの標準鑑定です。' };
    delete state.reading.reflectionPrompt;
    return route.fulfill({ json: { data: { ...state.reading } } });
  });
  await browser.route(`${endpoints}/**/follow-ups`, (route) =>
    route.fulfill({ json: { data: null } }),
  );
  await app.open('/fortune.html');
  await screen.getByRole('button', 'スキップ').tap();
  await expect(screen.getByRole('heading', 'あなたに合う占いにする')).toHaveCount(0);
  await screen.getByRole('button', /仕事や今後の動き/).tap();
  await expect(screen.getByText('承認済みの標準鑑定です。')).toBeVisible();
  await expect(screen.getByText(/今回の占いは、あなたに合っていましたか/)).toHaveCount(0);
});
