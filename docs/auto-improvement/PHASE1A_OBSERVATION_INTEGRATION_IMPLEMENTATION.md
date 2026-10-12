# 本番フィードバック統合 Phase 1-A 実装報告

## 結論・対象

2026-10-12、監査PR [#1257](https://github.com/team478a/bunshin-platform/pull/1257) のマージと「進めてください」を受け、承認対象の1-A（既存記録の読取専用統合）だけを実装した。管理画面、HTTP、Job、自動収集、外部AI分析、Issue/PR自動作成、本番反映はまだ接続していない。本人向け個別最適化とシステム修正を混同しない。

開始時・提出前確認のmainは `7e410d67f2a2dacb07aded03b36103ea6cbe0123`、productionは `e7415ad33cc1a6b17ff38c7e86028255cfe77aca`。#1257はMERGED、CI verify/databaseはSUCCESS。production反映状況の既存根拠は監査報告に記載。本PRの機能が本番稼働している証拠ではない。

作業は `codex/feedback-observation-integration-phase1a`。元のプロジェクトcheckoutの未解決変更は操作せず、専用worktreeを利用した。DB/Migration、課金、Provider、CI、デプロイ設定は変更していない。

## 調査・再利用

AGENTS、正本仕様、設計原則、ロードマップ、Decision Log、Phase 0監査と実装計画、既存Improvement Portと公開exportを照合した。

| 記録                | 再利用・追加                                       | 意味と制限                                                                                                          |
| ------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Feedback            | 既存 `PrismaImprovementFeedbackObservationAdapter` | 本人申告。バグ確定ではない。既存保持期限・権限条件を維持                                                            |
| 継続支援            | 既存 `PrismaHassySupportImprovementAdapter`        | cutoffまでの採用・完了・スキップ。legacy/不正・日時不足は未判定                                                     |
| 写真品質            | 既存 `PrismaHassyPhotoQualityImprovementAdapter`   | 記録済み固定判定。未確認・処理途中等は未判定。実際の生成品質全体を証明しない                                        |
| Missionの採否・投稿 | 新 `PrismaSocialProgressImprovementAdapter`        | 採用と本人の投稿記録を別のbooleanで扱う。文章・理由本文・URL・成果値は読まない                                      |
| 研修進捗・評価処理  | 新 `PrismaTrainingProgressImprovementAdapter`      | AI_TRAINING_V1のPARTICIPANTの課題開始・完了・回答記録・評価READY/FAILED。回答本文・個人結果・合否・スコアは読まない |

新SQLは既存管理用評価指標の限定投影とscope JOINの方式を再利用し、個人別評価結果を取得する管理指標自体は呼ばない。ブランド名による条件分岐ではなくSOCIAL/TRAININGのCapabilityで分ける。他のCapability向けの未承認実装は追加しない。

## 変更ファイルと設計判断

- `packages/application/src/service-improvement-overview.ts`：固定観測定義、既存Collector経由の統合、少数・欠測の保留、限定集計DTO。
- `packages/database/src/service-improvement-progress.ts`：原本の状態・日時だけの読取、管理権限確認、scope/関連ID再確認、limit+1、安定順序、AdapterごとのRepeatableRead。
- `packages/database/src/service-improvement-overview.ts`：明示Clientと信頼済みscopeによる構成。既存3Readerを再利用。デフォルトDB接続・Runtime登録なし。
- Application/Databaseの公開 `src/index.ts`：公開境界を追加。
- Applicationのoverview test、Databaseのprogress/overview test、隔離DB用progress integration caseと既存suite登録：負例・投影・構成の検証。
- 本報告、ロードマップ、Decision Log：境界・未完了・release単位を記録。

外部入力からAdapter登録・定義・scopeを選ばせない。将来のWeb接続側が認証、tenant/workspace/serviceとCapabilityを既存正本から解決する必要がある。既存のDB資格情報/RLSを置き換える認可機構ではない。

観測原本の内部IDはAdapterとCollector内部で必要だが、統合DTOにはuser/Bunshin/entity/source ID・本文を出さない。5人未満、固定CODE組合せの小集団、boolean集計の正例/補集合が1〜4人ならsection全体を非表示にする。0件も非表示。これは内部管理用の最小保護であり、任意期間の差分攻撃に安全な匿名公開契約ではない。外部export不可、将来UIでは読取期間・権限・監査・再識別対策を別途設計する。

読み取った原本集合の件数は母数 `RECORDED_COHORT`。登録者全体・生成試行全体の母数とは呼ばない。率は常にnull、populationCoverageとsourceEnvironmentはUNKNOWN、releaseShaと原価はnull。設定のPRODUCTIONを原本の環境証拠に転写しない。少数、上限打切り、欠測、不確かな時刻は数値0で埋めない。ストレージ障害・権限不足・scope不一致・余剰metadataは例外にし、空の成功にしない。

原本の現在の所有者/関連・保存済み日時を確認するが、削除・移管前の履歴を完全復元できない。Adapter間の一括transactionではなく `PER_ADAPTER` を明示する。合算したサービス全体の成功率、離脱率、効果の因果関係、本人能力、全生成の重複判定は未実装。

## 検証

Node 24 / repository指定pnpmを利用。本番DB・実API・顧客データは使わない。

- Application全unit：137 files / 941 tests PASS（新overview 28件を含む）。
- Database全unit：203 files / 997 tests PASS（新progress 22件、構成4件を含む）。
- cross-scope 6軸、User/Bunshin別filter、権限不足、入力の非同期変更、limit+1、日時不足、遅い更新、少数・補集合、CODE分類、余剰field、再実行の重複排除、DB失敗・外部fetch禁止を確認。
- 隔離PostgreSQL integration case追加：状態だけのSQL実行、私的本文/評価JSONの非出力、別User filter、管理権限失効。ローカルでは未実行。既存のDB preflightを通すCIで検証する。本番RLS/権限/負荷確認ではない。
- Application/Database `tsc --noEmit`、変更したコード/テストのeslint、`architecture:check`、境界テスト10件、変更ファイルのPrettier check、`git diff --check`：PASS。
- Application/Database package build（Prisma生成・コンパイル）：PASS。Web buildはローカル未実行、通常CIで検証する。
- 最終変更後の追加unit再実行：Application 28件、Database 26件 PASS。
- スマートフォン・LINE・Web E2E：UI/HTTP変更なしのため今回は実行していない。

テスト件数を利用開始可能性の代わりにしない。新SQL・実データ分布・本番の読取費用/速度・原本捕捉率は未確認。

## 残課題・次Phaseへ進む条件

1-Aのレビューと通常CI完了後、1-Bで既存管理者導線にread-only表示を接続する。環境/欠測/少数/時点の注意書きを数値と同時に表示し、認証済み合成HTTPと小画面操作を検証する。任意期間を繰り返し比較する再識別対策・権限・操作監査も接続時の条件。1-Cでログ相関・本番読取証跡の準備を分離する。Phase 2以降と外部送信は別承認。

「本番デプロイを溜めすぎず、ある程度まとめたら実施」の方針を反映し、全Phase完成を待たない。最初の実利用可能な単位を1-A + 1-Bとし、マージ・CI後にproduction基点で対象差分だけを照合して限定releaseする。1-C以降も独立して有効な単位で反映する。main全体の無条件統合、自動マージ、Migration/設定/実課金/送信/Pilotの黙示実行は行わない。

今回のrollbackは本PRのReader/exportをrevertするだけで、原本・保持処理はそのまま。UI接続後は表示接続を停止できるようにする。本番DBの自動復旧・原本削除はしない。
