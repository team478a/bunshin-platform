import type { BrowserPlan } from '@bunshin/capability-browser';
import type { Fixture } from './browser';

export const observedCatalogue: Fixture = {
  pages: new Map([
    [
      'catalogue',
      '<main lang="ja"><h1>研修用カタログ</h1><a href="/detail">詳細を開く</a><a href="/guide">利用案内を開く</a></main>',
    ],
    ['guide', '<main lang="ja"><h1>利用案内</h1><a href="/catalogue">カタログに戻る</a></main>'],
    [
      'detail',
      `<main lang="ja"><h1>研修用カタログの詳細</h1><button id="compare">比較を開く</button>
      <a href="/catalogue">カタログに戻る</a><p role="status" aria-label="比較表示中" id="result" hidden>比較結果を表示しました</p></main>
      <script>document.querySelector('#compare').onclick = () => { document.querySelector('#result').hidden = false; };</script>`,
    ],
  ]),
  samples: new Map(),
};

export function observedCatalogueGoal(device: BrowserPlan['device']): Omit<BrowserPlan, 'steps'> {
  return {
    version: 1,
    device,
    startPage: 'catalogue',
    success: { page: 'detail', visible: { by: 'role', role: 'status', name: '比較表示中' } },
  };
}
