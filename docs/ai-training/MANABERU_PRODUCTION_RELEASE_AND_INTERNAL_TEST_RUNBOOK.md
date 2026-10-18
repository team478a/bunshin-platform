# マナベルスタイル 本番反映・内部テスト手順書

> 文書作成時点: 2026-10-18 / 対象基準: PR #1337（PR-F）マージ後の `main`
>
> 本書は田中さんが実行するための手順案です。このPRでは本番DB、Vercel設定、Program設定、機能フラグ、LINE設定を変更しません。本書のマージも田中さんの確認後に行います。

## 0. 実行の原則と停止条件

順番は **バックアップ確認 → 本番migration履歴の読み取り専用確認 → 全pending migrationを適用 → `db:assert-ready` → mainのコードをProductionへ反映 → 既存利用者のsmoke test → 承認された内部テスターだけで機能を段階的にON** とする。アプリを先に公開したり、migrationを手作業で個別適用したりしない。

以下のどれかがあれば作業を止め、状態を記録して環境担当者へ相談する。

- Supabaseの対象project、最新backup、復元担当、復元手順が特定・確認できない。
- Migration History Probeのproject ref / DB / roleが想定と合わない、状態が不明、失敗migrationやdriftがある。
- Probeで未適用と判定されたmigrationをすべて説明できない、またはMigration実行時間・lock影響をレビューできない。
- `db:assert-ready`、Production build、health/readinessのいずれかが失敗する。
- 旧画面・LINE・既存研修に回帰がある。
- 内部テスターの対象Program、参加枠、AI利用同意、Admission、価格表、停止担当が未確認。

Productionへ書き込む操作は、田中さんが対象・時期・復旧担当を確認してから行う。本番設定は秘密の値を表示・転記せず、VercelのEnvironment Variables画面にある変数名と設定状態だけを確認する。

## 1. 対象とmigrationの数え方

現行mainに存在するD-1〜PR-Fの明示対象migrationは、以下の**6件**である。指示にある「7つ」と列挙されたmigration名は一致しない。列挙されていない第7件を推測して追加せず、Probeが返す全pending一覧を正本として照合する。PR-A〜PR-Cなど過去分や他の未適用migrationも一覧に出た場合、今回のreleaseに含める必要性・互換性をレビューし、説明できないものがあれば停止する。D-4には新規migrationはない。

| 順序 | migration                                                  | 出所 |
| ---: | ---------------------------------------------------------- | ---- |
|    1 | `20261017100000_personal_learning_topics_persona_examples` | D-1  |
|    2 | `20261017120000_personal_learning_topic_scope`             | D-2  |
|    3 | `20261017130000_personal_learning_goal_topic_scope`        | D-2  |
|    4 | `20261017140000_personal_learning_persona_suppressions`    | D-3  |
|    5 | `20261018100000_personal_learning_persona_opt_in`          | D-3b |
|    6 | `20261018120000_personal_learning_line_inbox`              | PR-F |

この6件はリポジトリ内のmigration名であり、本番で未適用とは限らない。適用状況は必ず本番に対する読み取り専用Probeで確認する。Probe以外のmigration履歴・SQL直接照会やローカル設定から本番状態を推測しない。

## 2. 所要時間の目安

計画枠は**2〜4時間程度**を確保する。これは保証時間ではなく、追加pending、backup/restore rehearsal、lock待ち、Vercel build、利用者テストで延びる。例:

| 作業                                             |         目安 |
| ------------------------------------------------ | -----------: |
| backup・対象project確認・Migration History Probe |     30〜60分 |
| migrationとreadiness/build/deploy                | 20〜60分以上 |
| 固定経路・LINE・マナベルホームsmoke              |     30〜60分 |
| 内部テスターの段階確認                           | 30〜60分以上 |

pendingが多い、restore rehearsalが必要、Probeが失敗する、migration lockの影響が読めない場合は当日中の完了を優先せず延期する。

## 3. 事前確認とbackup

### 3-1. Backup確認

1. Supabase Dashboardで対象のProduction projectを開き、直近の**成功済みbackupの日時・保持期限・対象DB**を確認する。Supabase Proの日次backupを利用する構成であることも確認する。
2. 環境ownerと実行者の2名で対象projectとbackupが一致することを確認し、実施記録には日時・識別子・確認者だけを書き、DB URLや認証情報は書かない。
3. 必要な場合、Productionとは別の隔離projectへrestore rehearsalを実施し、restore手順・復旧担当・RPO/RTOを確認する。Productionへrestoreして試さない。
4. Productionへのrestoreは障害責任者の判断・承認が別途必要。backupが古い、失敗、対象不明ならNo-Go。

補助手順: [`docs/BACKUP_RESTORE_RUNBOOK.md`](../BACKUP_RESTORE_RUNBOOK.md)。

### 3-2. 全pending migrationの読み取り専用一覧

GitHub Actionsで `main` の **Production Migration History Probe** workflowを実行する。入力値は次の固定確認文と、Supabase Dashboardで確認した承認済みproject ref（20文字）だけ。Production EnvironmentのDB接続はGitHub Environmentの既存secretから読み込み、secret値を画面・log・チャットへ表示しない。

PowerShell / GitHub CLI例:

```powershell
gh workflow run "Production Migration History Probe" `
  --repo team478a/bunshin-platform `
  --ref main `
  -f confirmation=INSPECT_PRODUCTION_MIGRATION_HISTORY `
  -f project_ref=<承認済み20文字のSupabase project ref>

gh run list --repo team478a/bunshin-platform `
  --workflow="Production Migration History Probe" --limit 1

gh run view <run-id> --repo team478a/bunshin-platform
```

Probe summaryで、project ref、DB/role、migration history状態、**すべての `PENDING_MIGRATION` 行**を確認・記録する。Probeはread-onlyで、migrationを適用しない。終了状態が最新でも、対象projectが違えば成功扱いにしない。

pending一覧に本書の6件以外があれば、名前・依存・互換性をrelease差分と照合する。すべてのpendingを説明できるまでProduction反映を進めない。適用済みmigrationを書き換えず、独自SQLで履歴をresolveしない。

### 3-3. Release差分

- `main`の最新commit、PR #1337を含むこと、required CIが成功していることを確認する。
- `main`から`production`へのPull Request差分を確認する。`production`へ直接push/force-pushしない。
- 対象Vercel project、Production Branchが`production`、build設定がリポジトリの`apps/web/vercel.json`と整合することを確認する。
- main側の未マージ変更や、無関係なmigration・設定変更を混ぜない。

## 4. 適用とプログラム反映

### 4-1. Migrationを先に適用

1. 3章のbackup、Probe、pending一覧、Production向けPRのレビューを完了する。
2. `main`から`production`へのPRを作成し、CIと差分を確認する。まだmergeしない。
3. 本番適用の承認・実行時期を田中さんが決めてから、そのPRを`production`へmergeしProduction deploymentを開始する。
4. Vercel Production buildログで次の順序・結果を確認する。
   - `pnpm db:migrate:vercel` が全pending migrationを安全なbounded runnerで適用。
   - `pnpm db:assert-ready` が適用後のschemaを確認。
   - `pnpm turbo run build --filter=web` が成功し、アプリを公開。
5. migrationが最新の場合も`db:assert-ready`、build、healthを確認する。

現行Build Commandは `cd ../.. && pnpm db:migrate:vercel && pnpm db:assert-ready && pnpm turbo run build --filter=web`。この構成ではmigrationがbuildの先頭で走る。Buildが失敗したとき、migrationまで未適用だったと決めつけて再実行しない。履歴・schema・sessionをread-onlyで再確認し、復旧担当の判断を待つ。自動retry、migration resolve、migrationファイルの書き換えをしない。

### 4-2. Migration適用状態の再確認

同じ **Production Migration History Probe** をもう一度実行し、未適用が0件、失敗・driftなしを確認する。`db:assert-ready`成功ログと併せて記録する。手動でDBに接続する場合も、read-onlyの認証済み手段だけを使い、結果に個人データや秘密を含めない。

### 4-3. Vercel本番コードの確認

上の順序どおりのProduction buildが成功したdeploymentだけを公開済みと扱う。Vercel DeploymentsでDeploymentがProductionか、commit SHAが対象releaseか、statusがReadyかを確認する。`/api/health/live` と `/api/health/ready` が成功し、readinessの`databaseSchema`が`current`であることを確認する。

## 5. 反映後の既存利用者smoke test

新機能をONにする前に、既存ユーザーまたは専用の既存確認アカウントで次を確認する。実ユーザーへのLINE一斉送信・AI送信をテストに使わない。

| 経路             | 確認項目                                                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 固定経路         | 従来の固定Definition研修のログイン、既存ホーム、教材/回答/進捗を表示できる。新しい動的研修の画面へ誤転送せず、既存データが見える。                                                                                       |
| LINE             | 既存のLINEログイン、Webhook受信、既存リッチメニューと通知が維持される。既存イベントの二重処理がない。新しいLINE学習をONにする前は、通常Webhookが新機能へ誤って流れない。テストメッセージは対象内部アカウントだけへ送る。 |
| マナベルのホーム | `https://www.watashi-works.com/s/manaberu-style/home` をLINE内ブラウザと通常ブラウザで開き、サービス名・本人表示・既存カード/導線が表示され、エラー画面にならない。                                                      |
| Health           | `/api/health/live`、`/api/health/ready`成功。DB schema current。                                                                                                                                                         |

失敗時は新機能を有効化せず、該当deploymentと時刻・テスト経路だけを記録して停止する。

## 6. 内部テスター限定のProgram設定

### 6-1. 有効化前のGate

この節は田中さんが実施判断した後の手順案であり、この文書作成時に本番設定を変える指示ではない。

- 専用の内部テスター用AI研修Programを使う。共有ProgramならフラグはそのProgramに参加する全員へ適用されるため、外部参加者がいるProgramでは有効化しない。
- 内部参加者のみ、招待・同意・Admission seatを確認する。内部上限は最大3名。参加者本人の研修参加確認・AI利用同意が記録済みであること。
- Programの状態・期間・参加枠、本人のEnrollmentとサービス範囲、Definitionの人間承認、LINE接続を確認する。
- Vercel Production Environmentで`PERSONAL_LEARNING_PILOT`、`PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT`、`PERSONAL_LEARNING_REQUEST_INTAKE`の設定状態を、権限を持つ環境担当者が確認する。これらはサーバー側実行gateであり、Programのチェックボックスだけでは動かない。変更やdeploymentへの反映は、田中さんが実施を決めた後に限定して行う。
- 停止できる運営者と緊急連絡手段を確認する。`STOP`経路へ到達できない状態で開始しない。

### 6-2. 設定画面と順番

通常のDB SQLを直接編集しない。運営画面の監査ログを伴う操作を使う。

1. サービス管理者として `/s/{serviceSlug}/manage/programs/personal-learning-preparation` を開く。
2. 対象Programが専用の内部テスター用であることを照合し、「停止中の学習モード・機能設定」で全機能をOFFにした停止状態を確認する。画面が出ない場合、`PERSONAL_LEARNING_PILOT_OPERATIONS` または`PERSONAL_LEARNING_PRODUCTION_PREPARATION` authorityが未設定/不一致の可能性がある。SQLで迂回しない。
3. まず学習モードを`DYNAMIC_V1`へ設定し保存する。受講者ホームが動的学習ホームへ遷移し、既存の固定経路は変化しないことを内部テスター1名で確認する。
4. 次に「本人との対話」（`conversation`）だけをONにして保存する。テーマ目標の範囲内で相談が同じスレッドに続き、本人像を使う場合は本人の確認・同意済み項目だけが使われることを確認する。
5. 「複数テーマ学習」（`multiTopic`）をONにする場合、テーマ一覧・選択・希望・会話・実践が選択テーマ内に閉じることを確認する。LINE学習は、複数テーマの選択UIがない状態では曖昧なテーマを自動選択しない。LINE学習の試験は1つの有効テーマを選択済みにして行う。選択不能なら`multiTopic`をOFFのままにする。
6. 「拡張範囲」（`extendedScope`）だけをONにして、拡張された質問/提案の範囲とAdmission上限を確認する。
7. 最後に「LINE学習」（`lineLearning`）だけをONにする。Webhook redelivery、署名検証、二重受信防止、保存後の200応答、対象Program/Enrollment/テーマのscope、月間送信数80%・90%通知、停止操作を確認する。

この画面は機能設定をまとめて保存するため、各段階で対象チェックボックス1つだけをONにし、残りをOFFのまま保存する。設定操作はProgramが停止中の場合のみ可能。開始後に次の設定を変更する必要があれば、先に`STOP`して停止・未処理確認後に設定し直し、再開始をレビューする。各段階は少人数の内部テスターで確認してから次へ進む。問題があれば最後にONにした機能をOFFにし、Programも`STOP`する。

### 6-3. AI Admission・価格・本人像の推測

AIを呼ぶ前に、Vercel Project → Settings → Environment Variables → Productionで、権限を持つ環境担当者が値を画面外へコピーせずに設定有無・scope・一致を確認する。

- `PERSONAL_LEARNING_LESSON_ADMISSION`: 相談・提案・本人像推測のAdmission。workspace、service/group、対象Program、`dailyAttemptLimit`、`maxConcurrent`、`model`、`maxRequestBytes`、`maxOutputTokens`、`dailyCostLimitUsdMicros`を確認し、専用内部Programに一致すること。
- `PERSONAL_LEARNING_AI_PRICING`: `provider`、`model`、`effectiveFrom`、`inputPriceMicrosPerMillion`、`outputPriceMicrosPerMillion`、`cachedInputPriceMicrosPerMillion`、`currency`、`pricingVersion`からなるレビュー済み価格表。実際に利用するmodelのprovider/model、発効中価格、Admission modelとの一致を確認する。市場価格から推測した値や合成テスト価格を本番値にしない。
- `PERSONAL_LEARNING_CALL_ADMISSION`: Program開始・利用に関係する別のAdmission gateとして、対象scope、日次回数、同時数、model、request/output上限、USD上限を確認する。`PERSONAL_LEARNING_LESSON_ADMISSION`と混同しない。
- Provider認証は既存のサーバー側Vercel環境設定を使う。値を本文、Issue、ログ、画面共有へ出さない。

本人像の推測は、本人がプロフィール画面でAI推測利用に同意し、Admission scope/modelと価格が正しく、AI呼び出し上限が残っている場合だけ動く。いずれかが未設定・不一致・上限超過なら推測/AI呼び出しはfail-closedで停止する。実際にAIを呼ばずに確認する場合はCIの設定欠損テストまたは非本番のmockで確認する。設定不備を調べるために本番AI呼び出しを繰り返さない。

## 7. LINE Developers Console

1. 対象Messaging API channelを開き、Webhook URLはサービス管理画面 `/s/{serviceSlug}/manage/line` に表示された対象group/channelのProduction URLをそのまま使う。routing keyを推測して手入力しない。動的group経路は通常 `/api/line/groups/{routingKey}/webhook` 形式。
2. LINE Developers Console → 対象Provider/Channel → Messaging APIでWebhook URLがそのProduction URLであることを確認する。
3. `Use webhook`をONにし、Verifyが成功することを確認する。
4. Webhook redeliveryをONにする。LINEのWebhook redeliveryは初期状態でOFFの場合がある。ONでも再送が常に保証されるとは扱わず、アプリ側のwebhook event ID重複排除と保存後応答を別途確認する。
5. URLにsecret/tokenを付けない。channel access token等の値はConsole上で確認するだけで、本書・PR・チャットへ貼らない。

公式資料: [LINE Messaging API: Webhookを受信する](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)。

## 8. 保存期間Previewと自動削除

### 現在提供されている範囲

- 件数確認はサービス管理画面 `/s/{serviceSlug}/manage/training/retention` で実施できる。読み取り専用で、再読込は件数のPreviewだけ。個人の本文や名前は表示しない。
- 保持処理は本文・画像等の決定6の保持期間を適用する。画面の保留件数、終了日/所有境界不明、scopeを確認し、不明件数を「削除対象なし」と読み替えない。
- **現行mainではProduction削除実行は無効**（`retention-execution`はproduction `execute`に503 `DISABLED`を返す）。`apps/web/vercel.json`にも研修保持削除Cronはなく、現在のコードからProduction cronを有効化する手順はない。

したがって、CronをVercel画面で手動追加したり、既存の別Cronを流用したり、Production endpointを直接実行してはならない。Production削除の開始時期は田中さんが決めるが、実行できる状態にするには、承認済みの別コード変更でProduction-safeな冪等実行経路、Preview/Execute照合、scope制約、監査記録、認証、timeout/lock/再送規則、Vercel cron宣言、テストとCIを整備してからreleaseする必要がある。

### 将来の承認済み実装後に行う確認

1. 田中さんが開始時期と対象service/programを承認する。
2. cron有効化前に管理画面Previewを取り、カテゴリ別削除予定件数、保留件数、確認時刻を記録する。内容データをExportして貼らない。
3. Vercel Project → Settings → Cron Jobsで研修保持cronのpath/scheduleが承認済みdeploymentから登録されたことを確認する。Cron認証はVercel Productionの`CRON_SECRET`設定で扱い、値は表示・転記しない。
4. 初回は承認済みの小さな内部scope・実行枠で運用担当が実行し、Previewの対象とscopeが一致することを確認する。
5. 実行後の安全な監査結果（例: `TRAINING_RETENTION_APPLIED`件数/時刻/scope）と、同じ管理画面で再取得したPreviewを照合する。対象件数が減ったことだけで成功とせず、保持対象の非削除・エラー・保留も確認する。
6. 期待外の件数、scope mismatch、重複実行、Preview差分、timeoutがあればcronを止め、再実行せずDB状態を担当者が調査する。

上記は将来の実装後の運用案であり、現行Productionで削除が可能という意味ではない。Cronを有効化する時期は田中さんの判断と別途レビューを要する。

## 9. 戻す方法

### 機能・Programの停止

1. `/s/{serviceSlug}/manage/programs/personal-learning-preparation` の運用操作で`STOP`を実行し、ProgramがSUSPENDED/disabledであることを再読込で確認する。STOPは新規処理を止めるが、送信済みProvider呼出しやLINEへ既に渡した処理を取り消さない。
2. 停止後、「停止中の学習モード・機能設定」ですべての機能（`conversation`、`multiTopic`、`extendedScope`、`lineLearning`）をOFFにして監査記録を残す。
3. Vercel Production Environmentの`PERSONAL_LEARNING_REQUEST_INTAKE`、`PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT`、`PERSONAL_LEARNING_PILOT`は、環境担当者が承認済み手順に従ってOFFに戻す。環境変数の変更は既存deploymentに自動反映されるとみなさず、承認を得てredeployし、全Production instance/domainに反映したことを確認する。
4. ProgramをDYNAMIC_V1から固定経路へ戻すだけで、動的に作成したデータを消したり、安全に非表示にできたりするとみなさない。履歴は保持し、旧経路との互換性を確認してから判断する。

### アプリケーションのrollback

Vercel Deploymentsから直前の既知正常Production deploymentを選び、rollback/promoteする。対象commit、旧アプリと新schemaの前方互換性、domain/全instanceの反映を確認する。旧アプリが新しいschemaを理解しない、またはreserved Programを安全に停止できない場合、旧版へ戻さず新しい修正版をforward deployする。

このリリースのmigrationは追加型として適用し、**migrationのrollback/drop、`_prisma_migrations`の削除・書換えはしない**。DB変更の不具合は状態確認後のforward-fixを基本とする。Production restoreは別の障害判断・承認なしに行わない。

Vercel資料: [Git deployment](https://vercel.com/docs/git)、[Production deploymentのrollback](https://vercel.com/docs/deployments/rollback-production-deployment)、[Cron Jobsの管理](https://vercel.com/docs/cron-jobs/manage-cron-jobs)。

## 10. 実施記録と次の段階

田中さんまたは指定担当者は次だけを記録し、secretや個人本文を残さない。

- 実施日時、実施者、承認者、Production project ref（識別子のみ）
- backupの日時・確認者、restore rehearsal有無
- Probe run ID、全pending/実適用migration、事前・事後status
- Production deployment ID / commit SHA、`db:assert-ready`、health結果
- 固定経路、LINE、マナベルホームの確認結果
- 内部Program ID（必要な範囲の識別子のみ）、有効化した各flag、内部テスター人数、Admission/価格の確認結果（値は書かない）
- 保持Previewと実行結果（cronが別途承認・実装された後のみ）
- 残課題、Go/No-Go、rollback判断

田中さんが本番反映と内部テスターの確認を完了するまでPR-Gへ進まない。完了後に田中さんからPR-Gの指示を受けて着手する。

## 変更履歴

- このPR: 本番反映と内部テストの運用手順のみを追加。Production DB、Vercel設定、Program設定、LINE Developers Console、Cron、機能フラグには触れていない。
