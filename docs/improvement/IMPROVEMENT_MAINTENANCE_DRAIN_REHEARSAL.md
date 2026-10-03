# Feedback maintenance: 非本番の停止・drain条件の再現

## 結論

2026-10-04 Asia/Tokyo、PR #1105 merge後の最新main **`5c68929035ba603c07b8f2cb2d90546865742d74`**を基準とする。branch: `codex/improvement-maintenance-drain-rehearsal`。#1105 head `42ad91e37a07033d842835e1cb368d0afc926335`のverify/database SUCCESSを確認した。前回ローカルlintも終了コード0（25 tasks成功、既存consent pageのwarning1件）を確認し、前回の「確認中」と区別する。

今回のゴールは、**既存run/workerの現行挙動とdrain誤判定条件を再現し、既存DB preflight試験と照合すること**。本番停止方式の実装・保証ではない。`drained: true`、HTTP200、lease期限経過のどれも単独では全体停止の証拠にならないことをテストで確認する。本番停止gateは未完、NO-GOを維持する。停止guardや新しいqueue/Workerを先回りして追加しない。

変更はテスト1ファイルと文書のみ。アプリ/API/Job/Repository、schema/migration、依存/lockfile、CI/CD、本番設定は変更しない。課金、実生成、Auth/Storage/LINE/SNS、実ユーザー情報、本番DB/資格情報、merge/deployは使用・実行しない。

## 実コードの意味

| 根拠                                                                     | 確認した意味                                                                                   | 停止判定に使えない解釈                           |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `apps/web/src/http/job-worker.ts` / `jobWorkerResponse`                  | Cron認証後、retention.schedule→worker batch→credit expiry。runのGET/POST両方が副作用工程へ接続 | schedule endpointを呼ばなければretentionも止まる |
| `packages/application/src/job-worker.ts` / `RunJobWorkerBatch.execute`   | claim nullで当該summaryのdrained=true。他の実行を照会しない                                    | 全実行・transactionが終了した                    |
| 同workerのawait/時間上限                                                 | 時間上限はloop条件で、待機中executorを中断するtimerではない                                    | 25秒/lease5分でprocessが停止する                 |
| 同workerの例外catch                                                      | infrastructureFailuresを加算して次のclaimへ進む。nullならdrained=true                          | drained=trueなら例外なし/Job終端確定             |
| `packages/database/src/automation-jobs.ts` / `PrismaJobRepository.claim` | LEASEDかつ期限超過は再claim候補                                                                | lease切れをcancel/drain完了と扱う                |
| `apps/web/src/http/mission-scheduler.ts` / `missionSchedulerResponse`    | scheduleとrunは別の認証済み呼出し口                                                            | schedule側だけの停止で全入口を覆う               |

## 再現テストと範囲

実`jobWorkerResponse`と実`RunJobWorkerBatch`を接続する。claim/executor/retention/creditは注入Port、DBやProviderではない。外部fetchを即失敗させ、終了時にglobal/envを復元する。configured factoryは全て置換し、実DB/Provider factoryを構築しない。順序はPromise barrierで制御し、sleep・偶然の並列実行を使わない。

| ID  | イベントとassertion                                                                                                                                       | 判定                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| D1  | 正常Cron認証のGET/POSTを直接runへ。各retention→claim→expiry、HTTP200/drained=true。schedule routeは呼ばない                                               | 現行経路を再現。scheduleだけの停止ではrunを防げない |
| D2  | 1件目executorをbarrierで保留。2件目のempty claimはdrained=true、1件目は未settled/active1。注入時計をfixture lease後へ進めてもactive1。明示release後に終了 | バッチsummary/lease時間だけによる全体停止判定は未達 |
| D3  | 1件目をretention内で保留（claim前）。2件目はempty batch/drained=trueでもpendingRetention1                                                                 | LEASED=0だけではclaim前の処理を検出できない         |
| D4  | executor例外→次claim null。HTTP200/drained=true/infrastructureFailures1、fixtureはLEASEDのまま                                                            | HTTP200/drainedだけで成功・停止を判定できない       |

根拠: `apps/web/test/improvement-maintenance-drain-characterization.test.ts`の4つの`characterization:`テスト。危険な挙動を理想の仕様として固定したものではない。後続の停止guardの回帰試験は「認証後・retention/claim/expiry/factory前に拒否」の別assertionを追加する。今回のsummary意味のテストは引き続き残す。

D2のleaseとD4の保存状態はfixtureだけ。実DBのreclaim、lease fence、expire後commit、外部副作用の成否をこのfakeから証明しない。D3のretention保留は実DB transactionを起動しておらず、delete commitを模擬保存して合格させるものではない。**実HTTP server/Next/host ingressの全経路停止も今回の試験対象外**。テストcallerを止めることやbarrier releaseをVercel停止機能と同一視しない。

## 使い捨てDB・preflight

Windows / Node24.21.0 / pnpm10.10.0 / Vitest4.1.11 / cached PostgreSQL16。最初のrun `d0a41b7c9e02`はDB接続構成の段階で失敗。最終run `d0a41b7c9e03`、DB `bunshin_disposable_d0a41b7c9e03`、task label `bunshin-maintenance-rehearsal-d0a41b7c9e03`でやり直した。

- 初回container `eed1e161eaf45b83ec115606a4f93f4b91c033f5a2a6ac07865c35efbeea9287`、internal network `bb370a226ad7ea562f8d0221955bcc00ed8730f750f9785abec5e68727942185`。internal networkのDBを直接hostへpublishする構成でPrismaの`Schema engine error`/exit1。実DB読取で`_prisma_migrations`不存在を確認し、DB統合試験を開始せず、完全ID/label照合後に当該資源だけ除去した。詳細なengine/network原因は未確定であり、DB不具合や本番不具合と断定しない。
- 最終DB `553adecebf59c28bc67fe07a1514c70f63afe554206f47900ddbb748e17baecf`、gateway `85a5ae65f7ae6e38d6540f525b05743d845a1657b89deb2f8ac8164faa4163d6`。private internal network `9c093a67244e42edbcd25e92b4b1be72c8816a534ebdceb6d8c73c16708a3706`、edge network `bf524308b5a1184a8ded90ef289eee02a1c86851b77395707054aed55dfc1619`。`--rm --pull never`、cached公式Node24 gatewayを既存test helperの固定`db:5432`転送だけに使用。host公開は127.0.0.1:18998だけ。DBはhost bind/shared volumeなし、gatewayはhelper1ファイルのreadonly mount/read-only/cap-drop/no-new-privileges。Auth container/18999 publishはなし。
- ID/label/publish/live DB名を照合し、新しい空DBへ作成者がrun markerを設定。`shobj_description`で一致確認。最初の確認SQLは非共有object用`obj_description`でNULLを返したためmarker未確認と扱い、正しい共有object queryで確認してからmigrationへ進めた。
- process限定の両URLを同一の合成loopback接続へ設定。既存226 migrationを適用する。統合fixture前の既存`integrationDatabaseTarget`/`verifyIntegrationDatabase`を維持する。markerやURL一致は悪意ある実行者への認可ではない。
- 既存`improvement-retention-jobs.integration-cases.ts`の`actual migration preflight and UPDATE detach only valid legacy purge; malformed legacy row rolls back`は、採用SHAの実migrationからDO/UPDATE部分を読む。rollback-only隔離txでlegacy正常・通常actor維持、不正correlation拒否、制約/trigger復元を確認する。DDL一部の解除はこの合成tx内だけで全rollback。**全旧schema→全migrationのupgrade rehearsalや本番preflightではない**。
- 任意の本番SQLやmigration判定コピーを新規追加しない。既存DB統合の所有境界、保持期限、lease、retirement、履歴cleanupも同じ使い捨てDBで回帰確認する。

## 実行コマンドと結果

```text
pnpm --filter web exec vitest run test/improvement-maintenance-drain-characterization.test.ts test/job-worker.test.ts
pnpm --filter web typecheck
pnpm --filter web exec eslint test/improvement-maintenance-drain-characterization.test.ts
pnpm --filter @bunshin/application exec vitest run test/job-worker.test.ts
pnpm --filter @bunshin/database exec vitest run test/integration-database-preflight.test.ts
# 完全ID/label/空のDB名/marker照合後、process限定の合成URLで:
pnpm --filter @bunshin/database db:migrate:deploy
# NODE_OPTIONSに既存loopback専用guardの絶対pathをprocess限定で設定:
pnpm --filter @bunshin/database exec vitest run test/database.integration.test.ts
# 対象範囲だけの確認（全体試験とは分ける）:
pnpm --filter @bunshin/database exec vitest run test/database.integration.test.ts -t 'feedback retention existing Job isolated PostgreSQL'
pnpm architecture:check
pnpm exec prettier --check apps/web/test/improvement-maintenance-drain-characterization.test.ts docs/improvement/IMPROVEMENT_MAINTENANCE_DRAIN_REHEARSAL.md
git diff --check
```

Web2ファイル10件（新規4＋既存6）、Application worker3件、隔離preflight単体37件、Web typecheck、対象eslint、architecture、対象Prettier、diff checkは成功。ブラウザ/Authを今回新規起動しない。全体format/typecheck/lint/test/buildは最新PR headの通常CIで区別して確認し、過去headの成功を流用しない。Node guardはfetch/socket/TLS/DNSの外部通信を拒否するがOS sandboxではなく、native Prismaの宛先は固定URL/live DB名/markerで別途照合する。

| 実行                                        | 結果と範囲                                                                                                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| e02 migration                               | exit1、migrations表不存在。統合テスト未開始。成功扱いしない                                                                                                                                            |
| fresh e03 migration                         | 226件成功、live `_prisma_migrations`のfinished/非rolled-back226件も確認                                                                                                                                |
| e03 DB統合1回目（00:41:53 JST開始）         | 87件中86件成功、1件失敗、exit1。`exports only the owners training records even after completion and program archive`が5000ms timeout。実migration preflightを含むmaintenanceは成功。全体成功とはしない |
| e03 DB統合2回目（00:44:07 JST開始）         | 同じDBを手動resetせず、同じguard/コマンド/timeoutで新プロセスから再実行。86件成功、同じ研修export1件が5000ms timeout、exit1。全体成功とはしない                                                        |
| e03 maintenance対象15件（00:46:17 JST開始） | 15件成功、exit0、28.13秒。同じDB/new processで上記describe名filterを明示して対象だけ実行。残り72件は選択外（runner表示skipped）であり成功件数へ含めない                                                |

2回再現したtimeoutの根本原因は未確定。今回の対象外の研修本番ロジックを修正せず、timeout増加、assertion緩和、skip/期待失敗指定で通していない。対象filterは全体失敗を隠す措置ではなく、maintenanceだけの完了状況を区別する追加実行。既存テストのskip設定を変更しない。

## 停止・drainの受入条件（設計、今回未実装）

1. deployment/新規enqueueと、旧deploymentを含むschedule/run・手動POST・外部schedulerなど全起動元を列挙し、停止方式/権限/再開方法をownerが確定する。
2. 停止後の受付/claim増加なしと、進行中request/process/DB txの終了を確認。LEASED全種の残件と期限超過を別確認し、1つでも不明ならNO-GO。Job statusの手書き変更/削除でゼロにしない。
3. 期限切れleaseは成否不明として保留。元process・DB fence・外部副作用を調べ、Provider再発注しない。停止中の再claimは禁止条件として検証する。
4. 停止を維持して読み取りpreflight→実migration fail-closed→新アプリ互換性確認まで接続する。preflightはTOCTOUを解決しない。
5. backup/隔離復元/復元後の本人削除と期限超過再適用は別gate。復元検証前に公開・自動処理再開しない。

次の最小タスクは**ownerが確認できる停止方式と全到達経路を確定すること**。VercelのCron toggleだけで旧deployment/手動起動まで止まるとは仮定しない。現行機能で証明できなければ、認証後・副作用前の最小停止guardを先行別PRで設計・承認する。そのguardを今回追加せず、本番停止/deployへ進まない。

## 終了・切り戻し

対象試験終了後のread-only snapshotはmigration226、LEASED0、他active DB session0。これは今回の合成DBだけの時点観測で、本番全起動元の停止や全process終了の証拠へ昇格させない。全テストプロセスの終了後、記録した完全ID/labelを再照合し、e02/e03の試験container/networkだけをstop/removeした。e03 task資源と18998 listenerの残存なしを確認。`--rm`で合成DB/匿名volumeを除去し、復元対象ではない。共有prune・他作業の上書きなし。切り戻しは追加テスト/文書だけを戻す。既存migration・削除保護・停止gateを戻さない。
