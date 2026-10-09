# EVO-01 AI Model Quality Baseline & Evaluation Foundation

## 基準・範囲

2026-10-09。main基準 `5b4957f1f2a983aa571ebd72d73ec4d67c3bbe84`。
branch: `feature/ai-evolution-evo01-quality-baseline`。
実行コードcommitは保存reportの`codeCommit`、実行対象ファイルの内容は`sourceDigest`で固定する。最終提出commitはPRのHEADを参照する。

参考監査PR #1188（監査版 `41daf16848308051baa548384855b8594eb2b8b2`）の6文書を参照した。着手時は未マージ、最終確認でもOPEN、verify/databaseはSUCCESS。監査基準と実装基準mainは同一で、対象Runtimeに差分はない。このPRには監査文書を複製せず、監査PRのmergeも行わない。

EVO-01は合成入力と固定された模擬Provider出力を使うオフライン回帰評価である。実モデルの品質評価、実認証、本番Pilotの動作確認ではない。外部API・DBへ接続しない。

## 構成と再利用

| ファイル                                      | 責務                                                  |
| --------------------------------------------- | ----------------------------------------------------- |
| `apps/web/test/ai-evolution/dataset.ts`       | 合成24ケース、期待結果、有限の入力/出力oracle         |
| `apps/web/test/ai-evolution/evaluator.ts`     | 実Adapter・既存検証の実行、版・digest・結果・比較契約 |
| `apps/web/test/ai-evolution/report.ts`        | JSON/Markdown排他的保存、人間レビューの追記           |
| `apps/web/test/ai-evolution-baseline.test.ts` | ケース実行、外部fetch禁止、任意レポート保存/比較      |
| `apps/web/test/ai-evolution-report.test.ts`   | 再現性・版差・改ざん検出・履歴/レビュー保存テスト     |
| `package.json`                                | `test:ai-baseline`追加のみ                            |

再利用した実装:

- Daily: `OpenAIDailyMissionPlanner`、公開`normalizeMissionContent`、`inspectDailyMissionContent`の重複品質Gate。
- Weekly: `OpenAIWeeklyPlanner`と`GenerateWeeklyPlan`の形式・日付・pillar等の検証。
- Assessment: `OpenAiTrainingAnswerEvaluator`、既存Skill評価ルール、`definePracticeCompletion`による能力/成果物品質UNKNOWNの分離。
- 各Adapterの現行Prompt version定数を直接参照する。Provider fetchだけを明示的に差し替える。

既存`packages/capability-social/src/golden-dataset.ts`も確認した。TrendSearch専用契約でcost/latencyの数値を前提にするため、今回の3タスク・未測定契約へ無理に流用しない。既存機能を統合・削除・汎用化しない。

DailyのBrief形式にはテスト専用schemaを追加した。これは本番生成仕様の変更ではない。語句制約・280文字比較はfixture専用oracleであり、一般的な事実確認・自然言語の品質判定器ではない。

## 固定評価データ

| タスク        | ケース数 | 主な観点                                                                                                 |
| ------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| Daily Mission | 7        | 企業整合、情報不足/創作、長文不採用履歴、完全重複、別利用者混入、個別差、形式不正                        |
| Weekly Plan   | 7        | NO_DATA、未測定成功の捏造、目標変更/旧目標、別利用者混入、日付重複、Dailyとの題材整合                    |
| Assessment    | 10       | 正答/部分正答/誤答、誤PASS、回答不足/評価なし、不正score、別受講者混入、AI成果物≠本人能力、レベルUNKNOWN |

すべて架空の企業・受講者・回答・履歴。顧客データの匿名化処理ではなく、ゼロから作った合成データである。回答や生成出力の本文はレポートへ複製しない。

期待する危険出力を含む負例は`observed=FAIL`のまま記録する。その違反を検出できれば`testResult=PASS`になる。負例FAILの件数はモデルの失敗率ではない。

## 結果・比較契約

`EVO01_REPORT_V1`は評価ID、サービス/タスク、commit、dirty状態、source digest、model label、Prompt版、評価/Skillルール版、dataset版/内容digest、日時、各検査/失敗理由、未測定項目、人間レビュー待ちを保存する。

`executionMode=OFFLINE_SYNTHETIC`、`externalCalls=0`。現行`gpt-5.2`は模擬requestの識別ラベルであり、本番モデル設定や実呼出しの証拠ではない。

必須検査は出力形式、fixtureのデータ混入/未確認事実、重大誤PASS、UNKNOWN、既存品質Gate等。比較検査はfixtureの具体性・履歴/個別差・長さ等。Adapterに認可やPilot Gateを捏造して追加せず、別の既存HTTP/worker回帰で維持を確認する。

応答時間、token、API原価、Providerエラー率、実モデル品質、本番tenant分離、実認可/契約/Pilotは未測定。`releaseVerdict=UNKNOWN`を固定し、模擬PASSを公開承認にしない。

同一評価IDへの保存はEEXISTで拒否する。reviewは別ファイルへ追記し、対象reportの評価ID/digestを結び付ける。元reportは上書きしない。レビュー権限/署名付き承認システムではなく、手動レビュー記録のファイル契約までである。

dataset版/内容、評価/Domainルール、ケース集合、実行モードが違えば`INCOMPARABLE`。同条件なら観測結果/checkの差とmodel/Prompt/code変更を返す。品質・原価結論はUNKNOWN。保存JSONの入力validationと件数・結果整合を確認する。

## 実行手順

Node 24、pnpm 10、インストール済み依存を使用する。API keyもDB URLも不要。

```powershell
pnpm test:ai-baseline

# 明示した場合だけappend-only report.json / report.mdを書き出す
$env:AI_BASELINE_OUTPUT_DIR='docs/ai-evolution/evo01-results'
pnpm test:ai-baseline

# 比較対象は保存済みreport.json（実際の評価IDへ置き換える）
$env:AI_BASELINE_COMPARE_WITH='docs/ai-evolution/evo01-results/<evaluation-id>/report.json'
pnpm test:ai-baseline

Remove-Item Env:AI_BASELINE_OUTPUT_DIR -ErrorAction SilentlyContinue
Remove-Item Env:AI_BASELINE_COMPARE_WITH -ErrorAction SilentlyContinue
```

通常のunit test/CIは評価履歴を自動更新しない。fixture/rule変更時は版を更新し、比較不能の場合は人間が新baseline採用をレビューする。同一モデル別Prompt/別モデル同一Promptの識別をテストしているが、実モデル比較は未実施。

## 検証

- 新評価基盤: 2ファイル35テスト成功、24合成ケースの期待判定一致、外部fetchゼロ。
- capability-training: 25ファイル288テスト成功。
- capability-social: 29ファイル305テスト成功。
- Web関連回帰: 11ファイル79テスト成功（Daily/Weekly/Assessment Adapter、Daily品質/履歴、Weekly生成、Pilot HTTP、AI worker、Call Admission、LINE隔離）。
- 合計67ファイル707テスト。実Provider、実認証、本番DB、実PilotのE2Eは実施していない。
- architecture boundary check、全体typecheck、変更ファイルlint、全体format:check成功。
- 全体`pnpm test`も試行したが、既存`daily-missions`の2ケースと`public-rls-schema`の1ケースが5秒timeout。Web全体は他Packageの失敗で完走せず、全体成功とは判定しない。該当ファイルを単独再実行するとDaily 10件/RLS 2件とも成功。既存の時間制限やコードは変更していない。CIの全体結果は別確認する。

保存baseline: [report](evo01-results/evo01-f25f255e-fa1a-4a34-b7f1-a62f3863fdd6/report.md) / [JSON](evo01-results/evo01-f25f255e-fa1a-4a34-b7f1-a62f3863fdd6/report.json)。実行コードcommit `41564497fbd22ba0b5d019664d7c5d846dd3be23`、dirty=false、24ケースの観測PASS/FAIL/UNKNOWN=10/13/1、期待外れ0。後の文書/結果追加commitとは分けて記録する。別の追記実行をOS一時ディレクトリに保存してこのJSONと比較し、COMPARABLE/変更0（品質・原価UNKNOWN）を確認した。元baselineは上書きしていない。

危険な高score固定出力を既存Adapterへ注入した負例で誤PASS検出を確認した。これは実モデルが同じ誤判定をした証拠ではなく、評価oracleが拒否できることの証拠である。

## 影響・停止条件

変更はテスト・script登録・文書のみ。アプリケーションsrc、公開Package契約、Provider設定、モデル、DB/schema/migration、Memory、OEM課金、Pilot制御、LINE、既存生成/評価仕様は変更しない。新しいAI処理や自動merge/deployはない。

rollbackはこのPRのテスト・文書・script追加をrevertするだけで、DB操作は不要。EVO-02へ自動着手しない。限界と次工程は`EVO02_HANDOFF.md`を参照する。
