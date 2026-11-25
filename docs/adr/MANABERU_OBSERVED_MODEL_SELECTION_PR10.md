# 実画面の候補を既存モデル接続で選択する

開発環境の認可済み Workspace とリース済み操作ジョブに限定し、既存の候補選択 API、Google Provider の原価予約と利用記録を再利用する。開発用カタログの表示中のボタン・リンクについて候補 ID、role、名前だけを送る。サーバー側で管理する学習目的と、提示済み ID のみを受け付ける構造化応答を使う。URL・命令・画像・アカウント情報は送信しない。

この試験経路は 1 ジョブにつき最大3ステップで、各ステップの予約を既存の操作キーで一意にする。ブラウザは既存の閉じたローカルコンテンツだけを利用し、既存の成功条件、操作前後の画像、固定操作レシピの再実行機能を使う。発見直後のレシピは同じワーカー内で検証し、開発用の証拠として保存する。教材への自動接続、共通レシピ DB への登録と外部サービス探索は後続とする。

## 開発用ジョブ

開発用 DB と既存の候補選択 API の設定を使用する。承認済み Google Provider と原価枠を用意した Workspace で以下を実行する。

```sh
pnpm --filter @bunshin/browser-worker start discover-observed-model "$WORKSPACE_ID" "$ACTOR_ID" mobile "$REQUEST_ID"
pnpm --filter @bunshin/browser-worker start once
```

成功したジョブの証拠ディレクトリに `evidence.json`、前後画像、`recipe.json` が保存される。
