# AI Providerアラート・原価UNKNOWN可視化

## 1. 調査した内容

基準main: `0ca1e5d5c96c8b2d81edbf679bfbc436b5ab0a78`。branch: `codex/admin-alert-provider-classification`。

本番の直近24時間に記録されたOpenAI失敗6件は、`DAILY_MISSION_PIPELINE`の`CONTENT_REJECTED` 4件、`VALIDATION_ERROR` 1件、`CONFLICT` 1件だった。Pilotの`AI_TRAINING_ANSWER_EVALUATION`失敗、timeout、HTTP、rate limit、Provider unavailableは確認されなかった。

既存管理アラートは`ai_usage_events.status=FAILED`を理由に関係なく合算し、「OpenAIの処理が繰り返し失敗」と表示していた。また予算使用率は`estimated_cost_usd_micros`の合計だけで、NULL件数を表示しないため、原価未算定があっても予算表示が完全に見えた。

## 2. 変更したファイル

- `packages/application/src/admin-alert-center.ts`
- `packages/application/test/admin-alert-center.test.ts`
- `packages/database/src/admin-alerts.ts`
- `packages/database/test/admin-alerts.test.ts`
- 本報告

DB schema、migration、Provider実装、Pilot実行flag、本番設定は変更しない。

## 3. 主要な設計判断

直近24時間のAI失敗を、既存`error_code`がProvider境界を示すものだけに限定した。`AI_PROVIDER_` prefixと、既存実装が保存するProvider unavailable/error、timeout/network、rate limit、HTTP error系の固定カテゴリを対象とする。`CONTENT_REJECTED`、`VALIDATION_ERROR`、`CONFLICT`などローカル品質・検証・競合失敗はProvider障害アラートへ含めない。

原価NULLは成功/失敗を問わず別件数として集計し、1件以上ならWARNINGを表示する。NULLを0円へ変換せず、「未算定分がある間は表示予算を上限保証として扱わない」と明示する。件数は費用発生件数の断定ではなく、Provider呼出有無・token・pricingを追加確認すべき処理記録数である。

既存アラートcode `AI_{PROVIDER}_FAILURES`は通知先や表示側との互換性のため維持し、意味と文言だけをProvider接続失敗へ狭めた。新規codeは`AI_{PROVIDER}_UNKNOWN_COST`とした。

## 4. 実行した検証

- application管理アラート単体: 7件成功。
- database集計境界単体: 1件成功。Providerカテゴリ条件と原価NULL条件を固定。
- application全体: 136 files / 896 tests成功、typecheck、lint成功。
- database全体: 196 files / 951 tests成功、typecheck、lint成功。
- 全体typecheck 25/25 tasks、全体build 13/13 tasks、architecture check、learning-ui typecheck成功。
- 全体lint成功。既存`apps/web/app/consent/page.tsx`の未使用eslint-disable warning 1件、error 0。
- 全体testは高並列時に既存DB RLS検査1件と既存Web 2 files / 3 testsが5秒timeoutで停止した。対象を単独再実行し、DB 2件、Web 12件が全件成功。新規application/databaseテストも全体実行内で成功。クリーンCIを最終正本とする。
- 変更ファイルPrettier、全体format、diff check成功。

最終headのGitHub CIは本報告作成時点で未確認。

## 5. 未解決事項

- 原価UNKNOWNアラートは可視化であり、金額Hard Stopではない。
- Daily Missionなど既存経路はtoken/priceを保存しない記録があり、原因別の修復は別作業。
- error codeは文字列契約であり、新しいProvider失敗カテゴリを追加する際は集計対象もレビューする必要がある。
- OpenAIのactive設定は全機能共通。モデル移行をPilotだけの変更として実施できない。
- 本番の外部通知、全instance停止・in-flight drain、実課金上限は未確認。

## 6. 次Phaseへ進める条件

本PRのレビューとCI成功後も、Wave 0はNO-GOを維持する。原価UNKNOWNの既存経路を調査・縮小し、金額上限の責任範囲、Provider側budget、外部通知、停止/drainを人間が確認する。全体共通モデルの移行またはPilot専用Provider境界は、既存機能への影響とevalを含む別PR・別承認とする。

本変更だけでPilot START、参加者追加、Provider送信、実課金、production releaseを行わない。
