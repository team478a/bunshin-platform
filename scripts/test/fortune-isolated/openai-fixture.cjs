// Offline Fortune fixtures. All other requests stay behind the existing network guard.
require('../feedback-e2e-network-guard.cjs');
const guardedFetch = globalThis.fetch;
globalThis.fetch = function (input, options) {
  if (
    input !== 'https://api.openai.com/v1/responses' ||
    options?.headers?.authorization !== 'Bearer synthetic-fortune-e2e-key'
  ) {
    return guardedFetch(input, options);
  }
  const request = JSON.parse(options.body);
  const schema = request.text.format.name;
  const context = JSON.parse(request.input.find(({ role }) => role === 'user').content);
  let result;
  if (schema === 'fortune_intake_question') {
    result = { key: context.answers.length ? 'DONE' : 'SITUATION' };
  } else if (schema === 'fortune_follow_up' && context.question === '追加質問の交換を確認したい') {
    result = {
      body: '考えを一つに絞ると、次の一歩を決めやすくなります。',
      actionStep: '今できることを一つ書き出してみましょう。',
    };
  } else if (schema === 'fortune_deep_reading') {
    const fresh = context.reviewedUnderstanding.some(
      ({ text }) => text === '今は働き方を整理したい',
    );
    const reuse = context.personalization.priorUnderstanding?.items.some(
      ({ text }) => text === '以前は家族との時間を重視していた',
    );
    if (fresh !== Boolean(reuse)) {
      return Promise.resolve(Response.json({ error: 'Unexpected prior context' }, { status: 422 }));
    }
    result = {
      body: '物事を整理すると、自分のペースで納得できる選択肢が見つかるかもしれません。',
      actionStep: '今日のうちに、続けたいことと変えたいことを一つずつ書き出してみましょう。',
      reflectionPrompt: '書き出してみて、気持ちに変化はありましたか？',
      deep: {
        alternatives: ['今できる調整を一つ考える。', '大切にしたい条件を一つに絞る。'],
        actionReason: '優先したいことと、現状で変えられることが整理できます。',
      },
    };
  } else {
    return Promise.resolve(Response.json({ error: 'Offline fallback fixture' }, { status: 503 }));
  }
  return Promise.resolve(
    Response.json({
      model: 'synthetic-fortune',
      usage: { input_tokens: 192, output_tokens: 84 },
      output: [{ content: [{ type: 'output_text', text: JSON.stringify(result) }] }],
    }),
  );
};
