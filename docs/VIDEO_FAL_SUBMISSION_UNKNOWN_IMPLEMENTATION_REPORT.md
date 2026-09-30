# fal/Klingの発注成否不明を保留する実装

## 結論

OpenMontageを導入せず、既存のfal/Kling経路だけをfail-closedにする。`QUEUED`のfal場面は、POST前にDBで`SUBMISSION_UNKNOWN`をclaimする。通信応答またはID保存に失敗しても次のJob実行は再POSTしない。IDが保存済みの`SUBMITTED`は既存の照会を続ける。これは**ローカルからの盲目的再送を防ぐ変更**であり、fal側の重複抑止、注文照合、実請求の安全性を保証するものではない。

基点は`origin/main`の`f71859a26ab09ebc9295de72696aa16ca3d6cad4`と、未マージのcharacterization PR #1029 head `88555fcdcea27baf8ae6b0def7e56af8ddb9b618`。本PRは#1029に積む。前回の現行挙動は[障害再現報告](VIDEO_FAL_SUBMISSION_CHARACTERIZATION_REPORT.md)に残し、F1/F2/F3/F5/F8は安全条件の回帰テストへ更新する。

## 実行経路と安全条件

1. Web handlerは既存のgeneration読込・利用枠予約・Provider設定確認を行い、use caseを呼ぶ。新しい権限経路は追加しない。
2. FALの`QUEUED`では、参照画像URL取得後、Repositoryが`workspaceId + generationId + provider=FAL + status=QUEUED + externalJobId=null`でCASし、`SUBMISSION_UNKNOWN`と固定error分類を保存する。CAS失敗時はPOSTしない。
3. claim成功後だけfal AdapterへPOST。request IDを受け取れた場合は、`SUBMISSION_UNKNOWN`から`SUBMITTED`へCASしIDを保存する。既存IDの照会・成果物保存・成功確定は従来の経路を使う。
4. POSTの受付前/受付後の通信失敗、プロセス停止、ID保存失敗でunknownが残れば、次回は`RECONCILIATION_REQUIRED`を返しJobを再試行不可の`DEAD`として記録する。generationは失敗確定にせず、通知や動画再生成もしない。管理画面は「外部発注の成否未確認・要照合」と表示し、自動・通常管理者再試行を許可しない。
5. unknownは終了済みとは扱わず、プロジェクト版の動画利用枠を予約のまま維持する。`actualCostUsdMicros=null`は未確定であり0ではない。退会削除では既存のactive scene取消対象に含めるが、外部で受付済みの注文を取消した保証にはならない。

Job delivery attemptは発注を一意にするキーではない。今回、新しいfal idempotency headerや推測APIは追加しない。論理発注は現行generationの状態で止める。明示的な再制作時に別の外部注文として履歴を残す設計、実原価台帳、Provider照合APIは後続の判断事項である。Runway、Creatomate、LINE通知、OpenMontageは変更しない。

## 旧データと運用上の注意

既存のfal `QUEUED`行は、真に未発注か、応答喪失によりIDを失ったかをDBから判別できない。migrationはID保存済み行を`SUBMITTED`へ移して既存IDを照会可能にし、IDなし行を`SUBMISSION_UNKNOWN`へ保守的に移す。**未発注だった動画も保留される**。本番適用前に対象件数と運営者の照合体制を確認すること。PRのマージだけを本番適用の証拠としない。

運営者は管理画面の要照合件数、generationの時刻・Provider・モデル・Project/Scene/Revision、falの管理側記録を同じテナント範囲で照らし合わせる。request IDが見つからない場合、画面から「発注なし」や「費用0」と推定しない。通常の再試行ボタンはfalでは表示されず、Repositoryでも拒否する。安全な再開/取消の専用操作は未実装なので、このPRだけで保留行を自動復旧しない。

## 検証と未確認事項

- fake Providerと実Adapter/use case/JobクラスのF0–F7、実RepositoryメソッドのCASとF8、利用枠保留をテストする。fake受付台帳は実falの請求を表さない。未注入の外部通信はテストで即失敗する。
- Runwayはclaimを呼ばず従来経路を通る契約テストを加える。旧F8テストはfal管理者再試行の拒否条件へ置き換え、characterization報告の過去結果は上書きしない。
- Prisma schema検証、型、lint、整形、関連回帰テストを実行する。CI databaseは隔離PostgreSQLへのmigration確認であり、本番DBの検証ではない。
- 未確認: falのID喪失時照合・重複抑止・課金保証、実Provider E2E、本番旧`QUEUED`件数、実原価、運営者による注文照合、実Storage/LINE、デプロイ後の挙動。
- 停止条件: 旧行の保留件数を運営で処理できない、migrationが失敗する、Providerの照合経路が確立しないまま自動再送を再開しようとする場合は、本番展開しない。

### ローカル実行結果（2026-09-30 JST）

Node.js 24.19.0、pnpm 10.10.0、Windowsで、DB URLは`localhost`のビルド用ダミー値を指定した。実DB接続・fal APIは行っていない。

| コマンド                                                                                                           | 結果                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @bunshin/database db:validate`                                                                      | 成功。最初は`DIRECT_URL`未指定で失敗し、localhostのダミー値を設定して再実行した。                                                                                                                                                                 |
| `pnpm format:check`                                                                                                | 成功。                                                                                                                                                                                                                                            |
| `pnpm typecheck`                                                                                                   | 成功、25タスク。                                                                                                                                                                                                                                  |
| `pnpm lint`                                                                                                        | 成功、25タスク。変更外の`apps/web/app/consent/page.tsx`に既存の未使用eslint-disable警告1件。                                                                                                                                                      |
| `pnpm test`                                                                                                        | 1回目は最新migration定数の更新漏れでdatabase readinessが失敗し修正。2回目は全体成功。最終の全体実行はdatabase suiteとfal関連を含む他パッケージが成功したが、無関係の`apps/web/test/daily-missions.test.ts`の2件がWindowsで5秒タイムアウトし失敗。 |
| `pnpm --filter web exec vitest run test/daily-missions.test.ts test/video-fal-submission-characterization.test.ts` | 最終の単独再実行で21件成功。timeoutやassertionを緩めていない。                                                                                                                                                                                    |
| `pnpm build`                                                                                                       | 最終コードで成功、13タスク。                                                                                                                                                                                                                      |

本番PostgreSQLへのmigration、実Provider/実課金、実Storage、LINE送信、deployは未実行。CIの隔離DB migrationと全体verify結果をPR上で別途確認する。

## 切り戻し

Provider/Jobの旧実装へ単純に戻すと、保留行や旧QUEUED行を再送する危険がある。Enum追加の逆migrationを自動実施しない。障害時は動画fal Jobを停止して保留行を残し、注文・原価を照合してから前進migrationまたは限定的な修正を行う。生成済みの外部費用を利用枠の解放と同一視しない。
