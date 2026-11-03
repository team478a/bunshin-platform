# マナベルスタイル — Pilot焦点表示の限定リリース準備

2026-10-10 JST。branch `codex/release-pilot-definition-focus`。この文書を含むPRのheadをrelease SHAとする。

## リリース範囲

- 基準production: `d86115c7e1952c47fd56af77a4f44fd87933b48a`（#1187）。
- 確認したmain: `970bf64403fd4565e647ac1ca3abc0f498e8ef81`（#1209）。
- 取り込む変更: #1208のmerge commit `b80da8229bb417c886d189cac25fc54f02e8cfa3`のみ。元PRのverify/database CIはSUCCESS。
- 3Definitionの焦点、安全な架空題材、本人の指示を提出する案内、PASS後の実践完了記録の案内をPilot画面へ追加する。
- Definition本文/版、Mission、Rubric、合格条件、Router判断、既存30日V1、LINE、Providerモデルは変えない。
- mainに存在するOEM課金、EVO追加、schema、migration、自動migration build設定は取り込まない。

本PRはproduction向けでありmain向けの再実装PRではない。元変更はmainへマージ済み。`apps/web/vercel.json`はproduction基準のまま維持し、buildは`db:assert-ready`とWeb buildのみ。Migrationを実行する入口を追加しない。

## 登録済み設定と未反映の区別

人間の設定登録承認に基づき、Vercel `team478as-projects / bunshin-platform-web`のProduction Configへ以下を保存し、画面で読み戻した。秘密情報は含めない。

| 設定                               | 登録値                                                                                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PERSONAL_LEARNING_CALL_ADMISSION` | 既存準備authorityと同一の単一Program scope。`dailyAttemptLimit=12`、`maxConcurrent=1`、`model=gpt-5-mini`、`maxRequestBytes=16384`、`maxOutputTokens=2048` |
| `PERSONAL_LEARNING_AI_PRICING`     | `provider=openai`、`model=gpt-5-mini`、USD/100万tokens: input 0.25、cached input 0.025、output 2.00                                                        |
| Pricing識別                        | `OPENAI_GPT5_MINI_STANDARD_VERIFIED_20261010`。`effectiveFrom=2026-10-10T00:00:00.000Z`は当システムの計測開始時点であり、Provider価格改定日ではない        |

単価の正本: [OpenAIモデル資料](https://developers.openai.com/api/docs/models/gpt-5-mini)。登録時に参照済み。micros/100万tokensの保存値はinput 250000、cached input 25000、output 2000000。実原価は呼出し後のtoken計測に基づく推定であり、未測定を0円としない。

登録と稼働環境への反映は別。Vercelは保存後に新Deploymentが必要と表示した。設定登録時点では再deployを実行していない。実呼出しでのpayload/output上限の十分性も未検証。日次上限はUTCのProgram全体attempt数で、失敗も含む。金額Hard Capではない。

`PERSONAL_LEARNING_PILOT=false`、`PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT=false`を画面で確認し、変更していない。学習設計のAPPROVE、START、Provider呼出しは未実施。

## 公開手順と停止条件

1. 本release PRのCI・差分を人間レビューする。baseがproductionで、schema/migration/Provider/課金差分がないことを確認する。
2. productionの基準SHAが変わっていれば差分と互換性を再確認する。main全体のmergeで代替しない。
3. 本番公開の独立承認後にPRをmergeする。productionへのmergeはVercelの自動deployを起動し得るため、単なる文書mergeとして扱わない。
4. Pilot OFFのままDeployment Ready・公開SHA・既存ログイン・Profile準備済み表示・旧V1/他Serviceへの非影響を確認する。DB/readiness/build失敗時はSTARTせず停止する。
5. 3Definitionの正式承認、開始/停止操作の到達確認、準備flagの閉鎖、費用・復旧リスクの人間判断を別Gateとして完了する。release成功をSTART承認にしない。

現在モデルを変更しない。公式[廃止予定](https://developers.openai.com/api/docs/deprecations)では対応する`gpt-5-mini-2025-08-07`の提供終了は2026-12-11。aliasの実availability、モデル移行・品質比較は別確認とし、このreleaseで新モデルへ切り替えない。

## 検証

production基準へ#1208を競合なしでcherry-pickした。変更した7コード/テストファイルは元commitと完全一致する。

- Web Pilot/Admission/Observability等: 8ファイル75テストPASS。
- 既存Assessment/受講者UI/評価期間等: 6ファイル27テストPASS。
- capability-training: 25ファイル288テストPASS。
- application Admission/運用契約: 2ファイル27テストPASS。
- 既存e2eの390×844合成画面: 2ファイル10テストPASS。`report.json`のstatus=passed、exitCode=0、failed/flaky/skipped各0を確認。Providerも本番APIも呼び出さない既存fixtureを使用した。
- architecture check PASS。

計427件。型検査・lint・buildの最終結果とrelease CIはPR本文へ追記する。実DB integrationはCIの隔離PostgreSQLで確認し、本番DBを検証用に使わない。合成/静的テストとbuildの成功は、本番E2E・実スマートフォン・実Provider品質・原価の証明ではない。

## Rollback

本番反映後に問題があれば、Pilotを開始せず、既存の旧Deploymentへapplication rollbackする。schema/保存形式は変更しないため、この差分のためのDB rollbackは不要。新設定は旧実行経路を自動開始しない。設定削除やSTOP操作も本PR作成中には行わない。

本PR作成段階では本番deploy、migration、Definition承認、参加者追加、Pilot開始、実課金を実行しない。
