# 実運用準備・AI進化対応 統合監査

## 結論と監査境界

監査日: 2026-10-09 JST。対象は `team478a/bunshin-platform` のハッシー、マナベルスタイル、共通AI基盤、OEM。旧 `ai-sns-agent` / `InstagramOEM` は対象外。

- 基準main: `9e0db97a51b15cacd8e2c95f328cfabeff3d32ee`（#1199）。専用branch: `codex/integrated-operation-readiness-audit`。
- 公開URL `https://www.watashi-works.com` の実Deployment: `dpl_EtS1L7qyt1vPgDKpXXayrzifn4Se`、Vercel `bunshin-platform-web`、production / READY、SHA `d86115c7e1952c47fd56af77a4f44fd87933b48a`、branch `production`。作成日時 `2026-10-09T00:20:18.305Z`。
- `vercel inspect` で公開aliasを特定し、認証済みGET `/v13/deployments/{id}` の `gitSource.sha` / `meta.githubCommitSha` 一致を確認。GitHub deploymentの環境名だけを本番反映証拠にはしない。
- main / productionは **DIVERGED**。選択リリースのため、祖先判定だけで未配備としない。tree差分と各経路を確認する。
- 本番GET `/api/health/live`: `ok`、`/api/health/ready`: `ready` / production / configuration・authentication・database `ok` / databaseSchema `current`。これは稼働版が要求する最新Migrationの存在チェックであり、mainの全Migration・RLS・実認証完走・学習可能性の証明ではない。

今回変更するのは監査文書のみ。顧客データ、環境変数値、Secret、相談・回答・成果物本文は取得しない。本番DB接続、Migration、Deploy、設定変更、送信、実課金、モデル比較API、Pilot操作、ユーザー登録を実行しない。

## 実運用判定

| 対象 / 提供範囲                  | 判定           | 利用可能な実装                                                         | 利用開始条件 / 制限                                                                                                         |
| -------------------------------- | -------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| ハッシー100社一括モニター        | NO-GO          | 企業情報→Daily/Weekly→採否→本人投稿記録→次回入力、停滞支援             | 100社の処理能力・原価、実生成の3条件、LINE/mobile・実認証の受入証拠がない。確定不具合を意味する判定ではなく、開始条件未充足 |
| ハッシー少数・限定検証           | CONDITIONAL GO | 上記既存フローを再利用可能                                             | 対象と予算・監視・停止担当を限定し、実フローを別承認で検証。自動SNS投稿代行ではない                                         |
| マナベルスタイル限定Wave 0       | CONDITIONAL GO | 既存3Definitionの相談→Goal/Plan→課題→回答→評価→Router、Guided Practice | 実設定・承認・Seat・原価制御・復旧証拠の確認後のみ。現時点で開始承認ではない                                                |
| 全テーマ・再現性保証付き研修     | NO-GO          | 再現性比較の純粋契約、版付き参照、読取・レビュー監査                   | 再実践Assignment Bridge・本人UI・実比較は未接続。画像/動画/自動化等の未対応テーマはGapのまま                                |
| EVO-01〜04を使った本番モデル変更 | NO-GO          | オフライン比較、限定通信/互換性、安全な原価照合契約                    | 実API品質/原価比較、候補承認、配備、切戻し確認は未実施。新モデルに切り替えない                                              |
| #1176登録課金V2の本番利用        | NO-GO          | mainに履歴・人数計算・動的料金UI                                       | 本番コード未配備。DB履歴・RLS・復旧・初期履歴・将来cutoverの承認が必要                                                      |

GOにはコード・合成テストだけでなく、利用範囲に対応した実環境証拠が必要。UNKNOWNをPASSで補わない。

## 調査・仕様照合

AGENTS、`docs/BUNSHIN_PLATFORM_CODEX_SPEC_V1.md`、Architecture Principles / Decision Log、既存サービス・Personal Learning・OEM報告、#1188の6監査文書、EVO-01〜05の実装報告と現行コードを参照。既存のWorkspace/User/Bunshin/Service分離、Learning First、Program Runtime、Provider Adapter、MVP Firstを維持する。

| 項目         | 最新コードを優先した差分                                                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1188        | OPEN / verify・database SUCCESS。監査head `41daf16848308051baa548384855b8594eb2b8b2` を読取ref `origin/audit-1188` で確認。6文書はmain反映済みとは扱わない |
| #1189〜#1192 | MERGED / 各verify・database SUCCESS。#1188時点の通信・互換性・原価のGapは部分的に解消。全Gatewayや本番モデル比較の完成ではない                             |
| #1193〜#1199 | MERGED / 各verify・database SUCCESS。契約→Privacy→Draft参照→履歴投影→レビュー記録まで。課題提示・本人UIの完成と区別                                        |
| #1200        | OPEN / verify・database SUCCESS（今回確認時）。管理HTTP接続候補だが基準mainの実装・成果には含めない                                                        |
| #1176        | MERGED / verify・database SUCCESS。production treeにはV2実装がない。Migrationが未適用かはDBを確認していないためUNKNOWN                                     |

PR/CIはGitHub CLIの `state` / `mergeCommit` / `statusCheckRollup` を確認。main CI run `37898282390` はSUCCESS。各PRのリンクと詳細は[AI実装状況](AI_EVOLUTION_IMPLEMENTATION_STATUS.md)、[OEM・本番差分](OEM_PRODUCTION_GAP.md)を参照。

## 本番で確認できたこと / 未確認

| 分類               | 証拠と限界                                                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 今回の実環境読取   | 公開alias、Deployment SHA / READY、health GET。DB・Provider業務処理や認証ユーザー操作は実行しない                                                                                               |
| コード上の本番配備 | production treeに既存Daily/Weekly、Pilot API/UI、Goal/Plan/Router、Gate、Hard Cap、Admission、Profile/内部準備、LINE会員導線が存在。主要Pilotファイルはmainとのtree差分なし。利用設定の成立は別 |
| 未配備             | EVO-01〜05、#1176料金/登録課金V2、mainのMigration runner変更。全mainの一括配備を推奨しない                                                                                                      |
| UNKNOWN            | 現在のDB接続先とrole、全Migration/失敗履歴/catalog/RLS、現在Backup/復元整合、Pilot ON/OFF、Seat/承認件数、Provider設定値・限度、実原価・負荷、実LINE/スマホ完走                                 |
| 過去証拠           | 過去監査のSupabase project、Backup COMPLETED、隔離復元COMPLETED、cron観測は時点付き参考。現在の復旧PASS・送信成功・フロー完了へ転用しない                                                       |

`checkDatabaseReadiness` は `packages/database/src/bunshin-personality.ts`。匿名healthの `databaseSchema: current` を全台帳/RLSの検証結果と表現しない。

## 今回実行した検証

すべて基準mainのローカル合成データ / fake Provider / mock Repository。ブラウザー実E2E、実DB integration、負荷試験、実API品質比較は未実施。

| 実行                         | 結果                | 検証対象 / 限界                                                                                                                                          |
| ---------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| web selected 14 files        | 215 PASS            | EVO01 baseline/report、Hassy Goal差分、Weekly、task互換・通信、Pilot API/component/Admission/worker/Provider境界/LINE隔離/operation                      |
| capability-social全体        | 29 files / 305 PASS | Mission採否・投稿・Decision/Weekly・停滞ルール。実生成/送信ではない                                                                                      |
| capability-training全体      | 29 files / 465 PASS | P1契約・相談・Router・Guided Practice・再現性・Draftレビュー。本人能力の実測ではない                                                                     |
| application selected 6 files | 127 PASS            | 原価照合、OEM人数、Plan/永続化/Admission/Operationsの契約                                                                                                |
| web selected 8 files         | 45 PASS             | 履歴要約、停滞scheduler/LINE除外、OEM API/export、Profile UI、AI Call観測。`daily-mission-generation.test.ts` は存在せず実行対象外（追加したと扱わない） |
| database selected 7 files    | 68 PASS             | 履歴読取、レビュー監査、内部本人Privacy、Profile、AI Call、停滞、旧請求。DBモックであり本番RLS証明ではない                                               |

追加のweb 6 files / 33 testsもPASS。Assessment Adapter、Daily失敗・環境境界、会員LINE状態/診断、AI Training LINE通知境界を検証した。合計1,258 tests PASSは範囲記録であり完成率ではない。

実行再現コマンドと受入条件は[NEXT_ACTION_PLAN](NEXT_ACTION_PLAN.md)。合成出力の品質PASSも本番モデルの品質保証ではない。

## 次の判断

最優先は追加基盤の開発ではなく、(1)本番適合・復旧・隔離の証拠確定、(2)少数実フローと個別化/復元/費用の受入、(3)証拠から判明した利用不能点だけの最小修正。再現性R3/R4は研修の成果確認を強化するP1で、既存3Definitionの安全なWave 0開始に全EVO完成を要求しない。

今回の監査PR提出後に停止。実装、配備、実ユーザー検証・Pilot開始はそれぞれ別指示を待つ。
