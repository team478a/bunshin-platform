# SOCIAL Decision ReBrief — 既存Generationによる運用準備

## 状態

2026-10-04 JST。Decision ContextとreBriefは本番Daily Mission生成コードへ接続済みだが、本変更では実AI、本番deploy、実課金APIを実行しない。新しいAgent、Memory、Analytics、テーブル、migration、UI、通知、画像・動画生成、SNS自動投稿も追加しない。

## 1. 調査した内容

- Daily Mission生成失敗は既存 `DailyMissionGeneration.errorCategory` に80文字以内の分類を保存できる。
- Provider障害は既存 `AI_PROVIDER_*`、改訂後の最終品質失敗は既存 `DECISION_REBRIEF_FAILED` として区別済み。
- Decision ContextがREADYでない場合はProvider呼出し前に停止していたが、要レビューと明示ブロックのどちらも `CONFLICT` だけで保存され、運用上区別できなかった。
- `UNKNOWN` はnormalizerの公開statusでは安全側の `BLOCKED` となる。安全条件を推測してPASSEDへ変える経路はない。

## 2. 変更したファイル

- `packages/capability-social/src/social-decision-planner.ts`: READYでないDecision Contextへ固定・非機密の失敗分類を付与。
- `packages/capability-social/test/social-decision-planner.test.ts`: UNKNOWNとBLOCKEDのfail-closed、分類、Provider未呼出しを検証。
- `apps/web/test/daily-mission-provider-diagnostics.test.ts`: 既存Generation保存境界が分類だけを取り出すことを検証。
- `docs/hassy/HASSY_DECISION_REBRIEF_PRODUCTION_CONNECTION.md`: マージ・CI状態と次条件を現在化。
- `docs/DECISION_LOG.md`: 既存Generationによる運用分類の判断を記録。

## 3. 主要な設計判断

- 証跡不足のUNKNOWNまたは安全境界以外の要レビューは `DECISION_CONTEXT_REVIEW_REQUIRED`、入力で明示されたBLOCKEDは `DECISION_CONTEXT_BLOCKED` とする。どちらも既存Generationを失敗にし、Providerへ進めない。normalizerのfail-closedな公開statusは変更しない。
- 境界のUNKNOWN値はUNKNOWNのまま保持する。aggregate statusでは安全側のBLOCKEDとして停止するが、明示的なBLOCKEDとは運用分類を分ける。自動再試行や自動解除は追加しない。
- 分類は固定文字列だけとし、missing input、review reason、自由入力、内部ID、本文を `errorCategory` へ保存しない。
- 新しい集計、画面、通知、Analytics基盤を作らない。既存レコードを安全に数え分けられる状態までを本変更の範囲とする。
- 成功時のDecision revisionは既存Generation Context Snapshot、失敗時の分類は既存Daily Mission Generationを正本とし、重複した履歴保存を追加しない。

## 4. 実行した検証

- Social Decision Planner対象test: 1ファイル、16件成功。
- capability-social全体test: 29ファイル、305件成功。
- WebのGeneration失敗分類対象test: 1ファイル、7件成功。
- `pnpm format:check`: 成功。
- `pnpm typecheck`: 25 / 25 task成功。
- `pnpm lint`: architecture check成功、25 / 25 task成功。既存の `apps/web/app/consent/page.tsx` にunused eslint-disable warning 1件のみ。
- `pnpm test`: architecture test 10件と25 / 25 task成功。database 186ファイル／828件、web 434ファイル／2,791件成功。webのlive test 2件は既存のskip。
- `pnpm build`: 13 / 13 task成功。
- `git diff --check`: 成功。
- fake Providerとin-memory fixtureだけを使用し、実AI、実DB接続、実課金API、本番deployは使用しない。

## 5. 未解決事項

- 本番におけるUNKNOWN、BLOCKED、reBrief最終失敗の発生率は未確認。分類追加だけから品質改善や成功率を推測しない。
- レコードの閲覧・集計UI、通知閾値、再実行運用は未定義。本変更では追加しない。
- 実Provider出力の品質比較と費用評価には別の明示承認が必要。

## 6. 次Phaseへ進める条件

1. 本変更の人間レビューとCI成功を確認する。自動mergeしない。
2. UNKNOWN／BLOCKEDがProvider呼出し前に停止し、固定分類以外の内容がGenerationへ保存されないことを維持する。
3. 本番deploy、実AI評価、課金変更、運用UI・通知が必要な場合は、目的と安全条件を分けた別作業として明示承認を得る。
