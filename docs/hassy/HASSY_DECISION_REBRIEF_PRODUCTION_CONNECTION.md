# SOCIAL Decision ReBrief — Daily Mission生成境界接続

## 状態

2026-10-04 JST。積み重ね元のPR #1119と、接続変更をmainへ回収したPR #1121はマージ済み。mainのmerge commitは `c3c0a7571dedf0ca4851e635681d65abb0c7e3a0` で、post-mergeのverify／database CIも成功した。reBriefを最大1回、再品質検査、最終fail-closed、quota／Usage冪等suffix、revision snapshot付きで既存Daily Mission生成境界へ接続済み。

新しいAgent、Memory、Analytics、テーブル、migration、UI、課金、画像・動画生成、SNS自動投稿は追加しない。merge、本番deploy、実課金API、実AIは実施しない。

## 1. 調査した内容

- Daily Mission生成は既存Generation claim後に、通常Brief、Memory選択、本文、品質検査、MissionとGeneration Context Snapshotの同一transaction保存を行う。
- quota予約とAI Usageは同じ `usageIdempotencyPrefix + suffix` を冪等キーとして使う。reBriefと改訂本文が既存suffixを再利用すると、段階を区別できない。
- Decision Contextのtrusted precheckはBrief前にauthorization、Capability、ownership、Service参加／法的同意を確認し、safety/legal不明をUNKNOWNで停止する。
- 既存Snapshotのdecision blockはDAILYだけを許可し、初回BriefとreBriefの関係、trigger、最終品質を保持できなかった。
- 改訂Briefでtopic／angle／personalization sourceが変わるため、初回Briefから選んだMemoryと本文入力をそのまま使ってはいけない。

## 2. 変更したファイル

- `apps/web/src/services/daily-mission-decision-content-orchestration.ts`: 初回生成、1回のreBrief、改訂後再生成を統括。
- `apps/web/src/services/daily-mission-rebrief-runtime.ts`: trusted boundary再照合、専用Provider、quota／Usage、finalize、revision参照生成。
- `apps/web/src/services/daily-mission-quality-pipeline.ts`: decision stage／attemptと段階別suffix、改訂後の最終fail-closed。
- `apps/web/src/services/daily-mission-generation.ts`: 本番Daily Mission生成境界へ接続し、改訂BriefからMemory／personalization／本文／品質入力を再構築。
- `packages/application/src/generation-context.ts` と既存保存adapter: 任意のreBrief revision metadataを既存Snapshotへ保存・検証。
- 関連fixture、boundary test、Decision Log、本書を更新。

## 3. 主要な設計判断

- 対象外Serviceは従来どおり本文repairを最大2回行う。READY Decision Context対象だけreBrief orchestrationを有効化する。
- 初回REVISE／本文検査issueだけreBriefを1回許可する。初回REJECT、改訂後のREVISE／REJECT／重複／作成指示露出は保存前に停止する。
- 通常Brief／初回本文の既存suffixは変えず、reBriefを `decision-rebrief:1`、改訂本文・品質を `rebrief:1:content:*`／`rebrief:1:quality:*` とする。quotaとUsageは同じsuffixを使う。
- reBrief時点で元のtrusted boundaryをpure契約へ再入力し、4条件すべてPASSEDの場合だけProviderへ進む。UNKNOWNを補完しない。
- Snapshotには原文を重複保存せず、元／改訂decisionの固定順JSONから作るSHA-256参照、policy／Prompt／model、trigger、最終品質を保存する。digestは匿名化ではない。
- Missionとrevision metadataは既存CreateDailyMission transactionで一緒に保存する。最終品質失敗時はどちらも保存せず、既存Generation行へ `DECISION_REBRIEF_FAILED` を記録する。

## 4. 実行した検証

- application Snapshot対象test: 5件成功。
- web orchestration／runtime／品質／boundary対象test: 12ファイル、36件成功。
- web／application対象typecheck: 成功。
- `pnpm format:check`: 成功。
- `pnpm typecheck`: 25 / 25 task成功。
- `pnpm lint`: 25 / 25 task成功。既存の `apps/web/app/consent/page.tsx` のunused eslint-disable warning 1件のみ。
- `pnpm test`: 25 / 25 task成功。application 126ファイル／694件、web 434ファイル／2,789件成功。web live test 2件は既存のskip。
- `pnpm build`: 13 / 13 task成功。
- architecture checkおよびarchitecture test 10件: 成功。
- `git diff --check`: 成功。

検証中、生成境界の責務変更により古い変数名／直接呼び出しを期待するboundary test 2件の不一致を検出した。現在のorchestration境界を検証するようtestを更新し、上記の全検証で成功を確認した。

fake Providerとin-memory fixtureだけを使用した。実AI、実DB接続、Storage、通知、課金、本番deployは使用しない。

## 5. 未解決事項

- 実Provider出力による品質改善とUNKNOWN発生率は未確認。実AI評価には別の明示承認が必要。
- request IDを変えた利用者再実行は既存Daily Mission Generation claim／失敗復旧方針に従う。本PRは既存課金モデルや再実行商品の意味を変更しない。
- revision digestは内容同一性の内部参照であり、原Briefを復元する証拠や匿名化保証ではない。
- 運用UI、通知、自動merge、本番deployは追加しない。

## 6. 次Phaseへ進める条件

1. 後続変更でも、合成fixtureによる最大1回、再品質検査、最終失敗状態、段階別quota／Usage key、Snapshot atomicityを維持する。
2. 既存Generationの失敗分類だけを使い、Decision Contextの要レビュー／明示ブロックとreBrief最終失敗を運用上区別できるようにする。新しいAnalyticsやUIは追加しない。
3. 実AI品質評価、本番反映、課金変更が必要な場合は別途明示承認を得る。

## 停止・切り戻し

本番生成からorchestration呼出しを外せば従来のDecision Context fail-closed guardへ戻る。revision blockは任意JSONで旧Snapshot互換を維持し、schema／migrationの切り戻しはない。
