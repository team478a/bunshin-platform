# 本番反映準備：運用まとめメール／マナベル PR-H〜I2

2026-10-22追記：3件のmigrationの実行方法は[psql経由のPreview・適用手順](PRODUCTION_RELEASE_PSQL_2026-10-22.md)を参照する。以下のPowerShell direct接続手順は経緯として残す。コード反映・smoke・機能有効化の条件は本書を維持する。

作成日: 2026-10-20（Asia/Tokyo）  
状態: Draft PR。田中の確認・マージ、本番Probe、バックアップ確認、migration適用、本番反映は未実施。

この文書は本番作業の準備だけを扱う。本番DBへ接続せず、Migration History Probeを実行せず、migration・production・環境変数・Program設定を変更しない。

## 1. 対象範囲と確認したSHA

- Production branch: `435d56e9625ac66fa88a934d42ce240819513219`（`435d56e9`）
- Main branch: `95ff80ca00b30d131774d36a3a6d83b181d8d60c`（`95ff80ca`、#1369マージ後）
- 作業時にGitHub refを読み取り確認した値。Vercelの実稼働deployment SHAや本番DB適用履歴を意味しない。

productionのSHAからmainまでのfirst-parent上のPR:

| PR    | 内容                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------- |
| #1359 | マナベルN-2：既存Admissionを使う声かけAI文面と固定文面フォールバック。`learningNudges`はOFFが既定。                       |
| #1360 | PR-Gの評価・リリースGate手順。実AI・実会話評価は未実施で、外部公開判定はNO-GO。                                           |
| #1361 | PR-H：学習AI Provider共通化、Google評価用Adapter、モデル能力・費用予約接続。GoogleはProduction実行を拒否。migration 1件。 |
| #1362 | PR-I1：AIツール公式更新の管理者登録・審査。migration 1件。                                                                |
| #1363 | PR-I2：承認済み更新情報を条件付きで学習提案へ接続。Programの`toolUpdates`は既定OFF。                                      |
| #1364 | Codex並行作業ルールの文書化。                                                                                             |
| #1365 | 朝の運用まとめメールの設計。                                                                                              |
| #1366 | 運用まとめの宛先・時刻・重大度・件数単位の決定記録。                                                                      |
| #1367 | 運用まとめPR-1：読み取り集計と文面生成。                                                                                  |
| #1368 | 運用まとめPR-2：送信台帳、Resend連携、初期OFFのCron。migration 1件。                                                      |
| #1369 | 運用まとめPR-3：管理者向け読み取り専用プレビュー。                                                                        |

### migration差分

Git上でproductionに存在せずmainで追加されたmigrationは、次の3件だけだった。

1. `20261019120000_learning_provider_abstraction`
2. `20261020100000_personal_learning_tool_feature_updates`
3. `20261020120000_ops_morning_digest_runs`

これはbranch間のファイル差分であり、本番DBの実pending集合を確認した結果ではない。本番DB履歴は指示により確認していない。実作業の直前に田中がMigration History Probeでpending集合を確認する。3件と完全一致しなければ、このPRの直接適用runnerを使わず停止する。

注意：productionとmainのdiffでは、上記以外に既存16 migrationのSQLから`BEGIN` / `COMMIT`およびmigration内timeout設定が削除されていた。実際に適用済みのchecksumは未確認であり、DBへの問い合わせも行っていない。Probeのpending一覧だけではこの差分のchecksum状態を証明できないため、適用前に既存履歴との差を田中が確認すること。未適用・failed・checksum不整合・判定不能があれば直接適用を中止し、migration担当者へ戻す。

## 2. 3 migrationの内容・安全性・旧アプリ互換性

| Migration                                               | 内容と既存データ                                                                                                                                                                                         | ロック・負荷の見立て                                                                                                                                                             | 旧productionアプリとの互換性                                                                                                                                                                                                                    |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261019120000_learning_provider_abstraction`          | `AiProviderKey`へ`GOOGLE`を追加し、`ai_provider_configurations.model_capabilities`（空配列既定）を追加。既存のOPENAIかつmodel設定済みの行へ、従来動作を維持する能力値をUPDATEする。DROP/既存行削除なし。 | enum追加と列追加はDDLロックを伴う（列追加は短いAccessExclusive lock）。UPDATEは該当するProvider行に行ロックとWALを発生させる。実行行数、表サイズ、待ち時間はDB未確認のため不明。 | 新列は旧コードが参照しないため通常は互換。新enum値GOOGLEを保存したProvider行を作った後の旧アプリrollbackは、旧Prisma Clientが値を読めない可能性がある。Google設定を本番で作成しないこと。既存のOpenAI行への能力値追加は旧コードから無視される。 |
| `20261020100000_personal_learning_tool_feature_updates` | 公式ツール更新の候補・監査用テーブル、FK、CHECK、unique/index、RLSを追加。既存データのUPDATE/DELETEなし。                                                                                                | 新規テーブルとindexを作成する。既存行を走査する大規模UPDATEなし。FK追加時に参照先usersへ短時間の制約ロックがあり得る。実DB負荷は未確認。                                         | 旧アプリは新テーブルを参照しないため互換。                                                                                                                                                                                                      |
| `20261020120000_ops_morning_digest_runs`                | 送信台帳テーブル、環境・日付unique、状態CHECK、index、RLSを追加。本文・宛先等を既存データから移行しない。                                                                                                | 新規テーブルとindexだけ。既存の運用データ更新なし。実DB負荷は未確認。                                                                                                            | 旧アプリは新テーブルを参照しないため互換。                                                                                                                                                                                                      |

3件とも削除型migrationではない。PR-Hだけは既存Provider行を更新する。migrationのtransaction wrapperやlock待ち時間、実行時のロック量は実DBと実行ログなしに保証できない。上表はSQLの静的読解であり、実測結果ではない。

## 3. コード反映だけで始まる処理・利用者影響

### 運用まとめメール

- Vercel Cronに`/api/internal/ops/morning-digest`（毎日22:30 UTC、7:30 JST）が追加される。
- `OPS_DIGEST_ENABLED`はconfigで`false`が既定。未設定ならCronは`DISABLED`で終了し、集計・DB台帳claim・メール送信へ進まない。Cron HTTP呼び出し自体は発生する。
- 有効化後の宛先は既存の管理メール設定（既存優先順位）を使い、`RESEND_ADMIN_ALERT_TO`と共用する。`OPS_DIGEST_TO`はない。
- 新しい環境変数は`OPS_DIGEST_ENABLED`のみ。`.env.example`は`false`、server configも`.default('false')`。
- `true`への変更はVercel Production環境変数で田中が行い、新しいDeploymentへの反映（再デプロイ）が必要。今回の作業では設定しない。

### マナベル

- `learningMode`未設定のProgramは`FIXED_DEFINITIONS_V1`として扱われる。`DYNAMIC_V1`への切替は自動で行われない。
- `conversation`、`multiTopic`、`lineLearning`、`extendedScope`、`learningNudges`、`toolUpdates`はいずれもProgram単位で明示ONが必要で、未設定時はすべてOFF。Pilot有効性、Enrollment/内部Seat、同意、Admission等の既存Gateも引き続き必要。
- PR-I1のAIツール候補登録・審査画面は管理者向けに利用可能になるが、定期収集や受講者への表示・通知は始まらない。
- PR-I2の受講者提案への接続は`toolUpdates=true`、動的学習、選択中の有効テーマ、本人申告ツール等がそろう場合だけ。既定OFF。
- PR-Hは教材・会話・実践支援・声かけ・本人像推測・証拠レビューのProvider実行を共通設定経路へ接続する。新しい利用者操作がdeploy時に自動実行されるものではないが、すでに有効なDYNAMIC_V1受講経路が本番にある場合、その後の利用者操作で使うProvider解決方法が変わり得る。現在のProgram/Seat/Feature/Admission/Provider状態は未確認のため、運用者は反映前に対象Programが停止状態か確認する。
- Googleは評価専用で、ProductionでのProvider評価呼び出しを拒否する。Google Provider設定をProductionに新設せず、モデル比較を実行しない。
- N-2のCron経路は`learningNudges=true`のProgram、V3同意・席・送信条件等を通過した場合にだけ声かけ処理を行う。既定OFFならAI呼び出しもLINE送信もない。既存の`PERSONAL_LEARNING_LESSON_ADMISSION`、`PERSONAL_LEARNING_AI_PRICING`、保存済みProvider設定を利用し、新しい資格情報変数はない。
- PR-Gの実AI通し評価・独立採点・LINE実配送は未完了。コード反映やCI成功を外部公開承認とみなさない。

## 4. 外部サービス送信

このコードを反映するだけでは、新規メール送信は開始しない（`OPS_DIGEST_ENABLED=false`）。新しいAI/LINE送信バッチも起動しない。AI生成・LINE学習声かけはProgram flag、同意、席、費用Admission等の既存Gateを満たす参加者操作または有効な日次Cron対象がある場合だけであり、Feature flagの既定はOFF。

ただし、PR-Hの共通Provider経路により、すでに有効な動的研修経路で参加者が操作したときのProvider呼び出し先が変わり得る。現Productionの状態は未確認のため、「どの外部AI呼び出しも絶対に起きない」とは断言しない。実Provider評価、Google利用、LINE送信、メール送信をこのPRでは実行しない。

## 5. 問題時の戻し方

1. まず新機能のProgram flagを管理画面でOFFにし、対象Programを停止する。運用まとめメールは`OPS_DIGEST_ENABLED=false`に戻す。環境変数を変えた場合は新Deploymentへ反映する。
2. Applicationに問題が残る場合は、Vercelの直前の正常なProduction Deploymentへrollbackする。Gitの`production`へ直接push/force-pushしない。
3. 3 migrationは追加型なので、コードrollback時もDBから削除・逆migrationしない。残置して旧アプリから未使用にする。特にGoogle Provider行を新規作成してからrollbackしない。
4. migration適用開始後にtimeout/異常/事後確認失敗があれば、再実行せず停止し、Probe・session・実schema・historyを照合してから復旧を決める。

## 6. 田中が行う本番反映手順

以下の順番を守る。実行時の本番操作は田中が行い、このPRでは実施しない。

1. **Migration History Probe**を本番GitHub Actionsから読み取り専用で実行する。Supabase project ref、DB identity、migration history、pending一覧を照合する。pending集合が上の3件と完全一致しない、またはhistory/checksumに不整合・failed・不明点があれば停止する。
2. **バックアップを確認する。** Supabase DashboardのProduction projectで最新バックアップ/PITRの時刻・対象projectを確認する。復元担当と復元先を確認し、復旧元の証明が未完了なら外部公開前Gateとして残す。未確認のまま適用しない。
3. Node.js 24とリポジトリ依存を準備したWindows PowerShellで、次を実行する。Secure promptへDB passwordを入力し、画面に表示される対象project・pending一覧がProbe結果と一致することを再確認する。

   ```powershell
   .\packages\database\scripts\apply-release-20261020.ps1
   ```

   確認語：`APPLY_RELEASE_20261020_MIGRATIONS_TO_vtkzinaudznwbsjoyszk`。このrunnerは3件完全一致以外では確認語入力もdeployも行わない。

4. runner成功後、Probeでpendingなし/`UP_TO_DATE`を再確認し、`pnpm db:assert-ready`を実行する。履歴・schema readinessのいずれかが不明ならコードを反映しない。
5. readiness確認後にのみ、mainの対象SHAをproductionへ反映しVercel Production Deploymentを確認する。`databaseSchema: current`を含むhealthを確認する。
6. 反映後、管理者で`/admin/alerts/morning-digest`を開き、件名・本文・リンク・送信準備状況・今日/前日の台帳状態を確認する。特に「日時未設定の配信記録」の件数と取得失敗表示を確認する。
7. プレビューが妥当で、田中が送信開始を承認した場合だけ、Vercel → Project → Settings → Environment Variables → Productionで`OPS_DIGEST_ENABLED=true`を設定し、新しいDeploymentへ反映する。環境変数変更を既存Deploymentへ遡及適用できないため、再デプロイが必要。
8. 翌朝7:30 JSTにメール到着を確認し、プレビューで「今日の対象日：送信済み」になることを照合する。未着/失敗時に手動再送を繰り返さず、送信台帳とResendの状態を確認する。

### マナベルの確認

マナベル用機能を有効化する場合は、`docs/ai-training/MANABERU_PRODUCTION_RELEASE_AND_INTERNAL_TEST_RUNBOOK.md`を使い、内部テスター用Programだけを対象にする。

1. サービス管理画面のProgram準備でPilot状態・内部Enrollment/Seat・V3同意・Definition承認・Admissionを確認する。通常SQLでProgram JSONを直接書き換えない。
2. 機能を有効にする前に`PERSONAL_LEARNING_LESSON_ADMISSION`のscope、モデル、日次回数、同時数、最大request/output、USD上限と`PERSONAL_LEARNING_AI_PRICING`の有効価格が一致することを確認する。設定値やAPIキーをPR/ログへ出さない。未設定・不一致時はAIを呼ばない。
3. Providerは暗号化済みの既存管理設定を再利用する。PR-Hの実装確認後、既存OpenAI設定と能力値を確認し、Google評価・Provider評価バッチは実施しない。
4. Runbookの順に`DYNAMIC_V1`、`conversation`、`multiTopic`、`extendedScope`、最後に`lineLearning`を一段ずつ内部テストする。各段階でProgramを停止・再設定し、動作・上限・テーマ境界・LINE重複/再送を確認してから次へ進む。既定OFFは変更前に確認する。
5. `learningNudges`と`toolUpdates`は別判断としてOFFのまま保つ。N-2の実AI声かけを試すにはV3同意、既存Provider、Admission/価格、対象席、LINE友だち状態が必要。PR-I2の承認済みツール更新は対応flagを明示的にONにするまで受講者へ接続されない。
6. 既存利用者の固定経路、LINEログイン/受信、マナベルホーム、管理プレビューと権限を確認する。PR-Gの評価条件を満たすまでは外部公開しない。

## 7. 未確認事項・外部公開前Gate

- 本番DBのmigration history、実pending集合、過去16 migrationの適用checksum、実データ行数、テーブルサイズ、実際のlock待ち時間。本番Probeと承認済みread-only確認が必要。
- Vercel上の実稼働Production SHAと新しいDeploymentのready/health。branch SHAだけでは稼働証明にならない。
- Productionの現行Program設定、稼働中Enrollment/Seat、同意状態、各Feature flag、AI Admission/価格表/Provider設定の有無と整合性。秘密値は見ずに設定状態だけ確認する。
- PR-Gの実AI評価、Web/LINE通しシナリオ、独立採点、実費/応答時間計測は未実施。GO判定の証拠が揃うまで外部公開しない。
- #1205から引き継いだバックアップの復元元証明は未完了。バックアップ取得だけで復元可能性の証拠とはみなさない。
- 本番へのMigration適用・プログラム反映・flag/環境変数変更・Cron送信開始は、田中の確認と個別承認後に限る。
