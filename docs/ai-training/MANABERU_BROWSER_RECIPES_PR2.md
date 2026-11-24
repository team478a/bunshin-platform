# マナベルスタイル PR-2 操作探索とレシピ

[設計判断](../adr/MANABERU_BROWSER_RECIPES_PR2.md)

- 既存のワーカー、操作命令、PostgreSQL ジョブ、操作証拠を再利用。探索の候補は検証画面に対して登録した操作。画面の表示・活性状態から実行できる候補を選び、ID を既存の構造化命令へ照合する。タイムアウトは候補選択にも適用する。
- 同じ Workspace・依頼者・検証画面版・端末の保存済みレシピを優先する。リプレイは保存済み計画の手順と成功条件を現行の許可範囲およびハッシュに照合し、候補選択を呼ばずに実行する。
- PostgreSQL に計画と画像証拠への参照を保存する。成功時のジョブ完了とレシピ登録・検証日時の更新は同じトランザクションで行う。レシピは開発検証用で、共有教材の公開は後続作業。

## 実行

使い捨て DB に migration を適用し、PR-1 と同じ `BROWSER_FIXTURE_DATABASE_URL` を設定する。依頼 UUID は各ジョブで新しく払い出す。

```sh
pnpm --filter @bunshin/browser-worker start discover "$WORKSPACE_ID" "$ACTOR_ID" mobile "$REQUEST_ID"
pnpm --filter @bunshin/browser-worker start once
pnpm --filter @bunshin/browser-worker start replay "$WORKSPACE_ID" "$ACTOR_ID" "$RECIPE_ID" "$NEXT_REQUEST_ID"
pnpm --filter @bunshin/browser-worker start once
```

## Stagehand の検証

Stagehand 3.7.4（MIT）と Playwright 1.65.1（Apache-2.0）を固定して試した。ローカル Chromium に Playwright で CDP 接続し、実画面のボタンを Stagehand の `observe` で特定した。モデル応答には合成クライアントを使い、外部 AI と Browserbase への呼び出しは 0 回。 [Stagehand Local の公式仕様](https://docs.stagehand.dev/v3/configuration/browser)

```sh
PROBE_DIR="$(mktemp -d)"
npm install --prefix "$PROBE_DIR" @browserbasehq/stagehand@3.7.4 playwright@1.65.1
cp apps/browser-worker/probes/stagehand-local.mjs "$PROBE_DIR/"
node "$PROBE_DIR/stagehand-local.mjs"
```

既定のワーカーで稼働するのは、実画面を検査する決定的な候補選択。LLM での目的解釈・候補選択、既存原価枠との接続、変化した画面の部分修復、外部サービス、教材生成は未実装。VPS での計測と有料モデルによる探索成功率は未実施。

## 開発検証

実 Chromium の 9 テストで、候補の並びを逆にしても画面に沿って発見できること、候補外 ID の拒否、リプレイ、成功条件変更時の失敗を確認。使い捨て PostgreSQL でレシピ 1 件・3 ステップの保存、明示リプレイ、新しい依頼による既存レシピの再利用、同じ Workspace 内の別利用者による取得拒否を確認した。生成物は 3 ステップの前後 PNG 6 枚と証拠 JSON。AI 原価 0 円。本番の migration と設定変更は未実施。
