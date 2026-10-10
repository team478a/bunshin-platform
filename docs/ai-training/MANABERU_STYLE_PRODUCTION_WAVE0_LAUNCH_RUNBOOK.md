# マナベルスタイル by ワタシワークス — Production Wave 0 Launch Runbook

### 2026-10-10 学習設計の承認登録UI（本番未反映）

既存APIへの1件ずつのレビュー画面は[承認登録UI実装報告](MANABERU_STYLE_DEFINITION_REVIEW_UI_IMPLEMENTATION.md)。画面は `/s/{serviceSlug}/manage/programs/learning-definition-review`。初期表示は保存せず、GET後に人間が7項目・公開SHA・非公開証跡・最終確認を入力する。登録応答後もGET/監査で現在状態を確認。教育設計の人間承認と本番APPROVEは別段階。画面追加をDefinition管理flag変更・本番Deploy・APPROVE・START・課金同意としない。main/productionの分離releaseと既存Gateを維持する。

### 2026-10-09 内部試験用の教育方針承認（本番操作の許可ではない）

指示元ユーザーが3段階の教育方針を内部1〜2人の試験用として承認した。範囲と証跡は[人間レビュー票の最新追記](PERSONAL_LEARNING_PRODUCTION_DEFINITION_REVIEW_SHEET.md)。これは全checklistレビューや本番Definition APPROVE・deploy・参加者準備・STARTの承認ではない。未確認項目をPASSにせず、固定release・実認可・reviewDigest/revision等の既存Gateを維持する。

### 2026-10-09 Pilot学習の焦点表示（本番未検証）

[焦点表示の実装報告](MANABERU_STYLE_PILOT_DEFINITION_FOCUS_IMPLEMENTATION.md)で、構造・背景・条件の違い、同じ課題の再利用、安全な架空題材、本人実践完了の記録案内をPilot画面へ追加した。Definition/Rubric/進級条件は変更しない。人間による教育レビュー・APPROVE・本番deploy・STARTの証拠や承認ではない。Phase Hでは実スマートフォン上で案内の理解と版照合を確認する。

## 状態・対象・承認境界

### 2026-10-09 3Definition教育レビュー一括点検

[教育レビュー一括報告](MANABERU_STYLE_THREE_DEFINITION_EDUCATION_REVIEW.md)と[既存レビュー票の最新版](PERSONAL_LEARNING_PRODUCTION_DEFINITION_REVIEW_SHEET.md)をPhase Dの判断資料として使う。3件の人間判断は全UNKNOWN、本番APPROVEは未実施。特に構造/背景は同じMission本文・Objective・Rubricであり、背景に焦点を当てた反復として許容するか、Pilot限定の焦点表示を先に補うかを人間が決める。追加実装は提案だけで今回行わない。教育レビューをまとめて行っても、3件の承認記録/操作を自動一括化しない。

### 2026-10-09 安全条件の再整理（以下の過去の次操作より優先）

[安全Gate再整理](../ai-evolution/WAVE0_SAFETY_GATE_REBASELINE.md)を現在の作業順序の正本とする。過去の元Backup日時・完全復元はUNKNOWNのまま。画面で取得できない履歴の探索を繰り返すことや、新しい有償Restore/Upgradeを準備全体の必須次操作にしない。復旧準備を省略・PASS扱いせず、現在の変更に必要なBackup/回復手順と残リスクのowner判断を別Gateにする。

現在の開始はNO-GO（Call Admission未設定、Definition未承認、内部参加者未準備、公開release/実認可/停止の検証不足）。次は既存3Definitionの教育レビューと設定案・releaseの整理。実APPROVE/設定/登録/Deploy/STARTは別承認。この追記は過去の復旧証拠を変更せず、復元日時だけをすべてのレビュー・準備の停止理由とする運用を訂正する。

### 2026-10-09 最新読取証拠とレビュー準備

同日追加のLogs読取で、既存restoreへの10月7日09:29 JSTの学習3migration相当DDLリハーサルstatementを確認した。履歴不一致の変更経路は説明できるが、復旧合格はUNKNOWNのまま。現在は[復元報告の最新追記](../ai-evolution/RESTORE_INTEGRITY_WAVE0_REVIEW_PREPARATION.md)を優先し、Phase Bの残確認は元Backup日時/同時点完全性/権限/RTO/RPO。隔離Prisma履歴の修正や同DDL再実行を次操作にしない。

[本番安全条件の読取証拠](../ai-evolution/PRODUCTION_SAFETY_READ_ONLY_EVIDENCE.md)を2026-10-07/08の観測より優先する。本番Prisma231件・学習5tableあり、Pilot停止・Seat0・承認0・人数policy未設定、Vercel project productionのCall Admission NOT_SET。これは開始許可ではない。

[隔離復元確認・設定レビュー案](../ai-evolution/RESTORE_INTEGRITY_WAVE0_REVIEW_PREPARATION.md)では既存restoreの学習tableとPrisma履歴に不一致を確認。復旧リハーサル合格はUNKNOWN、Wave 0はNO-GOを維持する。Phase Bで新しい復元を反射的に実行せず、まずDB ownerが既存restoreの復元元Backup/復元後変更記録を照合する。Phase Eの既存候補と[3Definitionレビュー票](PERSONAL_LEARNING_PRODUCTION_DEFINITION_REVIEW_SHEET.md)は未承認。設定・承認・参加者登録・開始は別操作承認を待つ。

### 2026-10-09 本人内部テスター準備UI（未本番反映）

SERVICE_OWNER本人を内部テスターにする最小操作は、`/s/{serviceSlug}/manage/programs/personal-learning-preparation`へ追加する。詳細は[内部テスター準備UI](MANABERU_STYLE_INTERNAL_TESTER_PREPARATION_UI_IMPLEMENTATION.md)。本記載は実登録/本番deploy/STARTの証拠・承認ではない。

停止中の専用Programと両実行flag OFF、既存operations/participant preparation flag・固定authorityが必要。「本人の準備状態を確認」→ 初回だけ内部上限1〜2を明示選択・確認 → CONFIGURE → 状態再確認 → 本人Enrollment準備 → 状態再確認 → INTERNAL参加権付与 → 状態再確認 → 本人Profile準備画面の順。各段階で人間レビュー証跡・本人対象確認をやり直す。稼働中、失効、不正/複数Offering、既存人数設定の修復、START/承認はこの画面で行わない。本文・secretの入力/手動SQLによる迂回を禁止する。

### 2026-10-08 学習導線照合（最新の限定観測）

Vercelの実公開SHAは`24afc8a170097741844e068653b191bc822b1c2e`（#1180）。本番に期限なしPersonal Learning Programがあり、画面上の参加中は0人。main #1181の本人LINE接続は未公開。以下の2026-10-07公開SHA/DB状態は歴史的記録であり、現在のPASS/PENDING判定に流用しない。

詳細は[学習と本番の照合](MANABERU_STYLE_LEARNING_PRODUCTION_RECONCILIATION.md)、[評価待ち/再開修正](MANABERU_STYLE_LEARNING_FLOW_IMPLEMENTATION.md)。新しい画面修正を実課金E2E・Pilot START・main全体Deployの承認とみなさない。

初版は2026-10-07 JST、基準main `ffca75706af0d00e064088aa38bb899393ec3621`（#1164）。今回のRead-only更新はmain `c4d103a9b82df10f4e1fb57901c8a70c6899e0b6`（#1166）を基準とし、[main CI](https://github.com/team478a/bunshin-platform/actions/runs/37545719072)成功を確認。実公開SHAは `87c5fafcdf9b84c67dd33aef41860368415ca789`（#1143）、mainとDIVERGED。release対象SHAは人間が別途固定し、本書作成commitを自動的にdeploy対象にしない。

**開始判定はNO-GO。文書は操作承認ではない。** 本書は将来の人間承認後に実行する順序を定義する。初版はProduction読取も未実施。今回の別指示によるRead-only監査では既存認証済みDashboard/CLI metadataとREAD ONLY transactionのSELECTのみ実施した。Migration、deploy、設定、Definition承認、参加者登録、enable、key変更、実Provider利用は一切実施していない。以下の変更command/API例は未実行。

Wave 0は内部1〜2人の実環境E2Eであり、外部募集ではない。内部枠と外部100人枠を分離し、一般ユーザー・旧30日V1へ表示しない。内部Domain名は維持する。staging配備は必須でなく、隔離restore/DDL検証に使う環境は別途必要。

実行記録は[Execution Checklist](MANABERU_STYLE_WAVE0_EXECUTION_CHECKLIST.md)へ。公開GitへUUID名簿、session、dump、secret、本文を貼らず、アクセス制限された証跡のキーのみ記録する。各Phaseの失敗/UNKNOWNでは次へ進まない。

### 2026-10-07 Read-only監査で確定した状態

正本は[Production Read-only Audit](MANABERU_STYLE_PRODUCTION_READ_ONLY_AUDIT.md)。以下は実読取のpoint-in-time結果であり、開始直前に再確認する。初版の実環境UNKNOWNは本追記/監査報告を優先し、過去の合成検証は本番の証明としない。

| 項目                   | 結果 / 次の停止点                                                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application            | Vercel bunshin-platform-web / team478as-projects、正式URL https://www.watashi-works.com、production branch、Node24 / hnd1、公開87c5fafc。#1162/#1164/#1166を含む最新Pilot一式は未Deploy |
| DB                     | Supabase bunshin-platform-prod / vtkzinaudznwbsjoyszk、Tokyo、PostgreSQL17.6、Healthy。実Application接続先との非秘密metadata照合・server role/poolはUNKNOWN                             |
| Migration / RLS        | Prisma227件、最新20261005030000、未完了0。3 Personal Learning migrationはPENDING、必要5 table不存在。全履歴checksum/driftと適用後grants/RLS否定は未確認                                 |
| Backup                 | 最新Physical Backupは2026-10-07 05:44:04 JST、COMPLETED。PITR無効、Storage object本体対象外。retention保証/隔離restore実績/RTOはUNKNOWN                                                 |
| Provider               | Production ACTIVE OPENAI gpt-5-mini / credential SET / verified=true / paused=false。実API疎通・App runtime source一致は未検証                                                          |
| Pilot                  | projectのPERSONAL_LEARNING系env全てNOT_SET、DB marker0。OFF相当/未準備。seat/approval table不存在なので人数を0 rowsと扱わず、3承認はNOT_FOUND                                           |
| Cost / Hard Cap / STOP | main実装あり、本番はenv/table/公開コード未準備。利用可能PASSではない                                                                                                                    |

**最初の人間操作は1つ:** 環境ownerが最新COMPLETED BackupをProductionとは別の隔離projectへ復元リハーサルする。Database→Backups→Restore to new project BETAの経路は確認済み。実行権限/費用/機密データ管理を人間承認し、Productionへ上書き/切替しない。Codexは実行していない。これが成功してもMigration/deploy承認を兼ねない。

## Emergency Stop — ON手順より先に読む

1. 障害責任者が対象Workspace/Service/Programと現releaseを確認。承認済み停止手段でProgramの `personalLearningPilot.enabled=false`、必要に応じて `status=SUSPENDED` にする。marker/moduleKey/participantControl/allowlistは消さない。
2. Vercel Production環境の `PERSONAL_LEARNING_PILOT=false` と `PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT=false` を反映する。環境更新だけで既存instanceが変わるとは扱わず、全稼働deployment/domain/workerへの反映・旧URL遮断を確認。再deployは別承認、Migration自動実行に注意。
3. 新規UI/API、NEXT/Assignment、評価enqueue、worker、Provider Admission/送信直前が拒否されることを確認。既存V1で同じ拒否が起きていないことを確認する。共通Cron/Provider key全停止をPilot停止の代用にしない。
4. Pilot scopeの評価Jobと `personal_learning_call_admissions.settled_at IS NULL` を制限付きで調査し、送信済みcall・lease・返却後保存を追跡。停止は送信済みcallの取消ではない。TTL/lease期限だけでdrain完了としない。
5. 時刻、SHA、固定reason、call数/既知推定原価、影響範囲を記録。Goal/Plan/Seat/Answer/監査/Admissionを削除しない。未終了枠の自動解放・台帳削除・自動再開は禁止。

**2026-10-07運用操作の追記:** `GET/POST /api/services/{serviceSlug}/ai-training/pilot-operations` を追加した。STOPは実行flag ONでも利用可能で、最新settingsを保全してSUSPENDED/enabled=falseへ停止する。全instance反映と送信済みcallのdrainは未証明で、引き続きON不可。具体的なbody/flag/初期化/停止中Enrollment準備/STARTの順序は [運用操作実装報告](MANABERU_STYLE_PILOT_OPERATIONS_IMPLEMENTATION.md) を参照。本書の従来Blockerは実装有無と実運用検証を区別して更新する。

## Phase A — Preflight（最初の人間操作）

最初にrelease責任者が、環境owner・Migration担当・障害停止担当・Definition reviewerを指名し、**Productionの対象同定と読み取り専用監査の範囲/権限を承認**する。これはMigration/deploy承認ではない。

| 確認                      | 確認場所・期待値                                                                                                                                                                                | 停止条件                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| main/release/rollback SHA | GitHub branch/commit/Checks。`git fetch origin main production`、`git rev-parse origin/main origin/production`、`git diff --stat origin/production..origin/main`。releaseを固定し全差分レビュー | SHA不一致、CI未完/失敗、rollback互換性不明         |
| 全pending Migration       | Gitの `packages/database/prisma/migrations` と承認後のDB `_prisma_migrations` 全履歴、checksum/finished/rolled_back照合                                                                         | Git差分を実pendingと同一視しない                   |
| 実公開version             | Vercel Production DeploymentのGit SHA、正式aliasの割当、旧deployment到達性。GitHub deploymentだけは補助証拠                                                                                     | alias/SHA/旧instance不明                           |
| 実DB/role                 | Supabase project識別子、Vercel DATABASE_URL/DIRECT_URLの接続先をownerが秘密を表示せず照合                                                                                                       | project/role/権限不明                              |
| flag OFF                  | Vercel Production設定と実プロセス、両実行flag=false。Program SUSPENDED / Pilot enabled=false                                                                                                    | 設定画面だけで反映完了としない                     |
| LINE隔離                  | Program `trainingOperations.notificationsEnabled=false`、`postponedReminderEnabled=false`。scheduler/送信直前reserved除外と既存queueを確認                                                      | 欠落はdefault trueになる、古いbroadcast不明        |
| 人数                      | 準備GETのpolicy/seatsとDB cumulative count。INTERNAL/EXTERNALを別集計、revoked含む。currentWave=0/currentWaveCap=0                                                                              | 台帳/allowlist不一致、既存外部seat、内部人数未承認 |
| Provider/Model            | runtime-provider-configuration、現ACTIVE PRODUCTION管理設定/legacy source、Admission.modelの完全一致                                                                                            | model/source/課金同意/予算不明                     |
| 上限/価格                 | 下記実key、承認済み数値・価格版・観測/停止担当                                                                                                                                                  | 未設定、不正、cost UNKNOWNを0扱い                  |
| Kill Switch/Logs          | 冒頭停止操作の担当/権限/到達性、Vercel runtime logsと制限付きDB集計                                                                                                                             | 停止操作未確定、log取得不可                        |

本番監査開始前の現在値はすべてUNKNOWN（CI/Git SHAの上記確認を除く）。監査は別承認後の人間が行う。

### Production正本とUNKNOWN

| 項目                | Repositoryで確認できる正本/経路                                             | 実環境で埋める情報                                                                                           |
| ------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Hosting / deploy    | `apps/web/vercel.json`、Vercel Build/Git production branch                  | 実project bunshin-platform-web / team478as-projects、公開87c5fafc、正式alias確認済み。release ownerはUNKNOWN |
| Database            | Prisma/PostgreSQL、DATABASE_URL/DIRECT_URL、session pooler変換              | Supabase project/Tokyo/17.6確認済み。App接続先/role/grants/poolはUNKNOWN                                     |
| env / secrets       | Vercel UI/secure integrationが運用経路。`.env`やGitは本番正本ではない       | 編集者、secret保管/rotation owner/全instance反映はUNKNOWN                                                    |
| Provider credential | `AiProviderConfiguration`暗号化key、ACTIVE不存在時のみlegacy fallback       | Production OPENAI gpt-5-mini/key SET/verified。実App source/key有効性/予算はUNKNOWN。復号しない              |
| feature flags       | server env、`service_programs.settings`、Seat台帳                           | project flags NOT_SET / marker0。OFF相当、START/STOPの公開コード未準備。全instance伝播は未実証               |
| Migration           | Vercel build→`db:migrate:vercel`→Prisma全pending、`_prisma_migrations`      | 実227件/最新20261005030000、3 pending、5 table不存在。最新Backup成功。全drift/lock/restore/RLS否定は未済     |
| logs                | Vercel build/runtime logs、Job/ProgramActionEvent/ProgramAuditLog、P1-G SQL | log保持期間、閲覧権限、通知先、監視担当はUNKNOWN                                                             |

## Phase B — Backup / Migration

1. DB ownerとMigration担当の2者がSupabase Dashboardで対象project、backup方式、最終成功timestamp、保持期間を記録。Read-only監査でPro日次Physical Backup実在と最新COMPLETED（2026-10-07 05:44:04 JST）を確認した。正式retention/実restore/RTOはUNKNOWN。実行直前の新しいBackupとRPOを再確認し、日次backupで許容RPOを満たさなければ追加方式をownerが承認する。Storage object本体は含まれない。
2. 既存隔離projectの復元記録とDDL試験後の状態を先に利用する。元Backup日時・同時点完全性・実測RTO/RPOはUNKNOWNのままでよく、文書/教育レビュー/読取検査は先行可能。現在の本番変更を承認する前には、最新Backupと復元手順・権限・許容損失/停止時間・検証範囲をownerが確認し、残リスクを明示判断する。復旧準備自体が不明なら実変更を停止。追加restore rehearsalが必要かはこの判断で決め、費用と対象を別承認する。Productionへ上書きしない。dumpはGitへ置かない。過去の欠落だけを理由に有償再復元を自動要求しない。
3. release全pendingを固定し、既存Goal unique index/triggerのlock時間と旧版write/deleteとの互換性を隔離環境で測定。lock/statement許容時間、writer停止/drain範囲、監視担当を人間が決める。SQLにはtimeoutがなく、additiveでも無停止保証はない。
4. Migration実行を独立承認。標準はPhase CのVercel build先頭で**全pendingを辞書順で一括**適用する。各Migrationごとの人間停止点は現runnerにない。backup→一括Migration→全schema/RLS検証→公開検証の順序とする。
5. 公開前に手動runnerを使いMigration/schema確認を分離する必要がある場合、接続先・credential供給・二重runner排除・失敗時公開防止を別レビュー。承認済みrunner上の `pnpm db:migrate:deploy` も全pending適用であり1件選択ではない。今回実行しない。
6. finished/checksum/FK/CHECK/index/RLSを5新tableと既存tableで確認。`pnpm db:assert-ready` は最新Migration finished確認のみで、全履歴/RLS/role安全の証明ではない。FORCE RLS/public policyは追加されていない。owner/BYPASSRLS/server/anon/authenticatedの実grants/アクセス否定を人間が試験する。

### Migration Inventory（fileは各directoryのmigration.sql）

| 順序/file                                                       | table・index・FK・RLS                                                                                                                                                                                                                                                                                                                                 | lock / rollback                                                                                                                                 |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261006021000_personal_learning_persistence/migration.sql`    | goal_confirmations / plan_revisions / definition_approvalsを追加。正確なtableは `personal_learning_goal_confirmations` / `personal_learning_plan_revisions` / `learning_definition_approvals`。Goal複合unique `program_goal_learning_scope_key`、Plan scope index、各PK/unique/FK/CHECK。Goal/Enrollment/Membership/Group/User参照、3table ENABLE RLS | 既存program_member_goalsの通常unique index（非CONCURRENTLY）とFK lock。旧データ重複・書込待ち確認。Pilot OFF、履歴保持、forward-fix。逆DROPなし |
| `20261006120000_personal_learning_call_admission/migration.sql` | `personal_learning_call_admissions`、PK、operation unique/day/open indexes、Program scope FK、hash/settled CHECK、ENABLE RLS                                                                                                                                                                                                                          | 空ledgerでも参照先DDL lockあり。未終了枠を削除して復旧しない                                                                                    |
| `20261006140000_personal_learning_pilot_seat/migration.sql`     | `personal_learning_pilot_seats`、PK、participant/kind-slot/Enrollment unique、scope/Enrollment FK、kind/cohort/slot/time CHECK、ENABLE RLS。Enrollment DELETE前のredact trigger、Program settings UPDATE前のidentity保持trigger                                                                                                                       | 既存program_enrollments/service_programsへtrigger DDL lock、削除時Program更新との競合を測定。取消/削除で累計枠を減らさない                      |

3件ともDROP/TRUNCATE/既存データbackfillなし。seat triggerは将来Enrollment削除時にlink/allowlist/revisionを更新するため、単なる空table追加とは扱わない。Migration directoryのrootは `packages/database/prisma/migrations/`。

その他関連履歴 `20261005030000_training_support_skill_lifecycle` は既存Skill Registry用でPersonal Learningの3件とは別。Git production→main差分だけでなく実pendingを全件棚卸しする。Feedback maintenance等がpendingなら各専用Release Runbookも適用する。

schema mismatch、失敗/未完履歴、checksum不一致、想定外lock、FK/index既存データ競合、RLS欠落で停止。適用済みfile編集、履歴削除、未承認migrate resolve/retryは禁止。部分DDL適用を含めDB状態を保全しownerとforward-fixを判断する。

## Phase C — Deploy / Pilot OFF Smoke

1. Phase A/B承認とbackup/旧版互換性を添付し、固定release SHAをproductionへ反映するPRを人間がレビュー・承認する。productionへ直接push/force pushしない。両実行flagと準備flag OFFを確認してmergeする（今回はrelease PRを作らない）。
2. Vercel Build Logsで `pnpm db:migrate:vercel` → `pnpm db:assert-ready` → `pnpm turbo run build --filter=web` の順と成功を確認。Preview/devではMigration skip、productionではDATABASE_URL/DIRECT_URLと必要なSUPABASE_SESSION_POOLER_HOSTを要求する。
3. build後段失敗でもDBは戻らない。新しい公開に進まずDB履歴・partial DDL・旧版互換性を調査。自動再buildで解決しない。標準Git deployはschema手動検証でpauseする機能ではないため、公開直後の検証体制を確保するか別runner方式を事前承認する。
4. 正式aliasの新SHA、`/api/health/live`、`/api/health/ready`（schema current）、既存Login、既存Service/Program/V1、Adminを非破壊で確認。DBアクセスはreadyと認可済み代表readで確認する。
5. Pilotページ/APIは対象外・匿名・準備flag OFFで拒否。既存V1の既存画面/Assignment、LINEの既存稼働ログを確認。Provider/LINEの新規課金・送信smokeは別承認がない限り行わず、既存成功ログで確認できなければUNKNOWNとして止める。

既存サービス障害、alias不一致、DB/認証/Privacy問題で停止。旧deploymentへ戻す場合もPilot両flag OFFを確認し、最新DBと互換性がある版だけ使う。

## Phase D — Definition Review / Approval

対象は3固定版だけ。package=`AI_TRAINING`、version=`AI_TRAINING_DEFINITION_FIXTURE_V1`、Skill=`AI_TRAINING_SKILL_RULES_V1`、Rubric=`AI_TRAINING_MISSION_QUALITY_V1`、Router=`AI_TRAINING_LEARNING_ROUTER_V1`。

| Definition         | Objective / prerequisite / concepts                                                   | mistakes / practice / rubric / legacy mission                                                                       |
| ------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| PROMPT_STRUCTURE   | 背景・目的・依頼を分けて指示できる / なし / 背景・目的・依頼範囲                      | 依頼だけ、背景と目的が同じ / 本人が3点を分けて組立 / 指示構造・背景設定・実行可能性 / PROMPT_BASIC                  |
| CONTEXT_SETTING    | 同じObjectiveをPROMPT_BASICから継承 / PROMPT_STRUCTURE / 対象・背景情報・目的との関連 | 同Missionのmistakesを継承 / 必要背景を選び機密を除いて追加 / 同Rubric / PROMPT_BASIC                                |
| CONSTRAINT_SETTING | 品質を左右する条件を具体指定 / CONTEXT_SETTING / 条件・測定可能性・一貫性             | 「いい感じに」だけ、条件矛盾 / 具体的で矛盾しない条件を本人が組立 / 条件指定・測定可能性・一貫性 / PROMPT_CONDITION |

teaching guideは独立field/LLM教材ではない。構造→必要背景→条件の順で本人が考えるレビューガイド案。[詳細レビュー票](PERSONAL_LEARNING_PRODUCTION_DEFINITION_REVIEW_SHEET.md)の課題/成功条件/Completion全score条件を参照する。CONTEXTとSTRUCTUREが同Mission/Objectiveでも教育上妥当か人間が判断する。

Safety: 本人がCreator、代行制作/業務戦略決定なし、個人情報/社外秘を練習へ入れず本人が出力を確認。Objective/Rubric/Mission/version/safety/prerequisiteに不足・矛盾があればREJECTまたはREVISION REQUIREDとしAPPROVEしない。同versionを黙って変更しない。

1. Phase Eの固定authority・停止済み専用Programを先に整える（初期scopeがなければDを実行できない）。教育レビュー自体は先行可能、API承認は停止条件が揃ってから。
2. 人間管理者が自身のsessionで `GET /api/services/{serviceSlug}/ai-training/definition-approvals`。ACTIVE SERVICE_OWNER/ADMIN、Same Service、no query。response `data` の各項目のdefinition/reference、revision、reviewDigest、currentを確認。
3. 固定releaseの実コード/MissionとGETを照合し、7項目 objective/prerequisites/concepts/safety/mistakes/practice/rubricAndMissionを**人間が**レビュー。AIのtrue補完禁止。本人レビュー証跡キーとSHAを記録。
4. 同endpointへJSON POSTを1件ずつ。field: operationId（新UUID）、action=APPROVE、definitionKey、version、expectedRevision（GETの64桁digest）、reviewDigest、reviewedCommitSha（40桁）、reviewEvidenceKey（80文字以内）、confirmation=CONFIRM_DEFINITION_APPROVAL、上記7項目のreviewChecklist。未レビューならPOSTしない。
5. receipt後GETで現在APPROVED、exact版・承認者/時刻を確認。`program_audit_logs` のLEARNING_DEFINITION_APPROVAL_CHANGEDと操作IDを限定照会。receipt.stateAtOperationだけで現在承認としない。
6. 409は再GET/再レビュー。応答喪失の再送は同UUID/同body、異なる操作は新UUID。撤回は停止/drain後にaction=DEPRECATE、confirmation=CONFIRM_DEFINITION_WITHDRAWAL、最新revision/digest、checklistなし。今回承認も撤回も実施しない。

## Phase E — Pilot Configuration（人間承認候補、未設定）

専用Serviceに他AI_TRAINING_V1 Program（終了/停止含む）があれば準備は拒否。旧V1 Programへmarkerを後付けしない。新規Programは下記CREATE_PROGRAMで直接準備し、旧30日Templateの採用・固定研修期限の設定は不要。既存Program用INITIALIZEは互換操作として残す。本番での実行担当・設定承認・適用SHAは別Gate。

### 期限なし専用Programの新規準備（レビュー後の人間操作）

管理者の最小操作画面は `/s/{serviceSlug}/manage/programs/personal-learning-preparation`。準備authorityが当該Serviceと一致し、運用flag ON・両実行flag OFFの場合だけ既存Program管理からリンクを表示する。未設定時は直接URLで設定名の読み取り専用案内だけ表示する。環境設定の登録は別の人間承認操作であり、画面から変更しない。

画面で対象Service・予約Program IDを確認→「現在の状態を確認」→未作成の場合のみ人間レビュー記録識別子と確認チェック→「停止状態で作成」。応答喪失時は同一操作の再送だけを行う。既存Programは変更せず、作成後もDefinition承認・Participant・STARTには進まない。詳細と未確認事項は [管理画面実装報告](MANABERU_STYLE_PROGRAM_PREPARATION_UI_IMPLEMENTATION.md)。

1. 専用ServiceのACTIVE Workspace/Group、SERVICE_OWNERまたはSERVICE_ADMINを確認。他AI_TRAINING_V1 Programが存在するServiceでは実行しない。
2. 新規のlowercase UUIDをProgram IDとして予約し、PERSONAL_LEARNING_PRODUCTION_PREPARATIONのserviceProgramIdへ指定する。workspaceId/groupIdは既存の正しいService境界を指定する。値の変更は人間承認、今回の文書更新では実施しない。
3. PERSONAL_LEARNING_PILOT_OPERATIONS=true、両実行flag=falseを確認。管理者sessionで `GET /api/services/{serviceSlug}/ai-training/pilot-operations`。`data.exists=false`、`data.status=ABSENT`、stateTokenを確認する。別scopeの既存IDや権限不整合では404。GETで作成はしない。
4. 同origin管理者操作で同endpointへ以下をPOSTする。stateTokenは直前GET、operationIdは新規UUID、reviewEvidenceKeyは承認記録の識別子。session Cookie/secretを転記しない。

```json
{
  "action": "CREATE_PROGRAM",
  "operationId": "<new-lowercase-uuid>",
  "expectedStateToken": "<GET-stateToken>",
  "confirmation": "CONFIRM_PILOT_OPERATION",
  "reviewEvidenceKey": "<human-review-record-key>"
}
```

5. receiptのstatus=SUSPENDED、enabled=false、initialized=true、programOfferingIdを保管する。TemplateはPRIVATE、duration=OPEN_ENDED、Offeringは無料/招待/GUIDED限定、startsAt/endsAt=null、通知OFF、allowlist空。再送は同一body/operationIdを使用、異なる操作による既存Programの上書きは拒否。
6. Programの構造版PUBLISHEDはLearning Definition APPROVEDを意味しない。Definition承認・参加者準備・STARTは別の人間承認を必要とする。INITIALIZEの追加実行は不要。

ProgramDefinitionの必須phase表示範囲・schedule/cadenceは既存schemaを満たす参照metadataであり、学習期限ではない。実際の進行はConfirmed Plan/Routerで決め、旧30日Schedulerから隔離する。詳細・検証は [専用Program準備実装報告](MANABERU_STYLE_PERSONAL_LEARNING_PROGRAM_PREPARATION_IMPLEMENTATION.md) を参照。

| 実key/正本                                                                                                             | 停止準備 / Wave 0候補                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| APP_ENV / VERCEL_ENV                                                                                                   | production / production。偽stagingは禁止                                                                                                                                                                                                          |
| PERSONAL_LEARNING_PILOT / PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT                                                    | 準備は両方false、開始承認後だけ両方true                                                                                                                                                                                                           |
| PERSONAL_LEARNING_PRODUCTION_PREPARATION                                                                               | JSON: workspaceId/groupId/serviceProgramIdのlowercase UUID3つのみ。groupIdはService。全instanceで単一authority                                                                                                                                    |
| PERSONAL_LEARNING_DEFINITION_ADMIN / PERSONAL_LEARNING_PARTICIPANT_PREPARATION / PERSONAL_LEARNING_PROFILE_PREPARATION | 必要準備時のみtrue、開始前に全てfalse。authorityと運用flagはSTOP経路のため維持                                                                                                                                                                    |
| PERSONAL_LEARNING_PILOT_OPERATIONS                                                                                     | 既定false。レビュー済み操作時true、稼働中も停止担当が到達できるよう維持。STARTは両実行flag OFFでのみ可能                                                                                                                                          |
| ServiceProgram.status / settings.moduleKey                                                                             | 準備SUSPENDED、実行ACTIVE / AI_TRAINING_V1を維持                                                                                                                                                                                                  |
| settings.trainingOperations                                                                                            | notificationsEnabled=false、postponedReminderEnabled=falseを明示。既存他field維持                                                                                                                                                                 |
| settings.personalLearningPilot                                                                                         | enabled=false、enrollmentIds=[]で開始。台帳CONFIGURE/ADMITがparticipantControl/allowlistを管理。手でallowlistを追加しない                                                                                                                         |
| participantControl                                                                                                     | CONFIGUREでexternalParticipantCap=100、internalParticipantCap=2、currentWave=0を候補。API算出currentWaveCap=0、version=PILOT_PARTICIPANT_CAP_V1、revisionはserver管理。1人なら内部cap=1も可。人間承認前に運用値確定しない                         |
| PERSONAL_LEARNING_CALL_ADMISSION                                                                                       | JSONにworkspaceId/groupId/serviceProgramId、dailyAttemptLimit、maxConcurrent、model、maxRequestBytes、maxOutputTokensの8項目のみ                                                                                                                  |
| Admission初期数値候補                                                                                                  | Program全体UTC日次dailyAttemptLimit=12、maxConcurrent=1、maxRequestBytes=16384、maxOutputTokens=2048。3Definition×2人×2attemptの小規模候補で保証/推奨価格ではない。実payload/schemaの完了余裕と課金予算を人間レビュー、足りなければ停止して再承認 |
| model/provider                                                                                                         | 既存runtimeで解決するOpenAI Assessmentのみ。modelは管理設定/legacyの実modelと完全一致させる。新model/key追加なし、default名をREADYの証拠にしない                                                                                                  |
| PERSONAL_LEARNING_AI_PRICING                                                                                           | 配列: provider/model/effectiveFrom/inputPriceMicrosPerMillion/outputPriceMicrosPerMillion/cachedInputPriceMicrosPerMillion/currency=USD/pricingVersion。実応答modelの最新単価を人間確認、仮価格禁止                                               |

`dailyCallAttemptLimit`/`concurrentCallLimit`/`requestByteLimit`というkeyは存在しない。実名はdailyAttemptLimit/maxConcurrent/maxRequestBytes。参加者APIは2KiB、Definition APIは4KiBの固定body上限で、Provider byte上限とは別。Admissionは金額Hard StopではなくUTC日次attempt、失敗/retryも消費、settledAt=nullは翌日も同時枠を保持。

費用はP1-G推定式と実価格/入力上限見積もり/失敗分/共有quota影響で別承認。bytesをtoken数と等置しない。Provider予算/Rate Limit/Alert/監視担当を実環境で確認し、欠損costはUNKNOWN。Wave 0数値を上げるために自動reset/TTL解放/FAILED連打しない。

## Phase F — Internal Participant Preparation

1. 本人同意と内部1〜2人の非公開名簿、ACTIVE User/Workspace、専用ServiceのACTIVE PARTICIPANT Membershipを確認。所有者本人も内部テスターになる場合のみ、ACTIVE SERVICE_OWNERを維持し、下記の本人EnrollmentとINTERNAL/cohort INTERNAL Seatを明示付与する。管理権限だけでは学習不可。降格・二重Membership・別人のProfile代入は行わない。例外の実装・回帰根拠は[所有者内部学習実装報告](MANABERU_STYLE_INTERNAL_OWNER_LEARNING_IMPLEMENTATION.md)を参照し、対象releaseへの反映を別途確認する。
2. 新規ServiceはPhase EのCREATE_PROGRAMで期限なし専用Programを直接準備し、下記CONFIGUREを先に行う。既存の空Programの場合だけ互換INITIALIZEを検討。その後GETの最新stateTokenでPREPARE_ENROLLMENTを送る。管理者session、groupMembershipId/receiptのprogramOfferingIdを検証し、SUSPENDEDのままGUIDED Enrollmentを準備する。Goalは空、startsAtはserver設定、固定終了期限は設定しない。Seatはまだ付与しない。
3. 従来のACTIVE専用Enrollment APIは変更しない。PilotでACTIVE↔SUSPENDEDを一時切替して登録する手順は採用しない。旧V1 setup/期間延長/30日V1変換なし。具体例は運用操作実装報告を参照。
4. 停止状態で `GET /api/services/{serviceSlug}/ai-training/pilot-participants`。data.policy/seats、累計INTERNAL/EXTERNAL、revoked含むを確認。初回空台帳/allowlist、expectedRevision=0を確認。
5. 人間管理者が同URLへPOST CONFIGURE。例の構造（値は承認後置換）:

```json
{
  "action": "CONFIGURE",
  "operationId": "<new-uuid>",
  "expectedRevision": 0,
  "confirmation": "CONFIRM_PILOT_PARTICIPANT_OPERATION",
  "reviewEvidenceKey": "wave0-reviewed-config",
  "externalParticipantCap": 100,
  "internalParticipantCap": 2,
  "currentWave": 0
}
```

6. receipt/GETの最新数値revisionを使い、一人ずつaction=ADMIT、programEnrollmentId、kind=INTERNAL、common4項目（operationId/expectedRevision/confirmation/reviewEvidenceKey）をPOST。CONFIGURE用3項目は送らない。GETでINTERNAL/cohort INTERNAL/枠1〜2、EXTERNAL=0とallowlist一致を確認。Seat付与はEnrollment作成ではない。取消はREVOKE、枠は累計に残り再利用不可。
7. 409/CAS競合は再GETと人間再確認、無条件retryしない。同body/UUIDの応答喪失再送は二重Seat消費なし。異なるUserアカウントの同一自然人は自動判定できず人間が確認する。
8. 本人がLoginし `/s/{serviceSlug}/programs/{programEnrollmentId}` を開く。Profile準備flag=true、Program SUSPENDED、Pilot disabled、Seat/allowlist、両実行flag=falseが必要。
9. 仕事SALES/OFFICE/MANAGER/OTHER、経験BEGINNER/INTERMEDIATE、時間5/10/15分を本人選択し本人確認→「確認して保存する」。3項目は必須、**保存時UNKNOWNは不可**。不明なら未選択で運営へ相談しREADYにしない。BEGINNERは明示回答であり未回答/未経験の推定ではない。工具別経験等は今回不要/UNKNOWNのまま。自由文/業務秘密/成果物は入力しない。
10. 「保存済み・開始の案内をお待ちください」、本人API `GET .../personal-learning/profile` とINITIALIZED/ALREADY_INITIALIZED receipt、PERSONAL_LEARNING_PILOT_PROFILE_INITIALIZED Eventを確認。管理者代入/既存Profile上書きなし。通信喪失は画面を維持して同じ内容を手動再送、失効/競合は停止して再読取。
11. Goal/Plan/Assignmentなし（Profile準備条件）を確認。準備UIの合成操作は確認済みだが実本人/実DB/実スマートフォンはこのPhaseの実施証拠が必要。

## Phase G — Pilot Enable（別開始承認）

Migration、deploy/V1 smoke、3版APPROVED、内部参加者/Profile、Provider/価格・実課金同意、Admission、停止/drain、logs、PrivacyがすべてPASS/READYでない限りON不可。Definition/Profile/Participantの準備flagsを全てfalseにする。運用flagと単一authorityはSTOP経路のため維持し、全instanceで同一scope・停止担当の到達性を確認する。

人間がGETで最新stateTokenを取得・レビューし、pilot-operations STARTでstatus=ACTIVE / personalLearningPilot.enabled=trueを設定する。この時点では両実行flagはfalse。台帳/allowlist/participantControl/通知offを維持し、別承認で環境の両実行flagをtrueへ反映。最後の必要条件が揃う瞬間に実行可能になるため、その時刻・担当者・送信費用承認を記録する。順序と反映範囲はownerが確定し、旧deploy到達を遮断する。

既存APIのCONFIGURE/ADMIT/APPROVEでenableはできない。pilot-operationsの人間レビュー・実環境検証、反映/drainが不明ならこのPhaseはBLOCKED。架空の `/enable` APIや直接DB手入力で進めない。

内部本人GET/ページを確認し、対象外/匿名/別Enrollmentで拒否、外部枠0を確認。否定試験に実個人データを覗かない。準備APIは閉じたことを確認する。

## Phase H — Production E2E（実施時だけ実課金）

1. 一人目が実スマートフォンで本人Login→専用Service→同Enrollmentページ。ブランドはマナベルスタイル by ワタシワークス、内部key/Versionを利用者へ要求しない。
2. 「何を学べばいいか分からない」→Prompt選択、または「プロンプトを学びたい」。P1-A→P1-Dで必要質問のみ、Goal候補はまだ未確認。本人が「これを学ぶ」→CONFIRM_GOAL、Goal正本program_member_goalsとconfirmation記録を照合。
3. PREPARE_PLANでDRAFTの3Stepを表示→「このプランで学ぶ」でCONFIRM_PLAN。本人Goal確認とPlan確認を別に行う。3Step=3日/研修修了とは扱わない。
4. 「今日の学習を確認する」→NEXTでPROMPT_STRUCTURE→PROMPT_BASIC。Definition/Mission/Plan revisionを混同せず同scopeのAssignment一件を確認。
5. 支援GUIDED/HINTED/INDEPENDENTを選択→実践開始。本人が安全な架空題材で自身のAI Toolへ入力、出力を自分で確認、必要なら修正。マナベルスタイルが完成成果物を返さない。外部Tool操作は本人申告でありシステム観測と同一視しない。
6. 「自分でAIへ入力した」「結果を自分で確認した」、実際に修正した場合のみ任意SELF_REVISEDを記録。本人が書いた指示を回答として提出。完成メール/外部AI応答本文は貼らない。
7. 既存Answer保存→evaluate→Job/既存Assessment Provider。待機中は状態確認、FAILED/UNKNOWNをPASSへ補完しない。Job/attempt/leaseとAdmission、PERSONAL_LEARNING_AI_CALLを照合する。
8. 評価の良い点/復習点を確認。PASSかつ本人操作/確認・役立つ結果の明示申告が揃った場合のみ「本人の実践完了を記録する」。REVIEW/RETRYなら再挑戦し、First Successを先行記録しない。
9. First Successは同Enrollment一件のPERSONAL_LEARNING_FIRST_SUCCESS。Practice completed、版付きREADY Assessment/ANSWER_EVALUATED、SELF_PROMPTED/SELF_EVALUATED、本人完了/有用申告、支援量を照合。成果物品質/Capability Level認定とは別。全自動Level1〜5確定なし。
10. Fitを回答し、完了記録後に次学習へ。RouterでNEXT CONTEXT_SETTING→CONSTRAINT_SETTING、またはREVIEW/RETRY。UNKNOWN/BLOCKEDは停止・固定reasonを調査し、実環境でわざと不正Evidenceを作らない。
11. Logout→Login→同URLでGoal、Plan/current revision、Assignment/回答/評価、Practice/First Successが復元され続きから利用できることを確認。まだ再Loginはsyntheticでなく実本人sessionで検証する。
12. Plan全完了を確認する場合もGoalを自動ACHIEVED、Enrollmentを終了、研修修了にしない。

### 必須境界・観測試験

既存ACTIVE Primary Goalがあると新Goal確認は拒否される。境界試験はGoal確定前、または二人目の新規内部Enrollmentで実施し、試験目的のGoal削除/置換をしない。

| 試験            | 操作と期待結果                                                                                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CONTENT_REQUEST | 「メールを作って」→代行せずLearning変換確認→本人YES→Prompt候補→本人Goal確認→既存3Definitionの実践。メール専用Definition/完成品生成なし                                                                |
| CONSULTING      | 「売上を上げる方法を考えて」→対象外、Goal/Practice/事業提案を生成しない                                                                                                                               |
| Gap             | 「動画生成を学びたい」→準備中/LEARNING_DEFINITION_GAP、Definition自動生成/Codexなし                                                                                                                   |
| Provider        | taskType/provider/model/input/output/cache tokens/latency/estimated cost/pricingVersion/success/validation/errorをP1-Gで確認。tokens/price欠損はUNKNOWN。successはschema成功でAssessment PASSではない |
| Admission       | daily/concurrent/byte/output/unauthorizedは既存自動テストに紐付け、本番で上限を使い切る/timeoutを誘発する試験はしない                                                                                 |
| Privacy         | Vercel/Job logs・ProgramActionEvent metadata・AiUsageEventへ相談/Answer全文/System Prompt/Provider response/成果物/秘密がない。Answer正本への必要回答保存とTelemetry複製を区別                        |
| V1              | 別の既存V1本人で旧画面/Runtime継続。Pilot Assignmentは旧候補/保存経路に入らない                                                                                                                       |
| LINE            | Pilotの通知off・reserved送信拒否・queue/broadcast無しを確認。誤送信試験のため実送信しない。既存V1 LINEは通常ログ確認                                                                                  |
| Kill Switch     | 一度停止→新規UI/NEXT/評価/Provider拒否→送信済みcall/drain確認→V1継続。再開は人間再承認。停止試験を省略してWave1へ進まない                                                                             |

## Phase I — Observation

内部1〜2人が最低1Planまたは十分な縦フローを完走するまで観測。固定日数を自動設定せず、責任者が監視間隔/通知先/許容latency/原価Alert/5xx閾値を開始前に承認する。各初回Assessment直後と各session終了時に確認する運用を候補とする。

Vercel runtime logsでrequestId/HTTP 5xx/fixed error、Router status/reason、Provider error/timeout、Job失敗・retryを確認。DBではscope限定でAssignment重複、current Goal/Plan、Event、Admissionの日次attempt/未終了枠を照合する。[P1-G SQL](P1G_AI_COST_ANALYSIS.sql)はworkspace/group/期間をbindして利用し、Programを対象へ限定。canonical原価はAI_CALL Eventのみ、AiUsageEventを再加算しない。

確認Event: PERSONAL_LEARNING_PRACTICE_STARTED / CAPABILITY_INTERACTION / PRACTICE_COMPLETED / FIRST_SUCCESS（いずれもPERSONAL_LEARNING_接頭辞）、PERSONAL_LEARNING_PILOT_FIT、PERSONAL_LEARNING_ASSIGNMENT_BRIDGED、PERSONAL_LEARNING_PLAN_COMPLETED、PERSONAL_LEARNING_AI_CALL。ruleVersion、plan/revision、exact Definition、Support、本人申告とAssessment参照を別Evidenceとして扱う。WaveはSeat.kind/cohortで識別する。

UNKNOWN/BLOCKED/repeated RETRY、duplicate Assignment/call、cost UNKNOWN、Telemetry保存失敗を成功件数へ混ぜない。反復やAlert検知で拡大停止し停止担当へ連絡。本文をdebug logへ増やして調査しない。

## Phase J — Wave 0判定 / Wave 1移行

E2E、再Login復元、First Success/Capability Evidence、停止/drain確認が証拠付き成功で、cross-tenant/Privacy/RLS/data loss/V1/LINE影響/重大Provider問題/原価異常/重複call・Assignment/Goal・Plan破損/Capability誤確定/Critical UX blockerがない場合だけ人間がWave1をレビューする。

一件でも重大問題、または証拠不明ならNO-GO。単に5xxがなく一度PASSしただけで移行しない。費用は既知小計だけでなく欠損とProvider側請求/計測の差も確認する。Wave1承認は別操作で、停止/drain→CONFIGURE currentWave=1（累計外部5）→外部参加者準備→再開始承認。自動Wave昇格・100人募集は本書の対象外。

## Phase K — Rollback / 保全

まず冒頭Emergency Stop、Pilotだけ停止して既存V1を維持。Application rollbackは既知正常SHAと最新DB互換性を確認し、全instanceの実行flag OFFを保つ。旧版はSeat/Admissionを迂回し得るためenabledで戻さない。

DBは原則rollbackせず履歴を保全しforward-fix。逆DROP/適用済みfile編集/枠再利用/Goal上書きで障害を隠さない。restoreが必要なら環境ownerと障害責任者の別承認、全writer影響/停止、復元timestamp、以後の本人削除・退会・保持期限の再適用を確認するまで公開再開しない。

## 残作業 / Blocker / 安全な支援

1. 実Application/公開SHA、Supabase project/17.6、最新成功Backup、3 pending/5 table不存在はRead-only監査で確定。残るApp↔DB接続照合・owner/role・全checksum/drift・隔離restore/RTO・lock/RLS実アクセスを確認する。Production側40/main側79の分岐履歴を保全してreleaseを別レビューする。
2. pilot-operations実装PRを人間レビュー。停止中Enrollment準備とSTART/STOPの隔離環境試験を確認し、本番の停止担当・全instance反映/drainを確定する。APIの存在だけで本番GateをPASSにしない。運用flagとauthorityはSTOPのため維持し、通常準備flagを閉じることと混同しない。
3. 内部人数/Provider source/model/価格/上限/予算/監視/Privacy保持・同意を人間承認。3Definitionの教育レビュー/APPROVE、内部Seat/Profile、全Release Gateを実証する。
4. 別releaseと開始承認後にのみ実Provider/実スマートフォンE2E、Kill Switch、状態復元を実施しWave0結果を判定。

Codexの安全な支援はGit/CI差分整理、SQL/command/API bodyのレビュー（秘密なし）、隔離環境テスト、証跡の構造化と欠損整理まで。今回の別指示で許可されたProduction Read-only監査は完了し、追加操作へ自動継続しない。人間が別途操作/承認するものはBackup復元、Migration、deploy、Definition承認、設定、内部参加者登録、本人Profile回答、enable、実課金、Wave1移行。文書作成後停止する。

### 根拠と回帰試験の入口

API操作は本人/管理者が対象originへ通常Loginしたsessionで、Originを送れる承認済み同origin操作手段を使用する。JSON Content-Type、queryなし、資格情報のコピー禁止。専用管理UIはないため、操作担当がレビュー済みrequest bodyを同originの管理者ブラウザ等から送信する手順・receipt保管を事前に確定する。CLIへsession Cookieを転記する手順は採用しない。GET/POST形式を示しただけでは操作担当のREADYにならない。

隔離テストはrootから `pnpm --filter web exec vitest run test/personal-learning-call-admission.test.ts test/personal-learning-ai-call-provider.test.ts test/personal-learning-ai-call-worker.test.ts test/personal-learning-line-isolation.test.ts test/personal-learning-participant-admin.test.ts test/personal-learning-preparation-access.test.ts`、Packageは `pnpm --filter @bunshin/capability-training test`、DB統合はCIのdatabase jobで確認する。実Production credentialでローカルテストを起動しない。release全体は `pnpm format:check` / typecheck / lint / test / buildのCI結果を採用SHAへ対応させる。

- 準備/実行/Admission: `apps/web/src/services/personal-learning-{preparation-access,pilot-access,call-admission}.ts`、`packages/database/src/personal-learning-{preparation-authority,participant-admin,assessment-gate,call-admission}.ts`。
- Contract: `packages/application/src/personal-learning-call-admission.ts`、`packages/capability-training/src/{personal-learning-pilot,pilot-participant-cap,learning-consultation,learning-definition-fixtures,guided-practice,learning-router}.ts`。各packageの公開exportsを使用する。
- API/UI: `apps/web/src/http/{programs,learning-definition-approval-admin,personal-learning-participant-admin,personal-learning-pilot,personal-learning-pilot-profile}.ts`、既存Program pageとProfile/Pilot Card。
- Provider/Privacy: `apps/web/src/ai/runtime-provider-configuration.ts`、`apps/web/src/providers/openai-training-answer-evaluator.ts`（45秒timeout/store=false/1fetch）、`apps/web/src/jobs/training-answer-evaluation-job-handler.ts`、`packages/database/src/{guided-practice,personal-learning-ai-call}.ts`。
- 否定/回帰: Web `personal-learning-{participant-admin,preparation-access,pilot-access,call-admission,ai-call-worker,ai-call-provider,line-isolation,pilot-http,pilot-ui,pilot-profile,profile-preparation-ui,profile-preparation-page}.test.*`、application/capability-training tests、database `personal-learning-persistence.integration-cases.ts` と `personal-learning-{ai-call,pilot-profile}.test.ts`。実DB統合はCI disposable DBのみ。source/テスト成功は実環境のPASSではない。
- 2026-10-07合成Profile画面: 未選択/本人確認前拒否、正常保存、応答喪失同body再送、404/409停止、保存済み非編集、320/390px確認。本番Auth/DB/実端末は未検証。新実装・本番操作なし。
