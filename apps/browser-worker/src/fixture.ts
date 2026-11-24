import { BROWSER_FIXTURE_VERSION, type BrowserPlan } from '@bunshin/capability-browser';
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
    #note-preview { margin-top: 16px; padding: 16px; background: #eaf2ff; border-radius: 8px; }
    #note-preview[data-layout='compact'] { max-width: 16rem; }
    footer { margin-top: 110vh; }
  </style>
  <main><h1>${heading}</h1>${content}</main>
</html>`;

export const fixtureVersion = BROWSER_FIXTURE_VERSION;
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
        <button type="button" id="preview" disabled>プレビュー</button>
        <button type="button" id="compact-preview" disabled>簡易プレビュー</button>
        <p role="status"></p>
        <section id="note-preview" aria-label="メモのプレビュー" hidden></section>
        <footer><h2>練習の注意点</h2></footer>
        <script>
          document.getElementById('note').addEventListener('input', (event) => {
            document.getElementById('preview').disabled = !event.target.value;
            document.getElementById('compact-preview').disabled = !event.target.value;
          });
          const showPreview = (event) => {
            const note = document.getElementById('note').value;
            const preview = document.getElementById('note-preview');
            preview.dataset.layout = event.currentTarget.id === 'compact-preview' ? 'compact' : 'full';
            preview.textContent = note;
            preview.hidden = !note;
            document.querySelector('[role=status]').textContent =
              note ? 'プレビューを表示しました' : 'タイトルを入力してください';
          };
          document.getElementById('preview').addEventListener('click', showPreview);
          document.getElementById('compact-preview').addEventListener('click', showPreview);
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

export const compactPreviewStep = {
  id: 'compact-preview',
  action: 'click',
  target: { by: 'role', role: 'button', name: '簡易プレビュー' },
} as const satisfies BrowserPlan['steps'][number];
