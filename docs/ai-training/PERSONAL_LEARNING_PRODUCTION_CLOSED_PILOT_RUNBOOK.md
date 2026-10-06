# Personal Learning Production Closed Pilot Runbook

## 実行境界の追記（本番未反映）

#1153 merge後の最小実装は [実行・停止境界報告](PERSONAL_LEARNING_EXECUTION_GATES_IMPLEMENTATION.md)を参照する。productionは既存Pilot flagと追加のPERSONAL_LEARNING_PRODUCTION_CLOSED_PILOTを両方要求する方向へ変更し、fresh Assessment gate、認識済みPilotのmarker消失拒否、LINE reserved/Plan除外を追加する。以下の監査表は#1153時点の履歴であり、コード反映と実環境Gate通過を混同しない。100人Hard Cap、費用Hard Stop、恒久Program authority、準備UI/本番管理操作、実認証・Migration安全確認は引き続き未完、開始NO-GO。

## 判定と作業範囲

2026-10-06 JST。基準main `b462cdb9320cdfae2522f43e7ae4620cb02016d3`（#1156）。#1153の文書branch `docs/personal-learning-pilot-readiness`へ最新mainを取り込み、監査・文書更新・不足PR計画だけを行う。コード/schema/migration/環境設定は変更しない。

**現在の開始判定: NO-GO。** Production Closed Pilotは長期方針として可能だが、現コードはproductionを拒否し、人数・費用・実環境検証にも未完条件がある。stagingはoptional verification environmentであり、開始必須条件ではない。安全確認・人間承認・実認証は省略しない。

Development / CI / Test → Production Release Gate → Internal Production Test（Wave 0、1〜2人）→各Waveの人間レビュー→最大100人。Production infrastructure利用と一般公開を区別し、一般ユーザー、旧30日V1、他Packageには新UIを出さない。

本書のマージはProduction DB接続・Migration適用・deploy・Pilot enable・Definition APPROVE・Enrollment作成・実課金Provider利用・招待の承認ではない。実操作は別承認を待つ。

## 監査証拠とProduction構成

読み取りのみのGitHubメタデータではproduction branchは `87c5fafcdf9b84c67dd33aef41860368415ca789`。最新Production Deployment ID `6863375278`、同SHA、2026-10-05T15:43:24Z、status success。公開aliasの実SHA、実DB、実設定、現時点の疎通は未確認。これを最新mainの本番反映済み証拠としない。

#1156 head `17820cdc42a7c05e251b6103e613cf9e0de765aa` の[CI](https://github.com/team478a/bunshin-platform/actions/runs/37438592444)はverify/database成功、実PostgreSQL統合125件成功。将来のrelease候補SHAでは改めてCIを確認する。現在の本番Gateは一件も自動通過しない。

構成根拠は [Deployment Guide](../DEPLOYMENT_GUIDE.md)、`apps/web/vercel.json`、`packages/database/scripts/deploy-migrations-for-vercel.mjs`。Vercel hnd1 / Next Web / Supabase系PostgreSQL・既存認証 / 共有Cron worker。Git連携はproduction branchのみ、build冒頭でMigration→readiness→Web build。mainマージはdeployではない。

## 隔離・Blast Radius監査

| 境界                           | コード根拠（基準main）                                                                                  | 判定・限界                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 専用Program                    | `packages/capability-training/src/personal-learning-pilot.ts`: marker存在だけで予約                     | disabled/malformedでも旧Runtimeへfallbackしない。旧V1へmarker後付けしない                                                              |
| 環境flag                       | `apps/web/src/services/personal-learning-pilot-access.ts`: PERSONAL_LEARNING_PILOT=trueかつ非production | 本番利用は現在不可。安全なproduction許可は別PR                                                                                         |
| Allowlist                      | 同policy + `packages/database/src/personal-learning-pilot.ts`                                           | server/repositoryでUUID完全一致、重複なし1〜5件、通知停止必須。100人対応ではない                                                       |
| 旧V1 Runtime                   | `training-runtime-{candidate,state,decision}-repository.ts` のmarker拒否                                | 旧V1候補取得・決定保存を除外。generic Program writerも `program-runtime-execution.ts` でAI Trainingを拒否                              |
| UI/API/Auth                    | program page、`personal-learning-pilot-access.ts`、`personal-learning-persistence.ts`                   | 本人session、Service、5軸scope、ACTIVE所属/期間/Program、CAS・再送を再検証。URLやclient IDだけでは不可                                 |
| Assignment                     | `personal-learning-router.ts` + Pilot gated subclass                                                    | 現行Plan revision、Goal、版固定承認、prerequisite、未完了Assignmentを検査。新しいAssignment正本なし                                    |
| 評価受付/実行                  | `ai-training-evaluation-queue.ts`、`training-answer-evaluation-job-handler.ts`                          | enqueue・worker・Provider直前で再判定。送信後取消/完全drainは保証しない                                                                |
| LINE                           | `ai-training-action-line-scheduler.ts`                                                                  | 通知無効と旧Runtime拒否で通常候補を止める。ただしscheduler自身にmarker一律除外なし                                                     |
| LINE既存Job                    | `service-line-broadcast-eligibility.ts`                                                                 | AI_TRAINING_ACTIONの送信時判定はProgram ACTIVE/module等。marker/allowlist/通知flagの専用拒否がない。古い/誤作成broadcastの安全は未証明 |
| DB                             | P1-C-S SQL + scoped FK/CHECK + RLS                                                                      | データ境界のコード根拠あり。実role/RLS・適用状態はUNKNOWN                                                                              |
| 他Service/Operator/OEM/Package | scope限定SQL、既存非marker V1経路を維持                                                                 | 認可分離と共有資源分離は別。DB lock/CPU/接続pool/worker/Provider rate limitは共有                                                      |

**Blast RadiusをPilot参加者だけへ完全に閉じる証拠は未達。** scoped認可は実装・自動試験済みだが、共有DBのDDL/負荷、worker競合、同Service/WorkspaceのAI quota消費、共通Provider制限は他機能へ影響し得る。専用Programだけで物理隔離・無影響を主張しない。必要なら既存Service/Workspaceを専用scopeとして使う方針を人間が決め、新しいPilot Platformは作らない。

## Kill Switchと停止手順（未実行）

既存のProgram `personalLearningPilot.enabled=false` または専用Program SUSPENDEDを利用する。DB側変更は次の認可チェックで反映され、環境flag無効化より即時性が高い。環境flagはdeployment/旧instanceにも反映確認が必要。DB rollback不要、Goal/Plan/Answer履歴は保持する。

1. 停止担当者が対象Program/Service/環境を確認し、人間承認済みの管理操作でdisable/SUSPENDEDにする。marker、moduleKey、allowlistを消さない。
2. UI/API、next/bridge、評価enqueue、worker、Provider直前拒否と、非Pilot V1継続を確認する。共有Cron全停止をPilot Kill Switchの代用にしない。
3. Pilot scopeだけのPENDING/LEASED/RETRY_SCHEDULED評価Jobと通知broadcastを調査する。lease期限やempty batchで実行終了を証明しない。既に送信されたProvider呼出しは撤回できない。返却後の評価/usage保存が起こり得るため、監査してdrainを確定する。
4. 既存データを削除せず、実行中処理とコストを記録。復旧は原因修正、互換性、Privacy、保留Job、開始Gateを再レビューする。

既存flagは新規処理の停止機構として再利用するが、現状でGate D PASSとはしない。Provider直前は最初にPilotと認識した処理でも共通helperが「markerなしなら旧V1許可」とするため、待機中にmarkerが消える変更をfail-closedにする設計/否定テストが必要。Program停止前に既に認可済みの処理を強制取消できるとはしない。

Provider直前のfresh queryはEnrollment/Program/flag/allowlist中心であり、Goal ACTIVE・最新Confirmed Plan revision・Definitionの現在APPROVED/承認者状態の再検証は見当たらない。P1-G contextは保存されたPlan revision/Definition対応を照合するだけで、実行許可の正本ではない。enqueue後のGoal取消/Plan改訂/承認撤回について既存Assignmentへの評価継続方針を人間が確定し、新規外部送信を拒否する最小gateとテストを別PRへ含める。履歴読取や既に実行したusage記録は引き続き許可する方向とし、過去事実を削除しない。

## Allowlist・Hard Cap・Wave

現在の最大5件は1 Programの同時allowlist上限であり、Pilot全体の最大100人登録制約ではない。Program複製、allowlist入替、終了者の置換を含む累計人数を保証しない。`maxParticipants`を今追加するとstrict policyが拒否するため、運用だけで設定を足さない。

別PR候補では対象Pilotのauthorityを固定し、登録/allowlist変更をtrusted application操作へ限定する。既存Program lock + transaction + auditを再利用し、100超過/並列追加/別Programへの分散を拒否する。既存Enrollment正本を用い、単純な「長さ<=100」だけで完了しない。累計参加者と同時利用者を区別し、終了/取消/削除後の枠復活で累計100を越えない仕様を決める。Privacy削除と累計台帳の両立、1 User複数Enrollmentの集計、複数Service/Programの合算範囲は人間レビュー事項。未使用Quota frameworkを作らない。

推奨運用は1つの専用Pilot Programとアクセス制限されたWave名簿。各Waveは追加人数で、**100を正本とし最後の追加数を調整**する。

| Wave   | 追加上限                  | 累計上限 |
| ------ | ------------------------- | -------- |
| 0 内部 | 2（最低1）                | 2        |
| 1      | 5                         | 7        |
| 2      | 15                        | 22       |
| 3      | 30                        | 52       |
| 4      | 残枠（Wave 0が2人なら48） | 100      |

人数拡大は日時自動開放ではない。各Waveを責任者がレビューし、E2E/重大Error/Privacy/Provider/Costに不足があれば増員停止。終了者も参加実績として累計に残す。名簿・UUIDは公開PRへ貼らない。

## Migration適用前監査とDeploy順序

Git上のproduction→基準mainで追加されたMigrationは `20261006021000_personal_learning_persistence`。実DBのpendingはUNKNOWNであり、Git差分と同じとは仮定しない。[P1-C-S Release Runbook](AI_TRAINING_PERSONAL_LEARNING_P1CS_RELEASE_RUNBOOK.md)と[Backup / Restore](../BACKUP_RESTORE_RUNBOOK.md)を併用する。

SQL確認: 3追加table（personal_learning_goal_confirmations / personal_learning_plan_revisions / learning_definition_approvals）、既存program_member_goalsの複合unique index、FK/CHECK、新規tableのENABLE RLS。DROP/TRUNCATE/旧データUPDATE/seed/backfillなし。**additiveだが無停止安全とは判定しない。** 通常CREATE UNIQUE INDEX（CONCURRENTLYではない）は旧Goalの書込を待機/阻害し得る。SQLにlock_timeout/statement_timeout/明示BEGINなし。容量・実行時間・partial DDL復旧は未測定。

RLSはENABLEのみ、匿名/authenticated向けpolicyなし、FORCE RLSなし。所有者/BYPASSRLS/server roleと実grantを確認する。CI superuser成功は本番認可検証ではない。readiness scriptは最新Migration finishedだけを確認し、全pending履歴、RLS/権限、容量・lockの保証ではない。

承認後の順序:

1. 公開alias/production SHA/採用release SHA/DB project/実roleを一致確認。read-onlyで全 `_prisma_migrations`、失敗/rolled back/pendingを取得する。秘密値を出さない。
2. Backup成功、隔離restoreと削除再適用、DDL時間・lock許容値、旧V1同時動作・全release差分をレビュー。必要なwriter停止/drainを承認する。隔離restoreやlocal testは利用可、staging deployment自体を必須にしない。
3. Pilot・承認管理・Profile準備をdisabledのまま、main→production release PRを別レビュー。現行Vercel buildが**全pending Migration→schema readiness→application build→公開**を行う。Migrationは既存旧アプリ稼働中に先行する。手動適用を選ぶ場合だけ専用runner/対象/競合防止を別承認する。
4. 実DBのfinished、FK/CHECK/index/RLS/実roleを確認、build/公開SHA/health、既存V1の非破壊smokeを確認。後段build失敗でもDBは戻らない。コード先行公開・Migration skipで回避しない。
5. Pilot disabled smoke、対象外/匿名拒否、専用準備、Definition人間承認、Profile本人回答の証拠を揃える。
6. Release Gatesを満たした後だけWave 0の実認証テストを別承認し、内部Enrollmentだけ有効化する。実課金利用承認は別に記録する。

実DBに接続していないためMigration SafetyはUNKNOWN。許容時間を満たせなければ停止計画または最小DDL修正PRを別レビューする。適用済みMigration編集/履歴削除/未承認migrate resolveは禁止。

## Definition承認とProfile準備

対象3版は [Definition Review Sheet](PERSONAL_LEARNING_PRODUCTION_DEFINITION_REVIEW_SHEET.md)で人間がAPPROVE / REJECT / REVISION REQUIREDを判断する。固定版fixtureは自動承認しない。本文変更を同じversionへ上書きしない。

#1155で管理APIが存在する: `GET/POST /api/services/{serviceSlug}/ai-training/definition-approvals`。ACTIVE SERVICE_OWNER/ADMIN、同Service scope、レビューdigest、CAS revision、明示checklist、操作UUID、申告commit/証跡キー、ProgramAuditLogを使用。POSTはAPPROVE/DEPRECATE。REJECT/REVISION REQUIREDは人間レビュー記録に残し、新規利用承認を登録しない。既存承認の撤回が必要なら別の明示DEPRECATE操作を行う。承認者失効も新規利用不可。DB直接INSERT、seed、AI承認は採用しない。

ただし管理APIはPERSONAL_LEARNING_DEFINITION_ADMIN=trueかつ非productionのみ。**本番では現在使用不可**。trusted本番承認操作は別PRレビューが必要。GET閲覧はAPPROVEではない。[現行手順](PERSONAL_LEARNING_DEFINITION_APPROVAL_IMPLEMENTATION.md)を再利用する。

#1156のProfile GET/POSTは既存TrainingParticipantProfileを本人の明示role/aiLevel/dailyMinutesだけcreate-if-absentで初期化する。Goalなし、UNKNOWNをdefaultで埋めない。SUSPENDED Program、disabled allowlist、通知停止、旧Goal/Assignmentなし、権限/期間再検証、再送/CAS、削除後再作成拒否。旧30日V1 setupを使わせない。ただしPERSONAL_LEARNING_PROFILE_PREPARATION=trueかつ非productionのみであり、準備UIもない。本番で安全に本人が操作する入口は別PR。[現行仕様](PERSONAL_LEARNING_PILOT_PROFILE_IMPLEMENTATION.md)参照。

## Provider / Cost Safety

現行はOpenAI Responses APIの既存Assessmentだけ。`openai-training-answer-evaluator.ts` は45秒timeout、structured schema validation、store=false、代替生成なし、1 evaluateにつき1 fetch。Job maxAttempts=3だが、手動FAILED resetはDEAD job件数に応じ新runを作れるため、1 Answerの生涯3call制限ではない。実model/資格情報source/rate limit/Provider予算/推定単価/送信同意はUNKNOWN。今回secretを取得・復号・Providerへ送信していない。

P1-G #1154は実装済み。taskType=ASSESSMENT、provider/model、input/output/cache tokens、latency、推定cost/pricingVersion、success、validationResult、errorCategoryを計測し、既存AiUsageEventとProgramActionEventへ関連保存する。[P1-G報告](AI_TRAINING_PERSONAL_LEARNING_P1G_AI_COST_OBSERVABILITY.md)とread-only `P1G_AI_COST_ANALYSIS.sql` を利用する。新Telemetry PRは不要。価格/usage欠損はUNKNOWN、best-effort保存失敗を0円にしない。実測は未実施。

共有 `withOrganizationAiGenerationQuota` はOrganization/Service月間生成回数制限を利用するが、未設定はUNLIMITED、失敗はreservation RELEASED、Pilot専用・日次・金額制限ではない。共有quotaの消費/枯渇は旧V1や他Packageにも影響し得る。管理alertがあってもPilot専用しきい値/配信/即応証拠は未確認。

**推奨: Wave 0前に最小のPilot日次call admission Hard Stopを別PRでレビュー。** 既存Job予約/Program scopeを再利用し、失敗・timeout・retryを含む試行、並列数、同Answer再送、FAILED resetでの迂回をProvider直前で防ぐ。呼出前の原子的予約を使い、UNKNOWN cost/telemetry障害でも無料扱いで枠を戻さない。通貨Billing frameworkは作らない。金額を保証するには入力/出力上限・モデル固定・単価・Provider外部budgetも必要。現Evaluatorにmax_output_tokens指定なし、単なるcall数制限を金額上限と称しない。

責任者が日次Pilot総call/Enrollment call/同時実行数と低いalert閾値、停止担当者・連絡先を指定する。値は今回捏造せずREADYになるまでNO-GO。少人数のalert+Kill Switchだけの案は、短時間の無制限再試行が制約できる証拠と応答時間が揃う場合に限る。現コードだけではその証拠がなく採用しない。

## Monitoring / Feedback / Privacy

既存ログ、Job/Answer状態、ProgramActionEvent、P1-G集計、P1-F FIT/NEUTRAL/NOT_FITを優先。新Observability基盤・長いアンケート・相談全文保存は不要。監視担当/間隔/通知先/ログ閲覧権限はまだ未確定。

| 観測対象                                | 既存根拠・運用                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| HTTP 5xx / Auth failure                 | Webログ・拒否件数。相談/回答/bodyをログへ追加しない。rateの分母と時間窓を定義                                |
| Assessment / Provider failure / timeout | Job DEAD/retry、Answer PENDING/FAILED、AI_CALL errorCategory / validationResult                              |
| UNKNOWN / BLOCKED / Definition Gap      | Router/API固定reason、Consultation status。全評価を自動Event保存する保証はないため欠損を明記                 |
| repeated RETRY / duplicate Assignment   | bridge fact + Enrollment/Plan revision/Definition version、既存unique/idempotency。通常RETRY履歴と重複を区別 |
| 原価異常 / Telemetry欠損                | P1-G試行集計、UNKNOWN件数、PERSONAL_LEARNING_AI_CALL_PERSISTENCE_FAILED。AiUsageEventとの二重加算なし        |
| Fit / 離脱                              | 既存fitと目標採用・開始・完了・REVIEW/RETRY・Gap。未回答は中立扱いしない。無Eventだけで離脱断定しない        |

相談全文/対象外相談/長期chat/business secrets/成果物をAnalyticsへ保存しない。学習Answerは既存回答正本に保存し、Providerへ最小送信されるので、データが一切保存されないとは説明しない。実アカウントの同意・既存Export/削除・保持/Backup復元後再削除、管理者への非開示を実roleで確認する。

各Waveで「分かりやすい」「自分に合う」「続けたい」を短く確認する。継続意向は現行fitにないため同意付き人間聞き取り候補に留め、今回新fieldを追加しない。目的はSkill/個別性/離脱/つまずき/一人あたり原価/高い処理/正式版Gapの検証であり、学習時間だけを成功指標にしない。

## 実認証とWave拡大・停止条件

synthetic CIは実アカウントの証拠ではない。Wave 0の本人1〜2人、採用SHA、URL、日時、匿名化したテストID、結果をアクセス制限された記録へ残す。ログイン→Program→Consultation→Goal確認→Plan独立確認→Mission→Answer→実Assessment→Routerを通す。復元、Origin、他user/workspace/service/enrollment差替え、allowlist外、flag停止、期限、Definition撤回、旧V1非破壊回帰も確認する。未対応テーマはGap、CONSULTINGは対象外、CONTENT/AUTOMATIONは本人学習同意だけ。新教材・自動化・画像等は生成しない。

Gate Iの開始前Auth/Privacy否定試験と、開始承認後のWave 0課金E2Eを区別する。全Gate通過を偽装するために承認前の実Providerテストをしない。Wave 0のE2E完走はWave 1へ進む追加条件。

漏洩/cross-tenant/旧V1影響/無承認Provider/費用暴走/Goal・Plan破損/重複Assignment/重大誤評価は**1件でも即停止・増員NO-GO**。5xx/timeout/UNKNOWN/RETRY/原価の数値閾値は責任者が時間窓・分母付きで指定し、実測後改訂する。未指定のまま拡大しない。各Waveで重大Errorなし、Privacy問題なし、Provider正常、Cost測定可能、本人E2EとUX確認をレビューし、人間が次Waveを承認する。

## Rollback

まずPilot scopeのみdisable/SUSPENDED・drain確認、履歴保持。code rollback前にDB互換性とExport/削除を確認する。P1-C-S以前のコードは新Plan等のExportを持たないため単純旧版復帰を安全としない。共有MigrationをDROPしてPilotを止めない。原則forward-fix。restoreは別承認・隔離検証・削除再適用、旧V1を巻き戻す全DB復元は最終手段。旧deployment/別domainからの到達・flag反映も確認する。

## Release Gate Checklist

PASS/READYには対象SHA/環境/日時/担当者/証拠を要求する。空欄/未確認はUNKNOWN、既知不足はFAIL。全必要条件を満たすまでWave 0 NO-GO。

| Gate                          | 必須証拠                                                  | 現在                                                                             |
| ----------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| A Code / CI                   | production対応等を含むrelease候補のverify/database成功    | UNKNOWN（基準mainに対応する#1156 CIは成功。未実装条件を含むrelease候補は未確定） |
| B Production Migration Safety | 実pending/backup/lock時間/role/RLS/互換性/deploy順        | UNKNOWN                                                                          |
| C Blast Radius Isolation      | Auth隔離、共有資源制約、LINE最終gate、非Pilot回帰         | UNKNOWN（認可のコード根拠あり。完全影響限定は未証明）                            |
| D Kill Switch                 | 本番新規実行停止・V1継続・in-flight/drain rehearsal       | UNKNOWN（既存機構あり。運用とmarker変更対策未検証）                              |
| E 100 User Hard Cap           | authority/累計/並列追加/複数Program/101人拒否             | FAIL（現在5件allowlistのみ）                                                     |
| F Definition Human Approval   | 3版レビューと本番管理操作・監査証拠                       | UNKNOWN（非本番管理APIは実装済み。本番利用不可）                                 |
| G Internal Wave 0 Accounts    | 1〜2人、本人同意/Enrollment/Profile/隔離名簿              | UNKNOWN                                                                          |
| H Provider / Cost             | model/key設定確認・rate/timeout/予算・Hard Stop・実測可能 | UNKNOWN（Telemetry実装済み。実設定/安全上限は未確認）                            |
| I Privacy / Auth              | 実本人認証/対象外拒否/データ用途/削除・復元方針           | UNKNOWN（自動テスト成功は実環境PASSではない）                                    |

## 不足PR計画（実装は承認待ち）

1. **PR A Production admission / Hard Cap / Kill Switch**: production許可を明示既定無効flagへ限定、固定Pilot authority/allowlist/累計100の原子的登録、既存Kill Switchの再検証。marker消失、並列/再送、別Program分散、101人拒否、旧V1継続、LINE scheduler/送信直前のreserved拒否、Provider待機中のGoal取消/Plan改訂/Definition承認撤回を否定テスト。容量設計が大きければ人数制御と外部実行直前gateをさらに小分けにする。単に5→100やproduction拒否削除だけでは不足。
2. **PR B Trusted production preparation**: 既存Definition管理/本人Profile APIを本番で安全に使う明示gateと最小本人入口。人間レビュー/CAS/冪等性/Privacyは維持。大きなadmin UI、DB直接操作、旧setup流用なし。APIgateと本人UIは必要なら分割。実承認・実登録はPR完了後の別操作。
3. **PR C Minimal cost admission safety**: Pilot限定日次call/同時実行の原子的予約とProvider前チェック、失敗/retry/reset迂回・観測欠損・共有quota影響検証。Telemetry再実装は不要。Provider/model追加や巨大Billingなし。
4. **運用Gate（コードPRではない）**: 実DB読取/Backup/DDL検証、全release差分レビュー、Definition教育レビュー、Wave 0実認証・実Provider許可、停止/監視責任者確定。実環境証拠でB〜Iを埋めて別開始承認。

優先順はAの設計承認→A/B/Cの必要最小変更→release候補CI→Production Release Gate→別操作承認。今回は全実装を続行しない。Teaching/Memory/Definition Factory/Codex/新Provider/LINE導線/新Definition/一般公開は対象外。

## 2026-10-06: Pilot Call Admission追加（本番未適用）

過去の監査結果とGate判定は保持する。PR C相当の小さな変更として、Pilot専用のUTC日次attempt上限、同時実行上限、同一Job attempt再送拒否、request byte / output token上限、model一致を追加した。詳細は[実装報告](PERSONAL_LEARNING_CALL_ADMISSION_IMPLEMENTATION.md)。

サーバー設定`PERSONAL_LEARNING_CALL_ADMISSION`は既定なし。未設定ではPilotのProvider呼出しを停止する。既存V1には適用しない。失敗・retryも件数に数え、終了不明のcallは枠を自動解放しない。

追加Migration `20261006120000_personal_learning_call_admission`は本番未適用。適用監査と全instanceのrelease確認が必要。Kill Switchは引き続き既存flagを使用し、未知枠の復旧を台帳削除やTTLで行わない。

Gate Hは引き続きUNKNOWN。金額Hard Stopの完成・費用見積もり・本番数値承認・実課金開始承認を意味しない。Gate B/C/D/E/F/G/Iも本番証拠を要する。trusted準備操作、累計100人Hard Capは別PR。Wave 0はNO-GOのまま。

## 2026-10-06: trusted Production準備API Gate（本番未反映）

PR BをAPI Gateと本人UIへ分割し、API Gateのみ追加した。詳細は[本番準備API報告](PERSONAL_LEARNING_PRODUCTION_PREPARATION_IMPLEMENTATION.md)。過去の非本番限定記述は旧実装の履歴として保持する。

既存機能別flagに加え、`PERSONAL_LEARNING_PRODUCTION_PREPARATION`で単一Workspace / Service / Programを固定する。未設定・不正設定・実行flag trueは拒否。DB transaction内でSUSPENDED / Pilot disabled / 通知停止 / allowlist scopeを再検証し、別AI Training Programと共有するServiceでは準備を拒否する。Definitionは人間管理者だけ、Profileは本人だけが既存契約を使用する。GET・再送にも現認可を要求する。

実設定・deploy・承認・Profile登録は未実施。最小本人UI、専用scope準備、100人Hard Cap、停止操作・drain、実Migration/実role/実認証、全Release Gateは別作業。APIを実装したことをGate F/G READYの証拠にせず、Wave 0はNO-GOを維持する。
