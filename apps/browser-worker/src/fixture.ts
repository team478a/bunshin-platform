import type { BrowserPlan } from '@bunshin/capability-browser';
import type { Fixture } from './browser';

const html = (heading: string, content: string) => `<!doctype html>
<html lang="ja">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${heading}</title>
  <style>
    body { background: #f2f5fa; color: #14223d; font: 16px system-ui, sans-serif; padding: 24px; }
    main { max-width: 34rem; margin: auto; background: white; padding: 24px; border-radius: 16px; }
    input, button { box-sizing: border-box; display: block; margin: 12px 0; padding: 12px;
      font: inherit; border-radius: 8px; }
    input { width: 100%; border: 1px solid #4f6181; }
    button { border: 0; color: white; background: #204d94; }
    footer { margin-top: 110vh; }
  </style>
  <main><h1>${heading}</h1>${content}</main>
</html>`;

export const fixtureVersion = 'practice-note-v1';
export const fixture: Fixture = {
  pages: new Map([
    [
      'home',
      html('操作練習', '<p>サンプルのメモを作成します。</p><a href="/editor">入力画面へ</a>'),
    ],
    [
      'editor',
      html(
        'メモを作成',
        `<label for="note">メモのタイトル</label><input id="note">
        <button type="button" id="preview">プレビュー</button>
        <p role="status"></p>
        <footer><h2>練習の注意点</h2></footer>
        <script>
          document.getElementById('preview').addEventListener('click', () => {
            const note = document.getElementById('note').value;
            document.querySelector('[role=status]').textContent =
              note ? 'プレビューを表示しました' : 'タイトルを入力してください';
          });
        </script>`,
      ),
    ],
  ]),
  samples: new Map([['sample-note', '研修メモのサンプル']]),
};

export function fixturePlan(device: BrowserPlan['device']): BrowserPlan {
  return {
    version: 1,
    device,
    startPage: 'home',
    steps: [
      {
        id: 'open-editor',
        action: 'click',
        target: { by: 'role', role: 'link', name: '入力画面へ' },
      },
      {
        id: 'fill-note',
        action: 'fill',
        target: { by: 'label', text: 'メモのタイトル' },
        sample: 'sample-note',
      },
      {
        id: 'preview',
        action: 'click',
        target: { by: 'role', role: 'button', name: 'プレビュー' },
      },
      { id: 'scroll', action: 'scroll', target: { by: 'text', text: '練習の注意点' } },
    ],
    success: { page: 'editor', visible: { by: 'text', text: 'プレビューを表示しました' } },
  };
}
