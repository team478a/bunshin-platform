# Feedback maintenance Job リリースRunbook

## 結論・今回の境界

2026-10-03 Asia/Tokyo。PR #1095はmainへマージ済み。停止方法・実DBの移行可否・backup復元の証拠が揃うまで、本番リリースはNO-GO。これは実装テストの失敗ではなく運用準備の未確認である。今回の成果は文書だけで、本番停止、DB接続、migration、cleanup、deployは実施しない。

- 調査main: `6fd55288a47faee12f4379fc5a384d4b538265d5`。
- PR #1095 head: `58d8b7d8ab691b1a265dc62179de612ab6b62a44`。既存検証は[CI 37099213136](https://github.com/team478a/bunshin-platform/actions/runs/37099213136)で、今回の検証とは別。
- GitHub APIで確認したproductionブランチ: `72fe91c8110871d0d91c28ae8daadec835a9791e`。取得時の最新5件のDeploymentの先頭は同SHA、2026-10-01T00:11:04Z、Production、status=success。このメタデータだけで現在の公開alias、DB状態、Vercel設定を確定しない。
- ローカル: Windows / Node24.21.0 / pnpm10.10.0。元の作業ディレクトリは変更せず、既存managed worktreeのcleanな最新mainから文書専用ブランチを作成。

## 実コードから確認した経路

| 正本・シンボル                                                     | リリース上の意味                                                                                                                                    |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/vercel.json`                                             | Gitデプロイ許可はproductionだけ。jobs/schedule、jobs/runとも毎分。Vercel側Production Branch実設定は別確認                                           |
| 同buildCommand / `runVercelMigration`                              | production buildでDB移行→readiness→Web build。新アプリ公開前にDBが変わり、旧アプリがまだ動く時間がある                                              |
| `apps/web/src/http/job-worker.ts` / `jobWorkerResponse`            | Cron認証→retention.schedule（履歴cleanup含む）→worker batch5→利用枠期限処理。runへのGET/POSTは読み取りではない                                      |
| `cron-security.ts` / `authorizeCronRequest`                        | Bearer secret照合。専用maintenance停止スイッチはこの経路にない。secret削除/変更を安全な限定停止の代替としない                                       |
| `apps/web/app/api/internal/jobs/run/route.ts`                      | maxDuration300秒。workerのclaim leaseも5分だが、leaseは実プロセス停止装置ではない                                                                   |
| `PrismaJobRepository.claim`                                        | 期限切れLEASEDを再claim可能。停止中のlease切れをdrain完了や取消と同一視しない                                                                       |
| `schema-readiness.ts`                                              | 最新migrationを固定。health/build gateの成功は旧workerとの同時稼働安全性の証拠ではない。job HTTP自身には同じreadiness照合がない                     |
| `20261003050000_feedback_maintenance_job/migration.sql`            | 一つのtransaction、lock5秒/statement30秒。通常Job actorを保持し、purgeだけNULLへ限定移行。旧アプリへ単純rollback不可                                |
| `PrismaImprovementFeedbackRetentionJobRepository.schedule/execute` | 履歴cleanupは別txで最大100。続く登録が失敗しても先にcommitした削除は戻らない。原本にはenvironment列がなく、物理DB/Workspace/Service分離の確認が必要 |

## 役割・承認

環境ownerとmigration担当の2者が、対象DB識別子、公開SHA、migration一覧、backup日時/保持期間、停止方式、復旧責任者を確認する。識別子・時刻・合否だけを記録し、URLの資格情報、User/Service ID一覧、原本、dumpをPRへ貼らない。停止は通常のMission/LINE等にも影響するため、許容停止時間と利用者案内を承認する。

この文書のマージは本番操作の承認ではない。実作業時は本番リリース・停止/再開・必要な読み取り専用DB確認を別途明示承認する。

## Gate 0: リリース差分・停止方法の確定

2026-10-04の[停止方式・起動経路設計](IMPROVEMENT_MAINTENANCE_STOP_DESIGN.md)は、Cron停止＋既存project入口Denyを最初の検証候補とする。実Vercel設定/旧URL/bypass/全writer停止は未確認で、候補の採用や本番変更を承認したものではない。アプリguard追加はその不足条件の確定後に別判断する。

1. 公開aliasが指す実SHA、productionブランチ、新しいrelease候補SHAを再取得する。mainとの差分に含まれる全migration・通常機能変更もレビューする。#1095だけの移行と決めつけない。
2. 対象候補のverify/database CI成功を確認。過去headの成功を流用しない。
3. Vercelの現在の停止機能/契約と、旧deployment URL・独自ドメイン・手動POST・外部scheduler等の到達経路を環境ownerが確認する。具体的な操作画面/権限と再開方法を記録する。確認前に「Cronをpauseできる」と断定しない。
4. 既存機能で停止を証明できないならNO-GO。最小停止guardの設計/非互換移行前の先行リリースを別PRとして検討し、今回勝手に追加しない。
5. backup/隔離復元確認と、復元後の期限超過データ再削除計画を承認する。既存Backup Runbookの古いアプリpromote手順より、このmigrationの互換条件を優先する。

## Gate 1: 停止・drain（将来の承認済み作業）

2026-10-04の非本番characterizationは[停止/drain条件再現](IMPROVEMENT_MAINTENANCE_DRAIN_REHEARSAL.md)を参照。現行`RunJobWorkerBatch`の`drained=true`は当該claimがnullだった意味で、他request/executor/claim前のretention処理を確認しない。HTTP200やlease期限経過も単独の停止証拠にしない。テスト成功はVercel/旧deploymentを含む停止gateの合格ではない。

1. 自動/手動の新規deployを止める。jobs/scheduleとjobs/runの両方への新規起動を停止する。runだけがretention登録/履歴削除を含むため、schedule停止だけでは不十分。
2. 旧deploymentを含むすべての起動元と、進行中request/workerの完了を確認する。新規Job登録をする関連操作もメンテナンス対象として特定する。
3. 全Job種のLEASED状態、lease期限、実行中request/DB transactionを権限制限した運用手段で確認する。5分待つだけ、LEASED=0だけ、ログが静かなだけのいずれか一つで完了としない。
4. 期限切れleaseが残った場合は個別に成否不明を保留し、元workerの終了と外部副作用の状況を確認する。cancel/delete/status手書き変更やProvider再発注でdrainを作らない。
5. 停止後も新しい呼出し・claimが増えていないことと、最後の実行終了時刻を記録する。確認不能なら移行を開始しない。独立Workerや新キューを作らない。

## Gate 2: 限定preflight（読み取り、未実行）

本番では承認済みread-only接続/transactionを使い、timeoutを設定して必要な集計だけ確認する。migrationのALTER/DO/UPDATEを「確認用」として本番で試さない。複製した判定を正本にせず、採用SHAの実migrationをレビューする。

- `_prisma_migrations`の適用済み/失敗/未適用を確認。今回のmigrationが未適用か適用済みかで経路を分ける。
- 既存purgeのBunshin/Capabilityなし、固定correlation、Group所有Workspaceとv1 payload一致、scheduledAt UTC日の日次key一致、4種retry逆参照なしを確認する。実migrationのDO条件が1件でも該当なら停止。
- NULL actor許容やterminal時刻のCHECKまで含め、実migration全体が通る見込みをレビューする。DO成功だけで全制約/DDL成功としない。
- 通常Jobのactor欠損、対象外Job、同一DBの別environment、停止中に行が変わる経路を確認する。移行は環境限定ではなく同DB内の全purge行を対象とする。
- 現行schemaで取得可能な期限超過Feedback/Candidate/auditと、移行後の履歴cleanup候補の規模/参照保持を必要最小集計で見積もる。新terminal列を未移行DBへ問い合わせない。旧DEAD/時刻欠落は移行時刻起点で180日保持し、updatedAtから即時削除対象にしない。
- 本番件数/ロック時間/負荷は未測定。値を仮定してGOにせず、上限を超える/timeout/部分結果なら未確認とする。

preflightはTOCTOUを防がない。起動停止を維持し、実migration自身のfail-closed条件を最後のgateとする。異常行は秘密を含まない分類と件数だけ記録し、別途調査する。payloadやUserを推測修復しない。

## Gate 3: 移行・新アプリ公開

1. Gate 0〜2の承認後だけ、レビュー済みmain→productionのrelease PRを使う。直接push/force pushや新旧同時起動を行わない。
2. Vercel buildのmigration→readiness→Web buildを確認する。停止はbuild開始より前から新アプリ公開・照合完了まで維持する。
3. migration成功後にWeb buildが失敗しても、DBは旧状態に戻らない。古い公開版を再稼働せずGate 5へ進む。
4. migration失敗時は対象transactionのrollbackとPrisma失敗記録を確認する。先行の別migrationがcommitした可能性もあるためDB全体が不変とは断定しない。`migrate resolve`や適用済みファイルの書換を自動実行しない。
5. 適用済みの場合は再移行を計画せず、公開版・DB契約を照合する。全schema/drop/推測actor補完をしない。

## Gate 4: 再開・監視

新公開SHAとmigration完了、CHECK/trigger/index、アプリ互換性を確認。live/readyだけでpurge E2E成功とはしない。まず停止を維持した非副作用の所有境界/読み取り確認を行う。

最初のjobs/runは履歴削除、期限処理、通常Job、生成/配信、利用枠期限処理を実行し得るため「smoke用GET」を無承認で実行しない。再開後は既存Cronから確認し、テストUser作成/LINE送信/Provider課金を別途承認なしに行わない。

- 認証・環境・lease照合、JobのSUCCEEDED/RETRY/DEAD、通常Jobへの影響を確認する。本文/個人識別子を監視ログへ追加しない。
- `feedbackRetentionSchedulingFailed=true`/scheduled=nullは未確認。先行cleanupがcommitしている場合がある。HTTP200も全工程成功を意味しない。
- orphaned presenceは「所属行がないscope」の検出で、登録不能や全削除完了を意味しない。falseを残件ゼロに補完しない。
- bounded100履歴/最大20scope登録/原本batchの制約と共有worker batch5を踏まえ、期限超過残件・最古遅延を別の承認済み読取で確認する。毎分設定から削除期限の保証や処理能力を推定しない。
- 停止中の未実行予定は既存schedulerの条件に依存する。全Mission/通知の自動追いつきや重複なしを、このRunbookで保証しない。

## Gate 5: 切り戻し・復元

| 時点             | 最初の安全な対応                                   | 禁止・条件                                              |
| ---------------- | -------------------------------------------------- | ------------------------------------------------------- |
| 移行前           | 停止維持、原因確認、互換版で再開可否を再承認       | 移行が無かった証拠なしに旧版再開しない                  |
| 移行後、公開失敗 | 停止維持、新契約対応版のforward-fix                | 旧版promoteだけ/actor推測復元/NOT NULL復元は不可        |
| 再開後の障害     | runを含む起動停止、追加cleanup停止、証拠保全       | 一般Response失敗を削除rollbackと扱わない                |
| backup復元が必要 | 責任者承認、隔離復元検証、公開を止めた復元・再削除 | dumpをGitへ保存しない。消した履歴や本人参照の復活に注意 |

復元元日時以降の本人削除・退会・保持期限超過を、安全な別記録と承認済み方針から再適用する。Jobだけでなく原本/Candidate/audit、必要な外部保存媒体も確認する。再削除を確認するまで利用者公開・自動処理を再開しない。復元で失った操作履歴を推測して作らず、情報が足りなければNO-GO。RPO/RTOとコピー保持は未確認。

## 証拠票・完了条件

### 今回のローカル検証

2026-10-03、既存テストのみ実行。DB migration scriptの子プロセス試験はpreview/developmentまたは空のproduction資格情報だけで、DB移行/外部通信を起動しない。worker HTTPは注入したfakeを使用する。

```text
pnpm --filter @bunshin/database exec vitest run test/vercel-production-migrations.test.ts test/database-readiness.test.ts
# 2 files / 9 passed
pnpm --filter web exec vitest run test/production-deployment-policy.test.ts
# 1 file / 1 passed
pnpm --filter web exec vitest run test/job-worker.test.ts
# 1 file / 6 passed
node node_modules/prettier/bin/prettier.cjs --check docs/improvement/IMPROVEMENT_MAINTENANCE_RELEASE_RUNBOOK.md docs/DECISION_LOG.md docs/IMPLEMENTATION_ROADMAP.md docs/DEPLOYMENT_GUIDE.md docs/BACKUP_RESTORE_RUNBOOK.md
git diff --check
```

合計16件成功。初回Web filterに存在しない`job-worker-http.test.ts`を含めたため、実在する`job-worker.test.ts`で別途6件を実行し、未実行を成功件数へ含めていない。ViteのconfigLoader将来互換性warningは残るがテストは成功。実DBのローカル試験と本番試験は未実行。全体format/typecheck/lint/test/buildと隔離DBは通常PR CIの最新headで確認し、URL/結果はPRへ記録する。

各Gateについて「担当/承認者・日時/タイムゾーン・候補SHA/公開SHA・DB識別子・操作前後migration・停止証拠・実行中処理確認・backup/RPO/RTO・結果/制約・再開承認」を非機密の運用記録へ残す。空欄を成功にしない。

今回完了するのは、コードに対応する文書と文書PRのCI確認。今回未実行: 本番DB preflight、停止/drain、migration、backup/restore rehearsal、実負荷、実Cron/退会E2E、課金/生成/配信、deploy。本番準備の次の最小タスクは、環境ownerと2者で停止方式・到達経路・drain確認手段を確定すること。停止を証明できなければ先行guardの小さな別PRを提案する。

関連: [実装報告](IMPROVEMENT_MAINTENANCE_JOB_IMPLEMENTATION.md)、[Deployment Guide](../DEPLOYMENT_GUIDE.md)、[Backup / Restore](../BACKUP_RESTORE_RUNBOOK.md)。
