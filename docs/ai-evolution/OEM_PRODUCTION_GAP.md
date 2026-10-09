# OEM・本番環境 差分監査

監査日2026-10-09、main `9e0db97a51b15cacd8e2c95f328cfabeff3d32ee`、公開alias実SHA `d86115c7e1952c47fd56af77a4f44fd87933b48a`。取得根拠は[統合監査](INTEGRATED_READINESS_AUDIT.md)。本番DB/環境値/課金処理は操作しない。

## mainとproduction

`git rev-list --left-right --count origin/production...origin/main`: 49 / 26、**DIVERGED**。全tree差分135 files / 13,603 additions / 811 deletionsは差分規模の記録に限り、開発完成率ではない。productionには選択リリースがあるためPR番号が祖先にないだけで欠落と判断しない。

| 対象                                                            | コード配備 / 根拠                                                                               | 未確認事項                                                                                         |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 既存ハッシー / Program / 研修 / 課金経路                        | production treeに存在、health起動/DB接続正常                                                    | 実ユーザー操作、各設定・台帳・価格・同意・決済、LINE配送は今回未実施                               |
| P1 Pilot / Hard Cap / Admission / Profile / 内部準備 / LINE導線 | productionに選択反映。主要Pilot HTTP/access/Seat/Admission/Router/Guided Practiceのtree差分なし | Pilot実設定・Seat・Definition承認・実Provider・原価・復元はUNKNOWN                                 |
| #1176                                                           | V2 source/料金UI/2Migrationがmainに存在、productionとの差分に存在                               | 本番未配備。DB適用状態はUNKNOWN、コード未配備からPENDINGと推測しない                               |
| #1177〜#1179                                                    | 安全監査 / bounded migration runner / 接続probeがmainに存在                                     | production runnerはschema assertionのみ。移植するとDeployが全pending Migration実行を伴うため別承認 |
| #1189〜#1199                                                    | 品質fixture、通信/モデルGate、原価契約、再現性関連sourceがmain側のみ                            | 本番効果を確認できない。#1188/#1200はOPEN、mainへ含めない                                          |

差分Commitのfirst-parent一覧: #1199 `9e0db97a`、#1198 `693a28a8`、#1197 `3e253d76`、#1196 `3aea6072`、#1195 `c8cc448c`、#1194 `dea84def`、#1193 `6aaae806`、#1192 `3ecd3c6b`、#1191 `b4743ef7`、#1190 `dfcbe39b`、#1189 `d761d233`、#1186 `5b4957f1`、#1184 `8bbfd229`、#1182 `ff64ccff`、#1181 `3846902f`、#1179 `5350de13`、#1178 `f183a412`、#1177 `e98a4a4c`、#1176 `97838a72`。この一覧中のP1選択リリースはproduction側にも相当コードがある。未配備判定は上表のtree比較を正本とする。

## OEMルールと管理機能

| ルール / 正本              | mainの実装                                                                                                                                        | 本番利用判定                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| ハッシーFREE               | `countOemBillableUsers` が契約期間内FREE提供時点の有効ServiceUsageEventに基づくunique user集合A                                                   | V2未配備。既存利用計測/旧MAUと新ルールを混同しない                                            |
| ハッシーPAID / PAID_BUNDLE | OemRegistrationPeriod・Offering・Contractの期間が重なる登録集合R。未利用でも登録課金、同WorkspaceはR∪Aで重複除外                                  | 初期正式登録/契約履歴・将来cutoverの人間確認が必要                                            |
| マナベルOEM                | `assertOemOffering` はFREE拒否。単品0円PAID_BUNDLEは有料登録扱い、金額やslugで推測しない                                                          | 本番で最新ルールを保証できない。直営内部PilotとOEM有料提供は別                                |
| 料金・人数設定             | `/admin/commercial-billing/pricing`、SUPER_ADMIN再認可、任意段階/整数validation/CAS/将来月publish/immutable監査。人数は台帳計算し月次snapshot固定 | V2 UI未配備。任意人数のPreviewは請求対象数の手入力上書きでない                                |
| 履歴・確定                 | `packages/database/src/oem-billing-history.ts` / `oem-billing-admin.ts` / `commercial-usage.ts`、不足REVIEW_REQUIRED、自動backfillなし            | 旧NULLと新0人数を区別。請求/PDF/CSVの旧確定月を変更しない                                     |
| 支払い                     | 既存Invoice/paymentを再利用。V2終了契約の正当な最終請求に限定条件                                                                                 | 既存決済機能がすべて未実装とは扱わない。今回は支払い/自動回収を検証しない                     |
| 原価 / OEM帰属             | AiUsageEvent/AI Callは費用、登録/ServiceUsageは人数。EVO04はpure照合のみ                                                                          | AI原価を自動転嫁・完全OEM配賦できる状態でない。Provider設定がOEM/taskごとに独立とは断定しない |

根拠: `packages/application/src/oem-registration-billing.ts`、`apps/web/src/http/oem-billing-policy.ts` / `service-commercial-settings.ts`、`docs/OEM_REGISTRATION_BILLING_V2_IMPLEMENTATION_REPORT.md` / `docs/adr/OEM_REGISTRATION_BILLING_V2.md`。今回の人数/越境/validation/mock API testsは成功。実本番請求の正確性とは別。

## Migration / RLS / 復旧

| Migration                                         | Repository上の準備                                                                            | 現在の本番適用                                                                          |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `20261006021000_personal_learning_persistence`    | Goal証跡・Plan/Revision・Approval                                                             | 個別履歴はUNKNOWN                                                                       |
| `20261006120000_personal_learning_call_admission` | Call Admission ledger                                                                         | 個別履歴はUNKNOWN                                                                       |
| `20261006140000_personal_learning_pilot_seat`     | Seat ledger・cap/冪等/取消                                                                    | 個別履歴はUNKNOWN                                                                       |
| `20261007170000_add_oem_registration_billing`     | 5table・人数/料金nullable列・FK/CHECK/partial unique/RLS/trigger、旧pricing unique index DROP | UNKNOWN                                                                                 |
| `20261007173000_oem_billing_guardrails`           | CHECK DROP/ADD、履歴/価格/usage保護trigger                                                    | UNKNOWN                                                                                 |
| `20261008140000_learning_member_line_link`        | 会員LINE照合                                                                                  | 稼働版最新Migrationに対するhealth checkあり。ただしchecksum/catalogを直接確認していない |

全て `packages/database/prisma/migrations/{name}/migration.sql`。readinessの最新Migration存在チェックだけでは、前のMigration全部・失敗履歴・checksum・FK/index・RLS policy/実roleを証明しない。未接続の本番DBを「安全」としない。

#1176新5tableはRLS ENABLE、public policy/FORCE RLS追加なし。Application roleのBYPASSRLS/owner性とRepository認可を別々に確認する。SELECT0件の隔離テストを本番roleへ一般化しない。

過去 `OEM_REGISTRATION_BILLING_V2_MIGRATION_SAFETY_AUDIT.md` はBackup/隔離復元COMPLETEDを記録しているが、現在の最新Backupと復元元・整合検証合否・RTO/RPO・Storage復旧はUNKNOWN。同書の「runnerに独自timeoutなし」は当時の記録。最新main runnerはlock5秒/statement60秒/process300秒の既定上限と接続/role/project確認・probeを持つ。これは全pendingのatomic rollbackや本番lock-freeを保証しない。

## リリース順序とBlast Radius

production `apps/web/vercel.json`: schema assertion→build（自動Migrationなし）。main: `db:migrate:vercel`→schema assertion→build。productionブランチへmainを丸ごと更新すると、既存アプリ稼働中に全pending DB変更が始まる。単なるDeploy承認で実行しない。

本番最新Backup/隔離復元整合と全pending/RLS/roleを読取確認 → 影響・timeout・適用単位/途中失敗の人間レビュー → 別承認のMigration/検証 → 対象SHAだけのDeploy → Pilot OFF smoke/旧V1/OEM回帰 → 課金V2は初期履歴shadow確認・将来月cutoverの別承認。内部学習PilotとOEM課金V2を結合しない。

rollbackはまず新規利用停止・旧互換Application、証跡保全。DB台帳をDROPしない。V2 cutover後に旧MAUへ戻すと請求を誤る可能性があるため、請求停止/forward fixを別判断する。

## Gateと問題分類

| 問題                                   | 分類                               | 次の証拠 / 対応                                                             |
| -------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| DB全履歴・RLS・role/復旧の証拠不足     | P0 / BLOCKER（DB変更・課金V2開始） | 認可済みmetadata読取、復元整合記録。値/顧客本文不要                         |
| #1176未配備・cutover履歴不足           | P0 / BLOCKER（新課金利用）         | scope限定Release計画、初期履歴shadow・人間承認。自動backfill禁止            |
| Pilot設定・実認証・Provider限度UNKNOWN | P0 / REQUIRED（Wave 0）            | 既存Runbookの証拠を取得。UNKNOWNのままSTARTしない                           |
| EVO新Model Gate配備                    | P1 / REQUIRED（EVO配備）           | 本番modelがallowlist/optionと一致するか読取、他task波及確認。勝手に切替禁止 |
| AI費用OEM帰属不足                      | P2                                 | 現行scope・usageKeyを読取投影する最小案。人数請求へ混入しない               |

今回本番変更なし。最初に人間へ依頼する作業は **本番DBのMigration/RLS metadataを認可済み読取経路で確認し、証拠を残すこと**。Migration・Backup作成・Deployを同時に依頼しない。
