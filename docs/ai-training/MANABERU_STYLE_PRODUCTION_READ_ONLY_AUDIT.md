# マナベルスタイル — Production Environment Read-only Audit

## 結論・監査境界

2026-10-07 JST、08:52時点の監査。基準mainは `c4d103a9b82df10f4e1fb57901c8a70c6899e0b6`（#1166）。監査branch: `codex/production-read-only-audit`。

**Wave 0はNO-GO。** Vercelの正式aliasに紐づく公開SHAは `87c5fafcdf9b84c67dd33aef41860368415ca789`（#1143）。Personal Learningのコード・3 Migration・5 table・設定・承認・内部参加権が本番に揃っていない。mainのCI成功と本番開始可否は別である。

Productionは変更していない。既存認証済みChromeのSupabase Dashboard、認証済みVercel CLIのGET、Git/GitHub read、明示的な `BEGIN READ ONLY; SELECT ...; COMMIT;` のみを用いた。SQL Editorのscratch入力は保存していない。Migration、deploy、DML/DDL、承認、INITIALIZE/PREPARE_ENROLLMENT/START/STOP、flag/secret変更、ログイン、実Provider、課金、LINE、スマートフォン操作試験は未実施。環境値・credential・相談/Answer/成果物本文・名簿は取得/記載しない。

証拠の種類を分離する: **実環境metadata / DB SELECT / Repository設計 / 未検証**。識別情報は秘密ではないが、運用用UUID・session・backup・個人情報の詳細は本書へ追加しない。結果はpoint-in-timeであり実行直前の再確認が必要。

## Production Application / Deploy

| 項目              | 実読取結果・根拠                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Hosting           | Vercel、project `bunshin-platform-web`、team `team478a's projects`、scope `team478as-projects`                                |
| project           | `prj_2HlX8dPsGNKYP3BCvNoUEKBoXyvv`。project inspect / GET project metadata                                                    |
| 正式URL           | [www.watashi-works.com](https://www.watashi-works.com)。aliasに対応するdeployment inspectで同定。画面/E2E操作はしていない     |
| Production branch | 実project `link.productionBranch=production`。RepositoryもproductionのみGit deploy                                            |
| 公開deployment    | `dpl_RYznLr9A7X9A6zcTeYna5C31yTJb`、target production、READY                                                                  |
| 公開commit        | `87c5fafcdf9b84c67dd33aef41860368415ca789`、GitHub team478a/bunshin-platform、ref production、#1143                           |
| deploy生成時刻    | 2026-10-06 00:40:04 JST。createdAt=1791214804443。READY時刻は00:43:24 JST                                                     |
| runtime / region  | project Node.js24.x / Next.js / root apps/web。deployment function metadata nodejs24.x、hnd1                                  |
| deploy機構        | Git production更新→Vercel Build。creator metadataはteam478a。現在のrelease担当者/承認権限はUNKNOWN                            |
| main CI           | [CI 37545719072](https://github.com/team478a/bunshin-platform/actions/runs/37545719072) completed/success、監査main SHAに対応 |
| rollback対象      | 現公開SHAは識別できた。ただし新schema適用後との互換性・全alias/旧deployment/workerの切替手順の実証はUNKNOWN                   |

根拠: `apps/web/vercel.json`、`docs/DEPLOYMENT_GUIDE.md`、Vercel `project inspect`、`inspect formal-alias --json` の限定抽出、GET `/v13/deployments/{id}` / `/v9/projects/{id}`。API応答全体は報告書へ保存しない。

### mainとの関係

分類は **AHEAD / DIVERGED**。単純なBEHINDとしない。

- production側のみ40 commit / main側のみ79 commit。
- merge-base: `9e063dd8ebc905b91b005bc317c43797e22a6931`。
- production専用履歴には過去release mergeやrelease文書を含む。40件を40機能差分と同一視しない。productionをmainで強制上書きしない。
- main側にP1-A〜P1-F、P1-C-S、Cost、Learning First V2、Gate、Hard Cap、Profile UI、Operationsを含む23 first-parent PR mergeがある。
- #1162（6575276b）、#1164（ffca7570）、#1166（c4d103a9）は公開SHAの祖先に含まれない。実Deploymentにも最新Pilot一式は未収録。
- 全commit一覧を末尾に記載。releaseはproductionとmain双方の履歴/実tree差分をレビューして別PRで決める。監査docs PRをproductionへ直接出さない。

再現read:

```powershell
git rev-parse origin/main origin/production
git merge-base origin/main origin/production
git rev-list --left-right --count origin/production...origin/main
git log --format="%h %s" origin/production..origin/main
git log --format="%h %s" origin/main..origin/production
git diff --stat origin/production...origin/main
```

## Production Database / Environment分離

| 項目                         | 結果                                                                                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard上のProduction DB   | Supabase `bunshin-platform-prod`、team478a's Org PRO、main PRODUCTION、project ref `vtkzinaudznwbsjoyszk`                                                                     |
| DB type / version            | PostgreSQL17.6、database postgres。Dashboard SQL結果                                                                                                                          |
| region / compute             | Tokyo ap-northeast-1、MICRO t3.micro、Healthy。監査時overview                                                                                                                 |
| SELECT実行role               | postgres。superuser=false、BYPASSRLS=true                                                                                                                                     |
| その他role                   | service_role: superuser=false / BYPASSRLS=true。anon/authenticated: 両方false                                                                                                 |
| 接続方式（Repository）       | Prisma DATABASE_URL / DIRECT_URL。Vercel Migration runnerはSupabase direct hostをsession pooler:5432へ変換する経路あり                                                        |
| 接続方式（実Application）    | **UNKNOWN**。Secretを開かず、実DATABASE_URL/DIRECT_URLの接続先・role・pool modeは照合できていない                                                                             |
| Production Appと上記DBの一致 | **UNKNOWN**。DB名/現行Migration/Provider設定は一致を示唆するが接続先証明ではない。読み取り可能な非秘密接続metadataを環境ownerが照合する                                       |
| staging / dev / test分離     | Repositoryは分離を前提。実接続先一覧・別DBの実在はUNKNOWN。環境名だけで分離PASSにしない                                                                                       |
| preview環境の注意            | NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEYのenv entryはpreview/production共通target。値は読んでいない。同じDBを使うとは断定しないがAuth/DB分離の確認事項 |

SQL EditorはProduction projectに既存ログイン済みの状態を利用。Connect表示、password、connection string、JWT/key平文は開いていない。postgresによるSELECT成功はApplication roleのgrants安全性の証拠ではない。

## Migration / Schema / RLS

Production `public._prisma_migrations` は227件。最新は `20261005030000_training_support_skill_lifecycle`。未完了かつ未rollbackの履歴0件、20261006000000以降のMigration履歴0件。Repositoryは230 migration directory。全227件のchecksum/rollback済み履歴/旧schemaを完全照合していないため **全体driftはUNKNOWN**。Supabase Dashboard側の「No migrations」はSupabase CLIの履歴でありPrisma適用なしとは解釈しない。

以下の5 tableは `pg_class` / `pg_namespace` のpublic一致件数 **0**。

| Migration（packages/database/prisma/migrations配下のmigration.sql） | table / 制約 / RLS                                                                                                                                                                                                     | 実本番                  | lock・rollback注意                                                                                                          |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 20261006021000_personal_learning_persistence                        | personal_learning_goal_confirmations、personal_learning_plan_revisions、learning_definition_approvals。Goalの複合unique index、scope付きGoal/Enrollment/Membership FK、Revision/確認・approval制約、3 table RLS ENABLE | PENDING、3 table ABSENT | 既存Goalへの通常index作成とFK関連lock。additiveでも時間/旧writer互換性UNKNOWN。履歴保全・forward-fix優先                    |
| 20261006120000_personal_learning_call_admission                     | personal_learning_call_admissions。scope FK、operation hash unique、day/open index、settlement/hash CHECK、RLS ENABLE                                                                                                  | PENDING、table ABSENT   | 新table/index/FK、実lock時間UNKNOWN。in-flight/未settled台帳を削除しない                                                    |
| 20261006140000_personal_learning_pilot_seat                         | personal_learning_pilot_seats。participant/seat/enrollment unique、kind/cohort/seat CHECK、scope FK、Enrollment FK SET NULL、RLS ENABLE、Enrollment削除時redact triggerとProgram marker維持trigger                     | PENDING、table ABSENT   | 新tableに加え既存Program/Enrollment trigger導入。旧delete/settings writeとの互換性・lockを隔離検証。seat再利用/台帳削除なし |

SQLにDROP/TRUNCATE/既存データbackfillはない。ただしtriggerの将来動作は既存writeへ関与するため「影響ゼロ」ではない。実データ件数によるMigration所要時間、lock、許容timeout、backup/restore後の整合はUNKNOWN。本番適用していない。

5 tableが不存在なのでそのindex/FK/RLS/policyも現本番には不存在。**Wave 0のSchema/RLS readinessはFAIL**。SQL設計はENABLEのみ、FORCE RLS/public policy追加なし。適用後、anon/authenticated/server roleの実grant・アクセス否定・owner/BYPASSRLS条件を確認する。service_roleやpostgresのbypassをtenant保護の代用にしない。Applicationのscope再認可も必要。

安全な確認SQLの例（監査で実行したSELECTの要約）:

```sql
BEGIN READ ONLY;
SELECT current_setting('server_version'), current_database(), current_user;
SELECT count(*), max(migration_name) FROM public._prisma_migrations;
SELECT count(*) FROM public._prisma_migrations
 WHERE finished_at IS NULL AND rolled_back_at IS NULL;
SELECT count(*) FROM public._prisma_migrations
 WHERE migration_name >= '20261006000000';
SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN (
 'personal_learning_goal_confirmations','personal_learning_plan_revisions',
 'learning_definition_approvals','personal_learning_call_admissions',
 'personal_learning_pilot_seats');
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles
 WHERE rolname IN ('postgres','service_role','authenticated','anon');
COMMIT;
```

## Backup / Restore

[Scheduled Backups](https://supabase.com/dashboard/project/vtkzinaudznwbsjoyszk/database/backups/scheduled) と [Restore to new project](https://supabase.com/dashboard/project/vtkzinaudznwbsjoyszk/database/backups/restore-to-new-project) を閲覧した。Restoreボタンは押していない。

- 日次Physical Backup。最新 **2026-10-06 20:44:04 UTC / 2026-10-07 05:44:04 JST**、Restore to new project一覧で **COMPLETED**。
- 表示履歴は2026-09-29〜10-06 UTCの8件、すべてCOMPLETED。表示件数は契約上のretention保証ではない。正式retentionはUNKNOWN。
- PITR画面は「available as an add-on / Enable add-on」: **無効**。追加購入/変更なし。
- Storage APIのobject本体はDB Backupに含まれない旨が画面に明記。DB restoreだけでobject復元を保証しない。
- 復元経路はDatabase→Backups→ScheduledのRestore（Production上書きはしない）、または **Restore to new project BETA**。隔離projectへの復元を優先候補とする。
- 具体的なrestore実行者/権限、容量・費用、所要時間、restore先region、接続/secret再設定、切替と撤回、RPO/RTOはUNKNOWN。画面のボタン存在は実権限/復元成功ではない。
- 過去のdisposable PostgreSQL16合成dump復元はProduction Supabase17.6の実Backup復元実績ではない。
- Backup実在/最新成功はPASS、**restore readinessはUNKNOWN/BLOCKER**。

**最初の人間操作（1つ）:** 環境ownerが、最新COMPLETED Backupを **Productionとは別の隔離projectへ復元するリハーサル** を承認済み手順で実施する。Productionへの上書き/切替をしない。新projectの費用・権限・機密データ管理を実行前に人間が承認する。この監査はその実行承認ではない。

## Environment / Secret

Vercel projectのproduction-target env entry名/type/targetだけをGETで読んだ。個別値取得、decrypt、env pull、secretを含むraw応答出力はしない。以下SETは **entry存在** の意味で、値の正しさ/公開deploymentへの反映/有効期限を保証しない。

| env name                                                                                                               | project Production entry                                           |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| DATABASE_URL / DIRECT_URL                                                                                              | SET（sensitive）                                                   |
| SUPABASE_SESSION_POOLER_HOST                                                                                           | SET                                                                |
| SUPABASE_AUTH_ADMIN_URL / SUPABASE_AUTH_ADMIN_ENV                                                                      | SET                                                                |
| SUPABASE_SERVICE_ROLE_KEY                                                                                              | SET（sensitive）                                                   |
| NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY                                                        | SET（preview/production targets）                                  |
| APP_ENV / APP_URL / LOG_LEVEL                                                                                          | SET                                                                |
| SESSION_SECRET / ENCRYPTION_KEY / CRON_SECRET                                                                          | SET（sensitive）                                                   |
| OPENAI_API_KEY / OPENAI_MODEL                                                                                          | NOT_SET（DB admin configuration経路あり、直ちにkey不足とはしない） |
| PERSONAL_LEARNING_PILOT / PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT                                                    | NOT_SET                                                            |
| PERSONAL_LEARNING_PILOT_OPERATIONS / PERSONAL_LEARNING_PRODUCTION_PREPARATION                                          | NOT_SET                                                            |
| PERSONAL_LEARNING_DEFINITION_ADMIN / PERSONAL_LEARNING_PROFILE_PREPARATION / PERSONAL_LEARNING_PARTICIPANT_PREPARATION | NOT_SET                                                            |
| PERSONAL_LEARNING_CALL_ADMISSION / PERSONAL_LEARNING_AI_PRICING                                                        | NOT_SET                                                            |

Secrets運用場所はVercel env設定と暗号化DB Provider configuration。secret rotation/編集権限/担当者/漏洩検知はUNKNOWN。既存SET値を置換しない。

Pilotは最新mainのstrict-true判定上 **OFF相当（project flags未設定）**。実公開版にはPilotコード自体がなく、DB markerも0件である。公開deployment runtime env snapshotの厳密照合は未実施なので、「全instanceの実flag値を読んでOFF証明」とはしない。PreparationもOFF相当/利用不可。

## Provider / Model / Pricing / Cost Safety

秘密を含まないProduction ACTIVE configurationのSELECTにより、OPENAI / model **gpt-5-mini** / version1 / credential SET / paused=false / verified=true を確認。実keyの復号/検証/Provider requestは行わず、現在の外部API有効性・残高・Rate LimitはUNKNOWN。DBのverifiedは過去検証状態であり今回の実疎通PASSではない。Application接続先とAPP_ENV値の照合が未済のため、実AI Trainingがこのrowを選ぶことの完全なruntime証明はUNKNOWN。

根拠:

- `apps/web/src/ai/runtime-provider-configuration.ts`: ACTIVE admin設定を優先し、不存在時のみlegacy env fallback。model必須。ENCRYPTION_KEYによる復号は本監査で呼ばない。
- `apps/web/src/providers/openai-training-answer-evaluator.ts`: Responses endpoint（api.openai.com/v1/responses）、45秒AbortSignal timeout、store=false、1回fetch。Pilot Admissionからmax_output_tokens/request byte上限を供給。
- Jobの再試行はProvider内部retryと別。実job設定/現在のin-flight/再送件数は未調査。既存V1の費用運用をPilotの安全性証拠にしない。
- `packages/application/src/ai-call-observability.ts` / `apps/web/src/observability/personal-learning-ai-call.ts`: env **PERSONAL_LEARNING_AI_PRICING** がPricing Registry正本。provider/model/effectiveFrom/inputPriceMicrosPerMillion/outputPriceMicrosPerMillion/cachedInputPriceMicrosPerMillion/currency/pricingVersion。実env未設定なので各価格/価格版/発効日 **NOT_SET**。市場価格を調査・変更していない。推定費用はUNKNOWNで0にしない。
- `packages/application/src/personal-learning-call-admission.ts`: env **PERSONAL_LEARNING_CALL_ADMISSION** のexact8 keys: workspaceId/groupId/serviceProgramId/dailyAttemptLimit/maxConcurrent/model/maxRequestBytes/maxOutputTokens。
- 実ProductionはAdmission env NOT_SET / table ABSENT / Admissionコード未Deploy。日次・同時・byte・output値は **NOT_SET/利用不可**、安全値評価不可。latest mainは設定欠損でfail-closedだが、それを公開版に存在するとはしない。
- 金額建てHard StopやProvider側rate limitの現在値はUNKNOWN。呼出回数/同時枠制限は金額上限保証と異なる。Wave0の低い上限・価格・予算・監視担当を人間承認するまでNO-GO。

## Participant / Definition / Auth / Privacy

| 項目                | 実本番状態                                                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pilot Program       | `service_programs WHERE settings ? 'personalLearningPilot'` count=0                                                                                                     |
| Seat数              | **NOT_AVAILABLE**（seat table不存在）。参加者0 rowsと断定しない                                                                                                         |
| Internal Wave0準備  | Pilot seat/Profile preparationの準備状態はNOT_READY。個人名/UUID/メールは調べず、通常User存在数をinternal人数へ置き換えない                                             |
| Hard Cap / Wave     | mainにはabsolute external100、internal/external分離、wave cumulative0/5/20/50/100、seat非再利用・unique/lockあり。現公開コード/DB/policyはNOT_READY                     |
| Internal cap        | policy契約は0〜100を許容するが、Wave0 STARTは内部1〜2人で別gate。実値NOT_SET。5や100を承認済み初期値としない                                                            |
| Definition approval | PROMPT_STRUCTURE / CONTEXT_SETTING / CONSTRAINT_SETTING: **NOT_FOUND（approval table不存在）**。DRAFTやAPPROVEDへ推測変換しない                                         |
| Definition版        | code fixture AI_TRAINING_DEFINITION_FIXTURE_V1。fixtureはHuman Approvedではない                                                                                         |
| Auth                | RepositoryはSupabase SSR current-user/getUser + DB active user、同originPOST、Service管理権限、scope authorityを再検証。認証済みDashboard利用は受講者実Auth試験ではない |
| 実Auth/session      | Cookie属性/公開APP_URL/same-origin挙動/実admin権限/本人権限はUNKNOWN。ログイン操作なし                                                                                  |
| mobile入口          | 正式origin配下 `/s/{serviceSlug}/programs/{programEnrollmentId}`。Pilot未準備なので実slug/Enrollment URLは未確定。スマホ操作試験なし                                    |
| Privacy             | sourceではTelemetryを構造化し本文を複製しない。実Log保持/アクセス/過去本文漏洩/同意運用はUNKNOWN。raw Log/Answer/相談/成果物を取得しない                                |

## Logs / Monitoring / V1 / LINE / Kill Switch

観測場所:

- Vercel `bunshin-platform-web` のdeployment Build/Runtime Logs: Web/API 5xx、固定reason、Job/Provider failure。閲覧者/retention/alert通知先はUNKNOWN。
- Supabase project Logs / Observability: DB/Auth/API等。OverviewはHealthy、Postgres直近24h error表示12件。過去のSELECT構文エラーを含み得るため全件を製品障害と断定しない。内訳/原因はUNKNOWN、本文・秘密を含むraw logは未取得。
- DB `program_action_events` / `program_audit_logs` / jobs / `ai_usage_events`: scope付き事実。P1-G canonical `PERSONAL_LEARNING_AI_CALL` は最新mainのみ。二重加算なし、SQLは `docs/ai-training/P1G_AI_COST_ANALYSIS.sql`。
- Admission/Seat/Plan tableは不存在。START/STOP `PILOT_OPERATION_*` audit sourceはmain実装のみ。現本番Pilot event/cost/operationsログ取得可能としない。
- uptime/error通知/担当者/DB alert/Provider alertの実稼働はUNKNOWN。新Monitoring導入なし。

V1/LINE隔離の**コード根拠（latest main）**:

- `personal-learning-pilot-access.ts`、`personal-learning-assessment-gate.ts`、evaluation queue/workerのfresh DB再認可、Seat/allowlist/Program状態確認。
- `training-runtime-{candidate,state,decision}-repository.ts` はPilot ProgramとPlan Assignmentを旧Runtimeから除外。
- `ai-training-action-line-scheduler.ts`、`service-line-broadcast-eligibility.ts` とLINE isolation tests。notifications=false、Pilot LINEを接続しない。
- これらは現在公開SHAにない。実Pilotが未稼働なので現時点の新Pilot影響は開始していないが、release後の既存V1 Smoke・LINE誤送信否定を省略しない。実ユーザー/V1操作とLINE送信は未実施。

Kill Switchの**将来経路**: `GET/POST /api/services/{serviceSlug}/ai-training/pilot-operations`、操作STOP。env PERSONAL_LEARNING_PILOT_OPERATIONS + exact scope PERSONAL_LEARNING_PRODUCTION_PREPARATION + 実管理者/同origin権限が必要。STOPはruntime flags ONでも使用でき、最新settingsを保全してProgram SUSPENDED/enabled=false、notifications=falseへ変更する。今回実行していない。現在公開版はendpoint/authority未準備で **Kill Switch readiness FAIL**。

Multi-instance: Vercel serverless + shared DB + Cron jobs/schedule・run（毎分）。mainのProgram DB gateは最新読取をqueue/worker/送信直前に行う。env変更だけの即時全instance伝播保証なし。旧deployment URL・worker・cache・送信直前とのrace・完了後保存を含む全instance停止/drainは未実証。

In-flight Provider: 45秒のローカルAbortSignalはProvider側課金/生成取消保証ではない。STOPは新規call拒否、既送信call取消API/集中cancel機構なし。Job/Admission settlementで追跡し、未settled枠をTTLだけで解除しない。serverless実行上限と45秒の整合、外部Providerでの終了、STOP後保存の実証はUNKNOWN。Wave0前に監視/停止担当と対応を合意する。未知in-flightを「0」としない。

## 実環境向け順序（未実行）

1. 環境owner/責任者を決め、App↔DB/role/環境分離/全履歴を非秘密metadataで照合。隔離Backup復元を確認、Migration直前の新しいBackup/RPOを人間承認。
2. productionとmain両側の差分を保全してrelease SHAとrollback互換性をレビュー。3 pending SQLのlock/trigger/旧writer互換性、実role/RLS否定を隔離環境で確認。
3. **MigrationとApplication releaseを承認**。既定Vercel Buildは `db:migrate:vercel → db:assert-ready → build`、全pendingを一括適用。Deployment/buildを起動するとMigrationも起動する。個別のschema確認を公開前に挟むなら承認済み別runnerをレビューし、二重runnerを防ぐ。schema検証コマンドだけでRLSをPASSにしない。
4. Pilot OFFのままSchema/RLS/FK/index、公開SHA、V1/既存Service/Admin/LINE Smokeを確認。失敗/lock/drift/権限不明で停止。
5. 人間レビュー後のみDefinition approval、Pilot INITIALIZE/config、internal enrollment/seat/Profileを停止中に準備。価格/Admission/操作authorityは人間が承認して設定。
6. 全Release Gateの実証後だけSTARTを別承認。実本人Auth/スマホ/実Provider/再ログイン/First Success/Capability/STOP/drainをWave0で検証。
7. Wave1移行は別レビュー。自動拡大・一般公開しない。

本監査は上記操作のどれも実行/承認しない。Application rollbackとDB restoreを分離し、Pilot OFFで保全できるならDBをDROP/巻戻ししない。

## GO / NO-GO Matrix

ここでのResultは **Wave0運用 readiness**。source実装済みやmetadata特定成功を実運用PASSと取り違えない。

| Gate                  | Result              | 根拠 / 残条件                                                                                 | 分類     |
| --------------------- | ------------------- | --------------------------------------------------------------------------------------------- | -------- |
| Production identified | PASS（一部UNKNOWN） | App / Supabase project同定済み、App↔DB実接続照合は未済                                        | REQUIRED |
| Deploy SHA            | FAIL                | 公開87c5、main c4d1とDIVERGED。Pilot未Deploy                                                  | BLOCKER  |
| Backup                | PASS                | 最新Physical COMPLETED 05:44 JST。直前RPO/retention確認が必要                                 | REQUIRED |
| Restore               | UNKNOWN             | 隔離復元経路あり、実績/権限/RTO不明                                                           | BLOCKER  |
| Migration readiness   | FAIL                | 3 pending、実lock/drift/runner承認未済                                                        | BLOCKER  |
| RLS                   | FAIL                | 必要5 table不存在。適用後の実role/access否定未済                                              | BLOCKER  |
| Pilot OFF             | PASS（限定）        | project flags未設定、Program marker0、公開Pilotコードなし。全runtime snapshot値の実証ではない | REQUIRED |
| Provider config       | UNKNOWN             | OPENAI gpt-5-mini/key SET/verified。App↔DB/runtime/key有効性未済                              | REQUIRED |
| Cost safety           | FAIL                | Admission/価格env未設定、ledger/コード未準備                                                  | BLOCKER  |
| Hard Cap              | FAIL                | table/policy/公開cap機構未準備                                                                | BLOCKER  |
| Definitions           | FAIL                | 3 approval NOT_FOUND                                                                          | BLOCKER  |
| Kill Switch           | FAIL                | STOP endpoint/authority未公開。drain未実証                                                    | BLOCKER  |
| Logs                  | UNKNOWN             | source特定、実alert/権限/retention/Pilot計測未検証                                            | REQUIRED |
| V1 isolation          | UNKNOWN             | main否定テストあり、release後実Smoke未実施                                                    | REQUIRED |
| LINE isolation        | UNKNOWN             | main隔離あり、release後設定/log検証未実施                                                     | REQUIRED |

その他分類:

- **BLOCKER**: App↔DB誤接続/role不明が解消しない、restore不可、schema/RLS未整備、停止手段なし、原価/参加権gateなし。Definition/内部準備未完ではSTARTしない。
- **REQUIRED**: release owner/実行権限、環境分離、Migration時間/lock許容、Alert担当/予算、同意/Privacy、Internal1〜2人、OFF Smoke、Provider configuration/runtime版一致。
- **ACCEPTABLE_RISK候補（未承認）**: in-flightを即cancelできない、PITRなし、固定監視dashboardなし。隔離Backup/RPO、低いAdmission、逐次1〜2人、監視担当/停止手順が揃い人間が認めた場合のみ。UNKNOWN自体を許容済みにしない。
- **AFTER_WAVE0**: 認証/停止/計測の必須確認を済ませた後の長期可視化・大規模dashboard。安全Gateは後回しにしない。

## UNKNOWN / 引継ぎ / 停止

未解消: 実App接続DB/role/pool、staging/dev/test分離、APP_ENV/APP_URL等実runtime値（秘密の取得不要）、全227履歴checksum/drift、Migration所要/lock、retention/restore権限/RTO/切替、release担当/全instance反映、外部API残高/rate limit、未送信/送信済みjob実数、cancel/drain実証、ログ保持/alert/同意/実Auth権限。必要な非秘密metadataと担当者証跡で解消する。

変更は監査文書とLaunch Runbookだけ。コード/schema/migration/env/Provider/実環境変更なし。docsはPrettierとgit diff --checkで検証し、コード回帰は基準main CI成功の証拠を参照する。実Production E2E成功とは扱わない。

Codexで安全に支援可能: Git/CI/差分整理、非秘密metadata/SELECTレビュー、文書更新、隔離検証の計画と証跡整理。人間操作は別承認のBackup復元/Migration/deploy/設定/approval/enrollment/START/STOP/実Provider。監査完了で停止し、Production操作へ続けない。

## 差分commit全一覧（監査SHA固定）

### main側のみ79件

```text
c4d103a9 Merge pull request #1166 from team478a/codex/personal-learning-pilot-operations
25097b7e feat(training): add reviewed closed pilot operations
2eca1605 Merge pull request #1165 from team478a/docs/manaberu-wave0-launch-runbook
a68e7c07 docs(training): add production Wave 0 launch runbook
ffca7570 Merge pull request #1164 from team478a/feat/personal-learning-profile-preparation-ui
2d4e119e test: narrow replay request body before JSON parsing
4ec958bd style: format learner preparation UI tests
9536a755 feat(training): add stopped-pilot learner profile preparation UI
4789eb6d Merge pull request #1163 from team478a/docs/personal-learning-wave0-final-readiness
95229931 docs(training): audit production Wave 0 final readiness
6575276b Merge pull request #1162 from team478a/feat/personal-learning-pilot-participant-cap
e14e74ba test: update scoped privacy mocks for pilot seat ledger
b3aa8758 test: fix participant preparation mock lint
bda1b3ea docs(training): separate participant cap decision from call admission
d1565ff7 fix(training): persist typed participant policy without redundant cast
ee1c60a0 fix(training): remove unnecessary seat projection assertion
8db6fbb3 fix(training): prevent capped pilot from falling back to legacy runtime
e9b0872a test(training): exercise production admission with live pilot seats
0c09fc03 fix(training): redact pilot seat on physical enrollment deletion
8da9b127 feat(training): enforce cumulative pilot seats and human wave control
a224b534 Merge pull request #1161 from team478a/feat/personal-learning-production-preparation
07b16516 test(training): scope preparation assertion to target service
e4a5964f feat(training): scope production preparation to stopped pilot
d2d31d74 Merge pull request #1160 from team478a/feat/personal-learning-call-admission
917e11fd fix(training): keep admission rejection asynchronous and exports explicit
27902087 feat(training): bound personal learning pilot provider admission
a10b2b2f Merge pull request #1159 from team478a/feat/manaberu-learning-first-v2a
648ba71d test(training): verify practice deletion and fix audit fixture
7a42c9b2 feat(training): add learner-created guided practice evidence
2c8ae284 Merge pull request #1158 from team478a/docs/learning-first-v2-gap-analysis
2ba1277a docs(training): audit Learning First V2 and user-created outcomes
8c88daab Merge pull request #1157 from team478a/feat/personal-learning-execution-gates
f6755138 test(training): assert fresh assessment authorization before provider
8ff2d3a2 test(training): remove redundant async from line mock
f025f3fc style(training): format pilot line isolation tests
e06c8985 docs(training): record legacy plan assignment isolation
87d7cad0 fix(training): keep plan assignments out of legacy runtime after marker loss
7dc0aada fix(training): do not record denied execution as an AI call
030278a9 feat(training): enforce closed pilot execution and LINE gates
3530d962 Merge pull request #1153 from team478a/docs/personal-learning-pilot-readiness
9feddcaf docs(training): audit production closed pilot gates and rollout
f84a4dc7 Merge remote-tracking branch 'origin/main' into docs/personal-learning-pilot-readiness
b462cdb9 Merge pull request #1156 from team478a/feat/personal-learning-pilot-profile
17820cdc feat(training): add isolated learner pilot profile initialization
f3b05fc1 Merge pull request #1155 from team478a/feat/personal-learning-definition-approval
5ed1493e test(training): represent missing review checklist with strict optional types
dd6aff14 fix(training): preserve membership lifecycle invariants in approval tests
01872730 feat(training): add scoped human definition approval operations
094f8366 Merge pull request #1154 from team478a/feat/personal-learning-ai-cost-observability
119bdf9a fix(training): align observation tests with strict lint rules
d674f084 fix(training): validate program references before recording call facts
6e5a9086 feat(training): observe personal learning assessment usage and cost
d74610aa docs(training): define personal learning pilot readiness gates
9dce361a Merge pull request #1152 from team478a/feat/personal-learning-pilot-ui-v1
6fd4a21d docs(training): record pilot verification evidence and remaining gates
aff7802f fix(training): keep completed pilot plan controls type safe
1587f1ac feat(training): connect restricted personal learning pilot UI and API
e663bbc3 Merge pull request #1151 from team478a/feat/personal-learning-router-bridge-v1
34aeb5c4 docs(training): record P1-E verification and implementation SHA
5409ff9b feat(training): bridge personal learning plans to existing missions
15751e98 Merge pull request #1150 from team478a/docs/personal-learning-persistence-release-gates
6db95993 docs(training): define P1-C-S production migration and approval gates
c152a09e Merge pull request #1149 from team478a/feat/personal-learning-persistence-v1
9a6fbf63 docs(training): report P1-C-S persistence verification and boundaries
b099b156 feat(training): persist confirmed learning goals and plan revisions
b7b99241 Merge pull request #1148 from team478a/feat/personal-learning-consultation-v1
a7e53ccc docs(training): report P1-D consultation verification and handoff
bddaf3a6 feat(training): add bounded learning consultation and goal candidates
12eca684 Merge pull request #1147 from team478a/feat/personal-learning-plan-definition-v1
1700585e docs(training): report P1-C verification and persistence handoff
fa39100c feat(training): add personal learning plan and definition contracts
74acfa9c Merge pull request #1146 from team478a/feat/personal-learning-profile-goal-v1
dfa28c20 docs(training): report P1-B Profile and Goal boundary verification
0ad93d41 feat(training): add minimal learner profile and Goal reference contracts
091b81a5 Merge pull request #1145 from team478a/feat/personal-learning-scope-v1
fddea7a1 docs(training): report P1-A boundary implementation and verification
709af4c4 feat(training): add pure Learning First scope contract and rules
ecee3aa4 Merge pull request #1144 from team478a/docs/personal-learning-gap-analysis
96db0887 docs(training): audit personal learning gaps and layered architecture
```

### production側のみ40件

```text
87c5fafc Merge pull request #1143 from team478a/main
28782a5f Merge pull request #1138 from team478a/codex/release-ai-training-skill-lifecycle-20261005
09d57e46 Merge remote-tracking branch 'origin/production' into codex/release-ai-training-skill-lifecycle-20261005
e518f5d2 Merge pull request #1128 from team478a/codex/release-ai-training-expiry-admin-20261005
ec0726f8 Merge production into AI training expiry admin release
87a4261c Merge pull request #1124 from team478a/codex/release-main-20261004
067a6677 Merge main for production release 2026-10-04
72fe91c8 Merge pull request #1036 from team478a/codex/release-video-training-safety-20261001
1b9398c8 Merge remote-tracking branch 'origin/main' into codex/release-video-training-safety-20261001
5cfe4b2c Merge pull request #1034 from team478a/codex/release-hassy-registration-message-20260930
0cc1bfab Merge remote-tracking branch 'origin/main' into codex/release-hassy-registration-message-20260930
f17b16d7 Merge pull request #1032 from team478a/codex/release-hassy-assets-20260930
cb54025d Merge remote-tracking branch 'origin/main' into codex/release-hassy-assets-20260930
fb597224 Merge pull request #1027 from team478a/codex/release-service-member-fixes-20260930
4c587138 docs(release): audit service member production rollout
5140d66e Merge remote-tracking branch 'origin/production' into codex/release-service-member-fixes-20260930
9da83b11 Merge pull request #1011 from team478a/codex/release-service-isolation-20260929
fd14d9ab docs(release): record strict production base alignment
013ad7bc Merge remote-tracking branch 'origin/production' into codex/release-service-isolation-20260929
fd40761c docs(release): record fixed service isolation release preflight
cc30b69a Merge pull request #988 from team478a/codex/release-line-account-entry
3ec699c6 Merge main for LINE account entry release
3a135313 Merge pull request #986 from team478a/codex/release-ai-training-line-20260928
4244d5ea Merge main for production release
7e0d0217 Merge pull request #976 from team478a/main
78f89050 Merge pull request #974 from team478a/main
8daa7702 Merge pull request #948 from team478a/main
7c274f59 Merge pull request #946 from team478a/main
818dcad0 Merge pull request #934 from team478a/main
c3c2935e Merge pull request #929 from team478a/main
58bc630b Merge pull request #927 from team478a/main
dc7bcdd2 Merge pull request #821 from team478a/main
c184f9da Merge pull request #819 from team478a/main
a940de4a Merge pull request #777 from team478a/main
6a8fcf40 Merge pull request #771 from team478a/main
4cff1b6f deploy: release merged changes to production
b299ff91 Merge pull request #741 from team478a/main
590f61fc Merge pull request #739 from team478a/main
48a14900 Merge pull request #737 from team478a/main
db99d0d5 Merge pull request #734 from team478a/main
```
