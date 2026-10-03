// Run only through cua_repl against the loopback fixture. No standalone browser dependency.
export async function verifyFeedbackReviewBrowser(tab) {
  if ((await tab.url()) !== 'http://127.0.0.1:18997/') throw new Error('Wrong fixture URL');
  const results = [];
  const terminalLabels = [];
  const ui = tab.playwright;
  const a = ui.getByRole('region', { name: '操作A', exact: true });
  const b = ui.getByRole('region', { name: '操作B', exact: true });
  const assert = (value, message) => {
    if (!value) throw new Error(message);
  };
  const ledger = async () => JSON.parse(await ui.getByLabel('fixture台帳').innerText());
  const observe = () => ui.domSnapshot();
  async function reset(mode) {
    await ui.getByRole('button', { name: mode, exact: true }).click();
    await observe();
    assert((await ledger()).calls === 0, 'Reset failed');
  }
  async function prepare() {
    await a.getByRole('button', { name: '確認を始める', exact: true }).click();
    await observe();
    await a.getByRole('button', { name: '判断を確定' }).waitFor({ state: 'visible' });
    assert(
      !(await a.getByRole('button', { name: '判断を確定' }).isEnabled()),
      'Confirmation bypass',
    );
  }
  async function confirm(reason = 'REVIEW_COMPLETED') {
    await a.getByRole('combobox').selectOption(reason);
    await a.getByRole('checkbox').check();
    await a.getByRole('button', { name: '判断を確定', exact: true }).click();
    await observe();
  }
  async function terminal(region, phrase, expectedLabel = '記録済み') {
    await region.getByRole('status').filter({ hasText: phrase }).waitFor({ state: 'visible' });
    assert(
      (await region.getByRole('status').innerText()).includes(phrase),
      'Wrong terminal message',
    );
    assert(!(await region.getByRole('button').isEnabled()), 'Terminal permits another send');
    const label = await region.getByRole('button').innerText();
    assert(label === expectedLabel, `Wrong terminal label: ${label}`);
    terminalLabels.push(label);
  }
  await reset('normal');
  await prepare();
  await confirm();
  await terminal(a, '確認済みとして記録');
  assert((await ledger()).calls === 2 && (await ledger()).writes === 1, 'Normal protocol differs');
  results.push('normal: PASS');
  await b.getByRole('button', { name: '確認を始める', exact: true }).click();
  await observe();
  await terminal(b, '確認済みとして記録');
  assert(
    (await ledger()).calls === 3 && (await ledger()).writes === 1,
    'Terminal preparation differs',
  );
  results.push('already-reviewed: PASS (fixture response only)');
  for (const reason of ['OUT_OF_SCOPE', 'DUPLICATE_REVIEW']) {
    await reset('normal');
    await prepare();
    await confirm(reason);
    await terminal(a, '対象外として記録');
    const value = await ledger();
    assert(
      value.commands.at(-1).action === 'DISMISS' && value.commands.at(-1).reasonCode === reason,
      'Dismiss mapping differs',
    );
    results.push(`dismiss/${reason}: PASS`);
  }
  await reset('lost-prepare');
  await a.getByRole('button', { name: '確認を始める', exact: true }).click();
  await observe();
  await a.getByRole('button', { name: '同じ内容で再送' }).waitFor({ state: 'visible' });
  assert(
    await a.getByRole('button', { name: '同じ内容で再送' }).isEnabled(),
    'Prepare retry unavailable',
  );
  assert((await a.getByRole('checkbox').count()) === 0, 'Unknown preparation exposes final action');
  await a.getByRole('button', { name: '同じ内容で再送' }).click();
  await observe();
  await a.getByRole('button', { name: '判断を確定' }).waitFor({ state: 'visible' });
  assert(
    (await ledger()).identicalLastTwo && (await ledger()).writes === 0,
    'Preparation changed on retry',
  );
  results.push('lost-prepare: PASS');
  await reset('lost-final');
  await prepare();
  await confirm();
  await a
    .getByRole('status')
    .filter({ hasText: '結果を確認できません' })
    .waitFor({ state: 'visible' });
  assert(
    !(await a.getByRole('combobox').isEnabled()) && !(await a.getByRole('checkbox').isEnabled()),
    'Uncertain decision is editable',
  );
  assert(
    (await a.getByRole('status').innerText()).includes('結果を確認できません'),
    'Unknown response marked success',
  );
  await a.getByRole('button', { name: '同じ内容で再送' }).click();
  await observe();
  await terminal(a, '確認済みとして記録');
  const replay = await ledger();
  assert(
    replay.calls === 3 && replay.identicalLastTwo && replay.writes === 1,
    'Retry command changed',
  );
  results.push('lost-final: PASS (exact client body; write count belongs to fake)');
  await reset('conflict');
  await prepare();
  await confirm();
  await terminal(a, '保存成功とは判定していません', '画面更新が必要');
  assert((await ledger()).calls === 2 && (await ledger()).writes === 0, 'Conflict retried');
  results.push('conflict409: PASS');
  await reset('denied');
  await a.getByRole('button', { name: '確認を始める', exact: true }).click();
  await observe();
  await terminal(a, '保存成功とは判定していません', '画面更新が必要');
  assert((await ledger()).calls === 1 && (await ledger()).writes === 0, 'Denied retried');
  results.push('denied403: PASS (not real auth)');
  await reset('busy');
  await a.getByRole('button', { name: '確認を始める', exact: true }).dblclick();
  await observe();
  assert(
    !(await a.getByRole('button').isEnabled()) && (await ledger()).calls === 1,
    'Double click dispatched twice',
  );
  await ui.getByRole('button', { name: '保留応答を返す' }).click();
  await observe();
  await a.getByRole('button', { name: '判断を確定' }).waitFor({ state: 'visible' });
  assert(
    !(await a.getByRole('button', { name: '判断を確定' }).isEnabled()),
    'Released preparation bypasses confirmation',
  );
  results.push('busy-double-click: PASS (explicit barrier; no sleep)');
  return {
    results,
    terminalLabels,
    terminalLabelRegression:
      'PASS: recorded and reload-required labels are distinct; retry remains non-terminal',
  };
}
