# AI原価可視化 production限定release

## 1. 調査した内容

production基準: `22813ae85d2bfaa0cd9412bce09bcfc2aea28e60`。release branch: `codex/release-ai-cost-observability`。

productionには学習設計レビューUIの限定release PR #1212が反映済みである。main上のPR #1214はPR #1213で追加したProvider障害と原価UNKNOWNの分離を前提とするため、次の3コミットだけをproduction基点へ適用した。

- `0c25f5c8afa97e186760ad114cb4eebd9f5267fd` PR #1213 実装・テスト・報告
- `f191d1d92c922ec32235b29d67963f39ae5d17b0` PR #1213 CI結果の報告更新
- `dc040100b2557dc3c5ad2bbdd1509a06de15180a` PR #1214 Daily Mission原価記録

main上の他コミットは取り込んでいない。該当ファイルをmainと比較すると、別PR #1191由来の`SOCIAL_PLANNER`モデル互換性指定とその境界テストだけがreleaseに含まれない。この指定は今回の固定リクエスト原価記録とUNKNOWN集計修正には必須でない。

## 2. 変更したファイル

- `apps/web/src/services/daily-mission-ai-runtime.ts`
- `apps/web/test/daily-mission-ai-runtime.test.ts`
- `apps/web/test/daily-mission-ai-runtime-boundary.test.ts`
- `packages/application/src/admin-alert-center.ts`
- `packages/application/test/admin-alert-center.test.ts`
- `packages/database/src/admin-alerts.ts`
- `packages/database/test/admin-alerts.test.ts`
- `docs/ai-training/AI_PROVIDER_ALERT_COST_OBSERVABILITY_IMPLEMENTATION.md`
- `docs/ai-training/DAILY_MISSION_COST_TELEMETRY_IMPLEMENTATION.md`
- 本報告

DB schema、migration、Provider実装、モデル、Prompt、生成内容、Pilot実行flag、本番設定は変更しない。

## 3. 主要な設計判断

mainをproductionへmergeせず、レビュー済みPR #1213と#1214の実装コミットだけをcherry-pickした。Provider障害アラートは通信・応答処理の失敗へ限定し、原価NULLは別WARNINGとする。Daily Missionの実Provider呼び出しには、管理設定の固定リクエスト原価が0より大きい場合だけ概算原価と価格版を保存する。

`DAILY_MISSION_PIPELINE`はProviderへの追加呼び出しではない内部要約なので、原価UNKNOWN集計から除外する。一方、Provider障害の分類には引き続き利用する。

## 4. 実行した検証

- 対象単体: Application 1 file / 7 tests、Database 1 file / 1 test、Web 2 files / 4 tests成功。
- 全体typecheck: production buildの生成型で25/25 tasksと学習UI typecheck成功。ブランチ切替直後はmainの`.next/types`がproductionに存在しない3ルートを参照して失敗したが、production buildによる再生成後に成功した。
- 全体lint: architecture check、25/25 tasks、学習UI lint成功。既存`apps/web/app/consent/page.tsx`の未使用eslint-disable warning 1件、error 0。
- 全体test: 高並列時に既存Database RLS検査1件と既存Web 2件が5秒timeout。Database対象を単独再実行して2/2、Web対象を単独再実行して10/10成功。変更対象テストも全体実行内で成功。GitHub CIを最終正本とする。
- 全体build: 13/13 tasks成功。Next.js production build、TypeScript検査、静的ページ生成成功。
- 変更ファイルPrettier、`git diff --check`成功。

GitHub CI結果はrelease PR作成後に確認する。

## 5. 未解決事項

- productionのOpenAI固定リクエスト原価は0のままならUNKNOWNを維持する。本releaseは本番設定値を変更しない。
- 固定リクエスト原価の根拠確認と設定変更は別の明示承認が必要。
- token単価精算、cached token、金額Hard Stop、Provider側budget、外部通知、停止時のin-flight drainは未実装または未確認。
- release PRのマージ、Deploy、production設定変更、Pilot開始、参加者登録、Provider送信、実課金は未実施。

## 6. 次Phaseへ進める条件

release PRの差分レビューとCI成功後、productionへのマージを人間が明示承認すること。マージ後のDeployについても別に明示承認を確認する。Deploy後に本番usageの新規行をread-onlyで確認し、固定原価未設定ならUNKNOWNが残ることを異常扱いしない。
