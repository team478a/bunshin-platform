# Daily Mission原価テレメトリ補完

## 1. 調査した内容

基準main: `9df423f91bdd1886ff5e895d40da0c068b20bc02`。branch: `codex/daily-mission-cost-telemetry`。

Daily MissionのPlanner、Rebrief、原稿生成、品質確認は、モデル、Prompt Version、token数、処理時間を`ai_usage_events`へ記録していた。一方、管理者がレビューして有効化するOpenAI設定の`requestCostUsdMicros`を保存しておらず、成功した実Provider呼び出しがすべて原価UNKNOWNになっていた。

また`DAILY_MISSION_PIPELINE`は、一連の処理が失敗したことを表す内部要約行であり、それ自体はProviderへの追加リクエストではない。この要約行も原価UNKNOWN件数に含まれていたため、実呼び出しの原価設定を補完しても警告が残る構造だった。

## 2. 変更したファイル

- `apps/web/src/services/daily-mission-ai-runtime.ts`
- `apps/web/test/daily-mission-ai-runtime.test.ts`
- `apps/web/test/daily-mission-ai-runtime-boundary.test.ts`
- `packages/database/src/admin-alerts.ts`
- `packages/database/test/admin-alerts.test.ts`
- 本報告

DB schema、migration、Provider実装、モデル、Prompt、生成内容、Pilot実行flag、本番設定は変更しない。

## 3. 主要な設計判断

Daily Missionの成功した各Provider呼び出しへ、既存の管理設定`requestCostUsdMicros`を`estimatedCostUsdMicros`として記録する。価格版は、他の既存AI経路と同じ`admin-request-cost-v1`を使用する。設定値が0の場合は0円と断定せず、従来どおりNULLとしてUNKNOWNを維持する。

原価UNKNOWNアラートの集計から`DAILY_MISSION_PIPELINE`だけを除外する。これはProvider呼び出しではなく、既に個別記録された呼び出し群の最終結果を示す内部要約だからである。Provider障害の検知では引き続きこの失敗行を使用し、障害アラートは弱めない。

token単価による精算やcached tokenの取得は今回導入しない。全機能共通のOpenAI設定に既に存在する、管理者レビュー対象の固定リクエスト原価を利用する最小変更とした。

## 4. 実行した検証

- 対象単体: Web 2 files / 4 tests、Database 1 file / 1 test成功。
- Web全体: 467 files成功・2 files skip、3270 tests成功・2 tests skip。typecheck成功。lintはerror 0、既存`apps/web/app/consent/page.tsx`の未使用eslint-disable warning 1件。
- Database全体: 196 files / 951 tests成功。typecheck、lint成功。
- 全体typecheck: 25/25 tasksと学習UI typecheck成功。
- 全体lint: architecture check、25/25 tasks、学習UI lint成功。既存warning 1件のみ。
- 全体build: 13/13 tasks成功。Next.js production build、TypeScript検査、静的ページ生成成功。
- 変更ファイルPrettier、`git diff --check`成功。

全体`pnpm test`は未実行だが、変更対象であるWeb/Databaseの全テストを実行した。GitHub CIの全体testを最終正本とする。

## 5. 未解決事項

- 本番OpenAI設定の`requestCostUsdMicros`が0のままなら、実呼び出しの原価はUNKNOWNのままである。価格入力は本番設定変更なので別の明示承認が必要。
- 固定リクエスト原価はtoken実績に基づく精算ではなく概算である。
- cached tokenを含むtoken単価ベースの原価計算、金額Hard Stop、Provider側budget、外部通知、停止時のin-flight drainは未実装または未確認。
- OpenAIモデルは全機能共通設定であり、モデル移行は既存機能のevalを伴う別作業とする。

## 6. 次Phaseへ進める条件

本PRのレビューとCI成功後、本番で使う固定リクエスト原価の根拠を人間が確認し、本番設定変更を明示承認すること。設定反映後は新規Daily Missionのusage行で原価と価格版が保存され、UNKNOWN件数が意図どおり縮小することを確認する。

本変更だけでPilot START、参加者追加、Provider送信、実課金、production releaseを行わない。
