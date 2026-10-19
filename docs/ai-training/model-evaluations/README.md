# 学習AIモデル評価

この評価はPR-Hのための任意実行バッチです。通常のCIでは外部AIを呼ばず、スキップされます。本番環境では実行できません。

評価対象はPR-Eで作成した架空データ20件です。同一シナリオをOpenAIとGoogleのモデルへ送り、結果にはランダムな評価IDを付けます。各結果について、次の7項目を評価者が1〜5で採点します。

- 能動的な学び
- 一度に扱う量
- 本人への合わせ方
- 手本の後に残す本人の一歩
- 誤り・画面の推測
- 範囲外への対応
- 費用・応答時間

採点者にはモデル名との対応表（`model-manifest.json`）を見せず、`blind-review.json` の評価IDと出力だけで採点してください。実行後の `blind-scores.json` に採点、`model-manifest.json` にプロバイダー・モデル・レイテンシ・token数・費用・価格表の版が保存されます。どちらもOSの一時フォルダー `bunshin-learning-model-evaluations/<runId>` に作成されます。Gitへ追加・公開しないでください。

## 実行

専用の開発・ステージング評価用ワークスペースと利用者を用意し、管理画面の「AIと検索サービスの設定」で各Providerのモデル・能力・キー・日次／月次予算・1回あたり費用を設定し、接続確認後に有効化します。Googleは評価専用で、本番では有効化・実行できません。キーの値をコマンド、ログ、評価記録へ貼らないでください。

PowerShellから次の環境変数を設定して実行します。`<...>`は実際の非秘密設定に置き換えます。APIキーは既存の暗号化済みProvider設定から取得されるため、ここには指定しません。

```powershell
$env:APP_ENV = "staging"
$env:LEARNING_EVAL_CONFIRM = "RUN_SYNTHETIC_MODEL_EVALUATION"
$env:LEARNING_EVAL_CANDIDATES = '[{"provider":"openai","model":"<OpenAIモデルID>"},{"provider":"google","model":"<GeminiモデルID>"}]'
$env:LEARNING_EVAL_WORKSPACE_ID = "<専用評価Workspace UUID>"
$env:LEARNING_EVAL_ACTOR_USER_ID = "<専用評価User UUID>"
$env:LEARNING_EVAL_MAX_REQUEST_BYTES = "<上限>"
$env:LEARNING_EVAL_MAX_OUTPUT_TOKENS = "<上限>"
$env:LEARNING_EVAL_REVIEWER_LABEL = "<評価者の短い識別名>"
pnpm evaluate:learning-model
```

`PERSONAL_LEARNING_AI_PRICING`は対象モデルとProviderに有効な価格が登録されている必要があります。各要求の前に、モデル設定の1回あたり費用と価格表から計算した最大費用の大きい方を既存のProvider予算へ予約します。応答後はtoken実績から費用を計算し、既存のAI利用記録へ保存して予約を精算します。価格が不明な場合もunknown costとして記録され、通常の費用ガードにより後続利用が止まります。

実行には40回（20シナリオ×2モデル）のProvider呼び出しと、そのProvider料金が発生します。PR作業中はこのバッチを実行していません。実測結果・採点結果は未取得です。実行後、盲検採点と費用・レイテンシをレビューし、外部公開の可否を別途判断してください。
