# マナベルスタイル — 学習導線と本番の照合

2026-10-08 JST、基準main `3846902fc4ba24063911a3cdc099a3d7461ee070`（#1181）。既存認証済みChromeの画面をread-onlyで確認。Production DB接続、変更操作、Provider/LINE送信は実施していない。

## 現時点の実証

| 項目                      | 確認結果                                                                                                            | 証拠                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Production Application    | Vercel `team478as-projects/bunshin-platform-web`、Ready、branch `production`、正式URL https://www.watashi-works.com | Vercel project OverviewのProduction Deployment                                              |
| 実公開SHA                 | `24afc8a170097741844e068653b191bc822b1c2e`（#1180 credential rotation）                                             | 同画面Source commit、deployment `2ANig8ukWkUjR4BMaofzpJFLM3oa`                              |
| mainとの関係              | BEHIND。main #1181の参加者本人LINE接続は実公開SHAに含まれない                                                       | `git log 24afc8a..3846902f`と画面SHA照合                                                    |
| Personal Learning Program | 「マナベルスタイル Personal Learning」が存在。期限なし個別学習の説明                                                | `/s/manaberu-style/manage/programs`                                                         |
| 参加者                    | 画面上の「参加中」は0人。「登録できる参加者はいません」                                                             | 同画面。Seat総数やInternal人数のDB証明ではない                                              |
| 準備操作                  | GETによる状態確認は「対象Programはすでに存在します。この画面では変更しません」                                      | `/s/manaberu-style/manage/programs/personal-learning-preparation`。作成ボタンは押していない |

過去Runbookの2026-10-07「公開87c5fafc」「3 migration未適用」「5 table不存在」は過去の観測。今回の現状態へ転記してはいけない。

## 実装と稼働の区別

既存の学習正本/HTTP/UIはmainに存在する。

- `apps/web/src/http/personal-learning-pilot.ts`: Scope、Consultation、本人Goal確認、Plan確認、NEXT、実践Evidence。
- `packages/database/src/personal-learning-pilot.ts`: 既存Goal/Plan/Assignmentと現在の本人回答参照。
- `packages/database/src/personal-learning-router.ts`: 既存MissionへのBridge。
- `apps/web/src/http/ai-training-evaluation.ts`: 認証・Tenant・Pilot gate付き回答評価POST/GET。POSTは非同期PENDING。
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/personal-learning-pilot-card.tsx`: 手順/ヒント、本人AI操作、回答、評価、次の学習、Fit/First Success。

今回、Pilot UIがPENDING後にGETを呼ばず、再訪時も評価を取得していないことを確認し、学習停止/結果未復元を修正した。学習は新しく万能Chatを作るのではなく、既存の3DefinitionとMissionで実行する。

LINEは通知・入口、学習は認証付きWeb画面。`/s/manaberu-style/line`から`/s/manaberu-style/programs`へ進み、本人のEnrollmentを開く。LINE接続だけで参加者・Goal・Plan・通知を作らない。

## UNKNOWN / 本番開始前に必要な確認

- 最新DB migration history/checksum、RLS、Backup/restoreの現状態は今回未照合。過去報告を現在のPASSとしない。
- 実Pilot flags、Program enabled/allowlist、Internal seat、3Definition approval、Profile、Provider/Admission設定は今回の画面結果だけではUNKNOWN。
- 本人のLINE OAuth、学習画面への実端末遷移、実課金評価、状態復元は未実施。
- 参加者0人のため、本番の受講者Learning Loop完走は未証明。
- 学習通知の自動配信は別途実装/有効化確認が必要。今回送信していない。

実公開SHA→mainのMigration差分には`20261008140000_learning_member_line_link`のほか、OEM関連`20261007170000_add_oem_registration_billing`と`20261007173000_oem_billing_guardrails`がある。**main全体のDeploy/Migrationをこの学習修正の承認と読み替えない。** Release SHAと対象Migrationを別途レビューする。

開始判断: **NO-GO（本番完走/安全Gate未証明）**。これは学習コードが存在しないという意味ではなく、本番準備が完了した証拠がないという判断。

最初の次操作は、運営者が**Wave 0対象者1人の参加準備を行う対象アカウントを指定する**こと。指定だけでは登録/Seat付与/START/課金の承認を兼ねない。既存Runbookの承認順序を維持し、先にRelease/DB/Approval Gateを照合する。
