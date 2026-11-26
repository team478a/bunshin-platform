import { browserFormSampleId, type BrowserPlan } from '@bunshin/capability-browser';
import type { Fixture } from './browser';

export const observedForm: Fixture = {
  observedSample: browserFormSampleId,
  samples: new Map([[browserFormSampleId, 'マナベル研修の練習用データ']]),
  pages: new Map<string, string>(
    (
      [
        [
          'home',
          '<main><h1>社内研修ポータル</h1><a href="/guide">申請の案内へ</a><a href="/help">操作ヘルプ</a></main>',
        ],
        ['help', '<main><h1>操作ヘルプ</h1><a href="/home">ポータルへ戻る</a></main>'],
        ['guide', '<main><h1>申請の案内</h1><a href="/templates">申請テンプレートへ</a></main>'],
        [
          'templates',
          '<main><h1>申請テンプレート</h1><a href="/form">研修申請フォームを開く</a></main>',
        ],
        [
          'form',
          `<main><h1>研修申請フォーム</h1>
        <label>件名<input id="subject"></label>
        <label>理由<textarea id="reason"></textarea></label>
        <label><input id="review" type="checkbox">入力内容を確認した</label>
        <button id="preview" type="button" disabled>プレビューを開く</button>
      </main>
      <script>
        const subject = document.querySelector('#subject');
        const reason = document.querySelector('#reason');
        const review = document.querySelector('#review');
        const preview = document.querySelector('#preview');
        function ready() { return subject.value.trim() && reason.value.trim() && review.checked; }
        function update() { preview.disabled = !ready(); }
        document.addEventListener('input', update);
        preview.addEventListener('click', () => {
          if (!ready()) return;
          sessionStorage.setItem('subject', subject.value);
          sessionStorage.setItem('reason', reason.value);
          location.href = '/preview';
        });
      </script>`,
        ],
        [
          'preview',
          `<main><h1>研修申請のプレビュー</h1>
        <p id="summary"></p>
        <button id="confirm" type="button">表示内容を確認する</button>
        <p id="complete" role="status" aria-label="プレビュー確認済み" hidden>研修申請のプレビューを確認しました</p>
      </main>
      <script>
        const subject = sessionStorage.getItem('subject');
        const reason = sessionStorage.getItem('reason');
        document.querySelector('#summary').textContent = [subject, reason].filter(Boolean).join(' ／ ');
        document.querySelector('#confirm').addEventListener('click', () => {
          if (subject && reason) document.querySelector('#complete').hidden = false;
        });
      </script>`,
        ],
      ] as const
    ).map(([path, body]) => [
      path,
      '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
        body +
        '</html>',
    ]),
  ),
};

export function observedFormGoal(device: BrowserPlan['device']): Omit<BrowserPlan, 'steps'> {
  return {
    version: 1,
    device,
    startPage: 'home',
    success: {
      page: 'preview',
      visible: { by: 'role', role: 'status', name: 'プレビュー確認済み' },
    },
  };
}

export const observedFormMaterial = {
  title: '研修申請をプレビューする',
  goal: '件名と理由を入力し、申請内容をプレビューで確認できる。',
  preparation: '検証用の社内研修ポータルを開く。練習用の文字を使う。',
  practice: '件名と理由を別の練習用の文字に変え、プレビューで両方を確認する。',
  checkpoint: '件名と理由はどこに表示され、確認後にどんなメッセージが出ましたか？',
};
