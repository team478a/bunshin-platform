# 本番DB認証の読み取り専用診断（2026-10-22）

状態: Draft PR。田中が診断の実装を承認した。本番診断・DB設定変更・secret変更・デプロイは未実施。#1388の後にマージする（すでにマージ済み）。CI結果はPR本文に記録する。

## 確認済みの事実と未確定点

[Apply 39752566851](https://github.com/team478a/bunshin-platform/actions/runs/39752566851)は、DIRECT_URLから構成したsession pooler接続で承認済み3 migrationの適用・履歴照合に成功した。**適用済みSQLやApplyを再実行しない。**

その後、[確認専用run 39759099562](https://github.com/team478a/bunshin-platform/actions/runs/39759099562)は、DATABASE_URLから構成したtransaction pooler接続で`database-authentication-failed`となった。資格情報の参照元と接続portの両方が異なるため、パスワードの誤り、参照元の不一致、port固有の問題のどれかはまだ断定しない。

## 診断内容・安全条件

- 既存DIRECT_URLの同じ資格情報・project・postgres role・postgres DB・公式CA・Prisma Client・SQLを使う。session 5432とtransaction 6543を順に1回ずつ、合計2回だけ診断する。transaction側だけ`pgbouncer=true`、両方`connection_limit=1`とする。通常runtimeの5432→6543変換は呼ばず、診断するportを保持する。
- DATABASE_URLは資格情報の一致比較にのみ使い、接続には使わない。project/role/DBを検証して同じpooler形式へ正規化し、decodeしたユーザー・passwordをメモリ内で比較する。記録するのはMATCH/DIFFERENTだけ。値、長さ、ハッシュ、URL、SQL本文、生のPrismaエラーは記録しない。
- SQLは`SET TRANSACTION READ ONLY`の後、current_database/current_user/transaction_read_onlyが期待値かを返す固定SELECTだけ。利用者データやmigration履歴は取得しない。親runnerでproject・role・DB・port・TLS・CA・明示確認を検証し、子ClientはidentityとREAD ONLYを実DBで確認する。
- connect 10秒、socket 15秒、transaction 15秒、各子プロセス30秒、workflow10分で制限する。自動再試行、並列接続、別資格情報へのfallbackはない。Clientは終了時にdisconnectし、切断失敗・成功markerなしも成功扱いしない。
- 両portが成功なら終了0、どちらかが失敗なら終了1。いずれも各portの固定ラベルを記録する。`RELEASE_AUTH_COMPARISON_COMPLETED`はschema readinessの成功や本番デプロイの承認を意味しない。
- 既存readiness runnerとGitHub/Vercelのsecret・通常runtime・DB設定は変更しない。DATABASE_URLでの確認失敗を、別の資格情報の成功で隠さない。

## マージ後の実行

1. CI verify / database成功後、田中がDraft PRをレビュー・マージする。
2. Actionsの **Diagnose production DB authentication (read-only)** をmainから手動実行する。
3. `project_ref`は`vtkzinaudznwbsjoyszk`、`confirmation`は`DIAGNOSE_RELEASE_20261020_AUTH_TO_vtkzinaudznwbsjoyszk`。秘密値を入力しない。
4. 田中がProduction reviewを承認する。contents read、main限定、既存applyと同じconcurrency groupで直列化する。Client生成stepは合成URLを使い、DBへ接続しない。
5. SummaryのMATCH/DIFFERENTとport別の結果を確認する。失敗時もApply・過去SQL・パスワードresetを実行しない。結果に応じた設定変更は別承認にする。

| 資格情報比較 | 5432     | 6543     | 次に確認すること                                                                                      |
| ------------ | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| DIFFERENT    | verified | verified | 参照元の資格情報差が確認された。DATABASE_URLの修正候補をレビューし、変更後に通常readinessを再確認する |
| MATCH        | verified | verified | 過去の認証失敗は再現していない。解決済みと断定せず、通常readinessの再確認へ進む                       |
| いずれも     | verified | 失敗     | 同じ資格情報でtransaction側だけ失敗。pooler側の接続方式・認証設定を調査する                           |
| いずれも     | 失敗     | verified | session側固有の問題を調査する                                                                         |
| いずれも     | 失敗     | 失敗     | 現在の資格情報・共通接続先を確認する。自動resetや資格情報切替はしない                                 |

## 検証と共有ファイル

単体で同一資格情報・2port保持・直列2回限定・対象外拒否・CA期限・秘密非表示・READ ONLY先行・失敗時disconnectを確認する。既存TLSテストにも実Clientの認証子プロセスを追加し、使い捨てPostgreSQLのpostgres DBでidentity/READ ONLYと正常CA・異常CA/hostnameを確認する。Supabase pooler自体はCIで再現しておらず、本番結果はレビュー・マージ後まで未検証。

共有ファイルは`docs/DECISION_LOG.md`末尾への追記と`.github/workflows/diagnose-production-db-auth.yml`の追加のみ。既存workflow、migration、schema、LATEST_DATABASE_MIGRATION、依存、flag、cron、アプリ機能は変更しない。
