# ハッシー利用者追加前 Production統合リリース（2026-10-12）

## 目的

現在稼働中の千ノ国メディアを維持しながら、`main`のOEM共通化、学習機能、EVO-01/03/04/05、運用管理UIを`production`へ統合する。ハッシー等の新規利用者を追加する前に、実本番で段階確認できる状態へ揃える。

## 基点

- Production基点: `d396574207ff4df2fdc8356134bfe4e45ae83a53`
- 統合元main: `297072988cf26c2a1c1c6be86542ae23940d116f`
- Release branch: `codex/release-pre-hassy-integration-20261012`

`main`と`production`は別release系統のため、単純なbranch置換ではなくmergeで双方の履歴を保持する。Productionで適用済みの`20261010070000_personal_learning_call_cost_reservation`はProductionと同じSQLを保持し、適用済みMigrationのchecksumを変更しない。

## 今回含めるもの

- OEM登録課金V2のschema、計算、監査、管理画面
- ワタシワークス共通Service Product Policy
- 初期費用、返金照合、請求根拠、cutover準備、append-only履歴訂正
- EVO-01、EVO-03、EVO-04、EVO-05のmain実装
- 学習評価・再開、学習者LINE接続、本人再現性履歴
- Provider接続確認の非課金endpoint化
- 統合監査文書

## 段階除外

共有AI Providerの原子的Call Admissionと、それを必須化する次のmain変更は第2波とする。

- 当月原価UNKNOWNによる共有Providerの強制停止
- 正の固定リクエスト原価の必須化
- 次回リクエスト原価込み予算判定
- Production OpenAIの管理設定限定
- Trend、Weekly Plan、SNS Insight、会員商品、全OpenAI callの原子的費用予約

当月の既存OpenAI利用には原価UNKNOWN記録が存在することが既存監査で確認されている。値を推測backfillせず、千ノ国メディアの既存AI動線を停止させないため、コードと`20261011180000_ai_provider_call_admission` Migrationを今回の本番releaseから除外する。第2波は履歴の扱い、管理Provider設定、価格、予算を人が確認した後に行う。

## 本番で自動実行しないもの

- OEM履歴の初期登録、Offering変更、cutover
- 月次利用確定、請求書発行、初期費用登録
- Stripe Checkout、自動回収、返金、実課金
- 参加者登録、Pilot開始、LINE実送信
- AIモデル・Provider設定・予算設定の変更

自動回収は既存の明示同意と`automatic_collection_enabled`を必要とし、初期費用は自動回収対象外のままとする。

## Migration

今回の新規pending対象は次の8件。

1. `20261007170000_add_oem_registration_billing`
2. `20261007173000_oem_billing_guardrails`
3. `20261011200000_oem_service_product_policy`
4. `20261011220000_oem_product_policy_admin`
5. `20261011230000_oem_setup_fee_invoicing`
6. `20261012070000_oem_contract_period_supersession`
7. `20261012080000_oem_operational_period_supersession`
8. `20261012090000_oem_billing_policy_revision`

Migration runnerは接続時のlock、statement、transaction idle、process timeoutを検証してから`prisma migrate deploy`を1回だけ実行する。失敗時は自動retry・resolveを行わない。新規schemaはadditiveで、履歴登録や課金開始を自動実行しない。

## 検証と公開順序

1. ローカルの対象test、全test、format、typecheck、lint、build
2. PR CIのverify/database成功
3. `production`へmerge
4. Vercel Production build内でMigrationを前進適用
5. Deployment READY、`/api/health/live`、`/api/health/ready`
6. 千ノ国メディアの既存ログイン・投稿案・履歴・LINE導線を破壊していないことを確認
7. OEM管理画面は読み取り確認まで。履歴登録・cutover・請求・決済は別承認

Vercel CLIでは暗号化されたProduction DB secretをローカルへ取得できなかったため、実DB接続probeはProduction buildのfail-closed runnerで確認する。未実行の事前条件をPASSとは記録しない。

## 初回デプロイ結果と限定再試行

- PR #1252は`production`に`7e92320e0d4cab7c57397a6b87bdfc897cb714a9`としてmergeした。
- 初回Vercel deploymentは読み取り専用のMigration接続preflightで停止した。`prisma migrate deploy`は開始しておらず、8件のpending Migrationは未適用。
- 原因は、ProductionのSupabase session poolerが接続URLに追加したPostgreSQL startup `options`を受け付けないか、設定を保持しなかったこと。
- 復旧版は接続URLからstartup `options`を外し、各pending Migration内で`BEGIN`、`SET LOCAL`のlock/statement/idle timeout、`COMMIT`を必須化する。
- Runnerは接続前に8件のguardを検査し、読み取りprobeで同じtransaction-local設定を確認する。
- 復旧PRのdatabase integration CIと通常verify CIが成功した場合のみ再デプロイする。
