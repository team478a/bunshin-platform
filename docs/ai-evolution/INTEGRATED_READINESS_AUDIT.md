# 実運用準備・AI進化対応 統合監査

監査日: 2026-10-12 JST。対象は `team478a/bunshin-platform` のハッシー、マナベルスタイル、ワタシワークス共通AI基盤、OEM運営・課金。旧 `ai-sns-agent` / `InstagramOEM` は対象外。本監査は文書・読取・ローカル合成検証のみで、アプリ、DB、Migration、本番設定、課金、送信、Pilot、モデル、Deployを変更していない。

## 経営判断

| 対象                   | 現在判定                         | 結論                                                                                                                                             |
| ---------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| ハッシー100社モニター  | **NO-GO**                        | 実装された縦フローはあるが、実AIでの個別化3条件、100社負荷・原価上限、実LINE/スマホ完走が未検証。productionにはmainの共有AI費用Admissionも未反映 |
| ハッシー少数検証       | **CONDITIONAL GO**               | 企業数・予算・担当・停止条件を限定し、本人投稿方式で実受入する場合のみ。これは100社開始許可ではない                                              |
| マナベルスタイル実受講 | **NO-GO（現在）**                | 本番に限定UI・費用Hard Stopは反映済みだが、本番APPROVE、参加者/Seat、設定、実認証、実Provider完走、停止試験が未実施                              |
| マナベル内部1〜2人     | **CONDITIONAL GO（条件充足後）** | 3件の教育方針は人間承認済み。別承認で本番登録と全Gateを実証した後に限りWave 0へ移行可能                                                          |
| EVO-01〜05             | **部分完成**                     | 比較・通信・互換・費用・再現性の安全な土台はmainにある。実API比較、全経路統一、請求照合、再実践Runtime/UI、本番配備は未完                        |
| OEM新課金              | **NO-GO（本番）**                | mainはワタシワークス全商品向けへ一般化済み。本番は#1176以降のOEM V2コード/Migrationを含まず、履歴・cutover・実請求も未実施                       |

GOはテスト数やPR数では決めない。現在値を取得していない安全条件は `UNKNOWN` のままとし、PASSへ補完しない。

## 監査基準と本番同定

| 項目           | 確認結果                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 最新main       | `31ea1d20a35052f18f272396487350c2be88b618`（#1249）                                                                           |
| 最新production | `e5812090b6779a99c09b3ae9069df5dcc43e1798`（#1219）                                                                           |
| 分岐           | merge-base `6400027cd0e041d1fe732b178aeb502546df5aff`、production固有68 / main固有100 commit。mainとproductionは別release系統 |
| tree差分       | production→mainで286 files、+26,508 / -2,212。規模は完成率を表さない                                                          |
| 公開Deployment | Vercel `dpl_ECXmvYF4CgU2nFy1g1unU8u16pDR`、target production / Ready、Git SHA `e5812090…`、公開alias `www.watashi-works.com`  |
| 稼働確認       | `/api/health/live` は `ok`、`/api/health/ready` は production / configuration・authentication・database・databaseSchemaが正常 |

healthは公開版の起動・接続・要求schemaを確認するだけで、mainの全Migration、RLS実role、業務フロー、実課金、実LINE、復旧を証明しない。main全体をproductionへ反映してはならず、対象commitとMigrationを限定したreleaseが必要。

## PR・CI

- #1188はOPEN、verify/database SUCCESS。監査案でありmainの完成機能として数えない。
- #1189〜#1199はMERGED、各verify/database SUCCESS。EVO-01〜05の段階実装。
- #1200（再現題材レビュー操作API）はOPEN、CI成功。main/runtimeへ未採用。
- #1208〜#1211で学習焦点表示・教育方針記録・承認UIを実装。#1210、#1212でproduction基点へ限定release。
- #1213〜#1219で原価可視化、Personal Learning費用Hard Stop、対象Migration runnerをproductionへ限定release。
- #1220〜#1229の共通AI費用Admission、#1231〜#1249のOEM共通商品・初期費用・返金照合・証拠UI・履歴訂正はmainのみ。
- #1249 PRのverify/databaseはSUCCESS。最新main push CI run `38193670937` もverify/databaseともSUCCESS（format、typecheck、lint、test、学習E2E、build、DB integrationを含む）。

## 実装と実利用の差

### ハッシー

企業/Service登録、Business Profile、Strategy/Pillar、Weekly/Daily、採否、本人投稿記録、成果、履歴要約、次回生成、停滞支援は接続済み。`service-generation-knowledge-loader.ts` が採否理由と投稿結果を読み、`daily-mission-generation.ts` が企業情報、日付、直近テーマ/形式、`behaviorSummary` / `feedbackSummary` / `performanceSummary` をPlannerとContentへ渡す。採用と投稿実施は別の台帳・操作である。

ただし14日シミュレーションは固定fixtureで、実モデルが「企業ごと」「日ごと」「履歴に基づく」有用な違いを出す証拠ではない。productionにはDaily原価テレメトリはあるが、#1220〜#1229の送信前費用予約・UNKNOWN時停止を含む共通Admissionはない。100社の同時数、待ち時間、DB接続、Provider rate limit、総原価、停止・復旧は未測定。

### マナベルスタイル

Goal→Plan→Assignment→本人回答→AI評価→Router→次課題、Guided Practice、履歴復元、内部Preparation、承認UI、費用Hard Stopの実装がある。productionは学習焦点表示、承認UI、原価可視化、費用Hard Stopとその対象Migrationまで限定反映済み。

人間は3Definitionの内部試験用教育方針を承認済みだが、Production `LearningDefinitionApproval` の3件APPROVEは未実施。参加者登録、Seat、Pilot開始、実Provider課金、実端末E2Eも未実施。EVO-05は比較契約・題材参照・履歴投影・レビュー保存までで、承認済み題材を新しい再実践Assignmentへ渡すBridgeと本人用UIは未接続。

### OEM・費用

mainは名称分岐を廃し、SUPER_ADMINが登録するService Product Policyでワタシワークス全商品へ対応する。Offering単位の版移行、初期費用と月額の分離、返金要照合、R/A/重複/R∪A表示、将来cutover、append-only訂正も実装済み。これらは本番利用済みではない。

AI原価は `AiUsageEvent` / Provider Admission、OEM請求人数は登録・利用期間と月次snapshotで別管理する。両者を同じ金額や人数として合算しない。Provider請求書との照合、税・為替、OEM別の完全な原価帰属は未完成。

## 今回の検証

| 検証                               | 結果                      | 限界                                          |
| ---------------------------------- | ------------------------- | --------------------------------------------- |
| Web: Hassy/学習/承認/費用 selected | 13 files / 102 tests PASS | mock/fake、実AI・実認証なし                   |
| capability-social                  | 29 files / 305 tests PASS | 企業差・履歴・停滞等の契約。100社負荷ではない |
| capability-training                | 29 files / 465 tests PASS | 学習/再現性の契約。本人能力の証明ではない     |
| Application: 原価/OEM/Admission    | 3 files / 63 tests PASS   | 純粋計算・契約                                |
| Web: AI費用/OEM管理                | 7 files / 37 tests PASS   | mock API、実課金なし                          |
| Database selected                  | 5 files / 34 tests PASS   | Prisma Client生成後に成功。実DB/RLSではない   |
| EVO-01 baseline/report             | 2 files / 35 tests PASS   | 保存fixture、外部API呼出し0                   |
| 学習スマホ合成E2E                  | 3 files / 13 tests PASS   | 390×844、模擬HTTP。本番端末/LINEではない      |

選択テスト計1,041件とE2E 13件。DBテストの初回は依存生成前で起動できず、`pnpm db:generate` 後に再実行して成功した。実API比較、実DB integration、100社負荷、実請求、実送信は行っていない。

## 最優先3項目

1. **P0: 本番安全条件の読取確定** — 採用SHA、全Migration履歴、RLS/接続role、最新Backup/復旧、設定、Pilot/Seat/APPROVE、AI価格・予算・停止担当を証拠化する。
2. **P0: 少数の実縦フロー受入** — 別承認後、ハッシー少数社とマナベル内部1〜2人をスマホ/LINEまたは提供条件どおりに完走し、保存復元、越境なし、費用、停止を確認する。
3. **P0/P1: 発見した利用不能点だけ修正** — 認証・分離・重複・誤合格・費用超過をP0。ハッシー個別化品質とマナベル再実践Bridge/UIをP1として、再現証拠に基づき小PR化する。

既存成果を重複開発せず、安全条件と実完走が揃った範囲から限定利用へ移す。監査PR後は本番操作や実装へ自動継続しない。
