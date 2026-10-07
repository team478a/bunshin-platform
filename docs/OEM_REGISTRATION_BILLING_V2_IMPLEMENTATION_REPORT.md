# OEM Registration Billing / Dynamic Pricing V2 実装報告

## 作業単位と承認範囲

- 日付: 2026-10-07
- 基準main: `6400027cd0e041d1fe732b178aeb502546df5aff`
- branch: `codex/oem-registration-billing`
- commit / PR / CI: 最終報告とPRのheadを正本とする（自己参照SHAを文書へ埋め込まない）。
- 参照: 人間承認済み `OEM_Billing_Admin_Implementation_20261007.docx`、AGENTS、Architecture Principles、既存OEM実装報告、[ADR](adr/OEM_REGISTRATION_BILLING_V2.md)。
- 本番DB接続・Migration適用・Deploy・価格変更・課金・Stripe/AI Provider呼出し・mergeは実施しない。元checkoutの未解決変更には触れない。

## 正本と人数ルール

| 責務            | 正本                                                   | 扱い                                                                                                                                         |
| --------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 正式登録/終了   | `OemRegistrationPeriod`                                | 既存同意・参加承認後だけ記録。招待、未同意、承認待ちは登録でない。停止と管理者昇格は終了でない。明示退会/REVOKEDだけ閉じる。再登録は新期間。 |
| 提供区分        | `OemOfferingPeriod`                                    | FREE / PAID / PAID_BUNDLE。決済方式や価格と別。旧区分を閉じ、新区分を追記。                                                                  |
| OEM契約有効期間 | `OemContractPeriod`                                    | 人間が確認した開始・終了。現在のContract statusやEntitlementでは過去を消さない。期間重複は管理操作で拒否。                                   |
| 新方式の開始    | `OemBillingPolicy`                                     | 人間が確認した初期履歴＋将来利用月。自動backfillなし。                                                                                       |
| 実利用          | 既存`ServiceUsageEvent`                                | 既存有効な利用の種類を再利用。MAUは従来の実利用人数。                                                                                        |
| 月次人数/価格   | `TenantMonthlyUsage`                                   | 登録人数R、無料実利用A、重複、R∪A、ruleVersion、根拠期間ID、価格版/参照を確定して固定。                                                      |
| 請求/PDF        | `TenantInvoice` / `documentSnapshot`                   | 月次確定値をコピーし、既存発行フローを再利用。旧確定月・PDFは更新しない。                                                                    |
| 全OEM料金       | `CommercialPricingSchedule` / `CommercialPricingAudit` | 共通の版固定料金表、追加のみのbefore/after/actor/reason監査。OEM別単価を作らない。                                                           |

Rは、月・OEM契約・有料提供・正式登録の期間が重なるunique user集合。Aは、契約中のFREE提供時点に対象利用を持つunique user集合。Workspace内は`|R∪A|`で一人一回、Workspace間は独立。JST月の半開区間を使用し、正式登録と即時終了が同一時点ならその月だけRへ数える。月初境界で終了した通常期間は翌月へ持ち越さない。

PAID_BUNDLEはサービス単品0円でも有料提供としてRへ数える。マナベルスタイルのOEM FREEは禁止。内部Product Policyと採用Definitionの`AI_TRAINING` Capabilityで判定し、ブランド/slug/金額で推測しない。OEM契約がない直営・内部Pilotは別扱い。OEM契約の有効化時にも既存採用Programを再検査する。

## 同時実行と履歴

- 登録/終了はMembership row lock、正式登録中の再送は既存open periodへ戻る。
- 提供区分・契約準備・cutover・月次確定はWorkspace row lockで直列化。新方式の確定月は再確認後、同じimmutable snapshotを返す。
- 請求下書きは既存`monthlyUsageId` uniqueを再利用し、重複作成競合だけskipする。
- Pricing下書き編集はrevision CAS。新規下書きはversionのadvisory lockと同一内容/actorの再送判定。publish/cancelはrow lock＋revision＋同月PUBLISHED partial unique。取消後は同月へ別版を公開予約できる。
- 公開料金、取消料金、価格Audit、閉じた履歴はDB triggerで保護。旧月次immutable triggerを無効化しない。
- 履歴不足・区分の時間的欠落はREVIEW_REQUIRED。0人や旧MAUで代用しない。そのWorkspaceを止め、他社の月次処理を続ける。

## 料金管理UI

`/admin/commercial-billing` → `/admin/commercial-billing/pricing`。既存認証＋SUPER_ADMIN、保存serviceでも再認可（user ACTIVE必須）。

- 任意の段階、安定tier ID、段階追加/削除（削除確認、最低1段階）、各上限、税込金額を編集。
- 下限は前段階の上限＋1。最初の上限0・金額0を許可。個別見積開始人数は最終上限＋1で、編集時には最終上限も連動。
- 空欄を0へ変換しない。整数、上限順序、重複ID、価格の非負、DB整数範囲を検査。最大100段階。
- 任意人数で現行/新料金を同じ純粋計算器で比較。税込額へ重ねて税を足さない。下降価格は理由＋明示確認必須。
- 下書き保存は課金へ反映しない。公開は翌JST利用月以降だけ。公開/取消は別の確認操作。公開済みの値と監査履歴は閲覧のみ。
- モバイル縦配置。使用中の画面へ実データや秘密情報を持ち込まず、390px隔離component fixtureで操作試験。

## 請求と契約終了

nullable新列を追加し、MAU列を置換しない。旧行のNULLだけ旧MAU表示へfallbackし、新方式の0は0を保つ。UI、CSV、発行Snapshotへ課金対象人数を反映。利用月の料金を選び、締め日による価格変更はしない。

新方式では履歴上の契約有効期間を確認して、現在ENDED/SUSPENDEDでも正当な最終月の下書きを作れる。終了後のEXTERNAL_BILLING手動支払いは、現Workspace OWNER/ADMIN・ISSUED請求・新方式・歴史的契約の再検証が必要。利用権を復活させず、自動Payment Methodを保存しない。終了後の自動回収を追加しない。旧方式は既存ACTIVE契約制約を維持する。

月次処理は下書きまで。自動発行・新しい自動徴収・カード保存・Pricing/Provider変更・AI原価の自動転嫁は追加しない。

## Migration inventory / 注意

| Migration                                     | 内容                                                                                                      | 適用               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------ |
| `20261007170000_add_oem_registration_billing` | 5履歴/監査テーブル、新nullable人数/版/FK、料金下書きfields、partial unique、CHECK、RLS、immutable trigger | 隔離PostgreSQLのみ |
| `20261007173000_oem_billing_guardrails`       | V2人数NULL拒否、料金取消/履歴保護、既存Membership状態CHECK不整合修正                                      | 隔離PostgreSQLのみ |

既存行削除、確定行更新、backfillなし。新テーブルRLS有効、公開roleのpolicyを作らずdeny。trusted server DB接続が必要。新FKはRESTRICT / NO ACTION、Membershipのcomposite FKでworkspace/group/user同一性を保証。

既存enum/applicationがSUSPENDED/PENDING_APPROVALを扱う一方、旧DB CHECKが拒否することを実DBで確認した。2状態へ既存ACTIVEと同じ同意必須・取消なし条件を追加する。INVITED/DECLINED/REVOKED条件は維持。承認待ちを正式登録にはしない。

新テーブル/制約は追加中心だが、旧料金effectiveFromの無条件uniqueを公開版partial uniqueへ置換し、旧Membership CHECKを拡張する。DDL/index作成のlock・本番所要時間・本番既存データ適合はUNKNOWN。Production安全性PASSとしない。

## 検証

結果はPR/最終報告へ集約する。実行中の項目をPASSとしない。

確認済み: 隔離PostgreSQLの全integration 172件成功（Node 24、1 worker）。mobile component E2E 1件成功。architecture checkとarchitecture test 10件成功。

全13 Package build成功。application 861件、capability-training 288件、database unit 851件成功。Webは3032件成功、実Provider用2件skip。初回Web全体実行では既存の文言filesystem scan 1件が5秒timeoutになったため、コードのtimeout設定は変えず、コマンドに`--testTimeout=30000`を指定して全Web回帰を再実行し成功した。

Prisma migration diffは全体では既存FK/index名等の差分を検出するため、全schema一致とは判定しない。今回追加したOEM課金テーブル・料金・usage/invoiceの対象に差分は検出されなかった。既存差分を今回まとめて修正しない。

初回の並行検証はWindowsのPrisma DLLロックとメモリ圧迫によるtimeoutで失敗した。DB試験は重いジョブを止めて直列再実行し成功。ビルド・全体回帰・lint等は最終結果を別途記録する。

全Package typecheck成功（25 tasks、依存buildを含む）。全体lintで追加テストの不要な型アサーション5箇所と認証mockのrequire-await 1箇所を検出し修正した。Database全体lintの再実行とWeb修正対象lint/APIテスト5件は成功。Web全体scanには既存`app/consent/page.tsx`のunused eslint-disable警告1件があり、無関係な変更を混ぜず維持する。最終CIはPRで確認する。

- application純粋計算: R/A/union、提供区分遷移、JST、同時点登録/終了、tier境界、不正整数、NULL/0。
- 全database unit・全web unit・applicationと既存Package回帰。
- 使い捨てPostgreSQL16、loopback専用ポート18998、syntheticデータ。既存live preflightがDB名・run ID・DB comment markerを検査してからcleanup。Production credentialsなし。
- 実DB: 正式登録write→台帳→停止/昇格→shadow（書込なし）→並行月次確定→並行請求下書き→明示終了→0人数維持→終了契約の最終下書き。別Workspace composite FK拒否。
- 実DB: Pricing draft/CAS、同時公開、重複版再送、下降価格確認、公開版immutability、取消/同月差替/同操作再送、非SUPER_ADMIN拒否。
- 実DB: 新5テーブルは非owner DB roleのSELECTが0件、INSERTがRLS拒否。
- Web: same-origin/session/SUPER_ADMIN、偽actor/未確認拒否、review conflict。Stripe adapterはmockのみ。終了後の手動Checkout条件とPayment Method非保存。
- mobile component E2E: 段階追加/削除確認、5001見積、閾値6001→最終上限6000、空金額のpreview拒否、stable ID保存、横overflowなし。これは実Auth込みの本番E2Eではない。
- Prisma validate/generate/readiness、architecture、format、lint、typecheck、build、diff check。

## C01–C15 / P01–P15対応

| Case                | 検証根拠                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------- |
| C01/C02/C03         | application登録100未利用、FREE100/active10、PAID_BUNDLE100。金額/決済を人数入力にしない。     |
| C04/C05             | 台帳のない招待0、正式登録1、再送/複数Serviceのunique user。実DB登録再送。                     |
| C06/C07/C08         | 履歴を停止で閉じない。rejoin/終了/JST計算。実DB停止・管理者昇格・明示終了・終了契約最終請求。 |
| C09/C10/C11         | 120+80−20=180、Service重複排除、crossWorkspace拒否。                                          |
| C12/C13/C14/C15     | 提供区分FREE↔PAID、管理者昇格後台帳維持、JST半開/即時終了、Manaberu FREE禁止。                |
| P01/P02/P03/P04/P05 | 動的上限/価格/stable ID、最初0、5001見積、最低1段階、mobile追加/削除。                        |
| P06/P07             | 空欄/負/小数/指数/NaN/巨大値、下書きはPUBLISHED読取から除外。                                 |
| P08/P09/P10         | 実DB同月並行公開、CAS、版/公開再送、取消後同月差替。                                          |
| P11/P12             | 使用月で価格選択、公開/確定Snapshot trigger。                                                 |
| P13/P14/P15         | SUPER_ADMIN/API認可、並行下書き、終了後手動決済mock、旧NULL/新0/REVIEW_REQUIREDの分離。       |

## 本番前運用（このPRでは実行しない）

1. 人間レビューでmigration SQL/ロック/Backup・復元・接続role/RLS・旧データ適合を確認。既存Runbookの本番Gateを維持。
2. 承認済みMigrationを先に適用しschema/readiness確認、次にApplication Deploy。新方式cutover未設定では旧請求方式を維持。
3. SUPER_ADMINが商品/登録/契約の証跡を確認し、下記trusted APIで最小初期履歴を明示準備。推定日付を投入しない。
4. shadowを旧MAUと比較し、各差分を承認。根拠不足なら新方式を開始しない。
5. 別承認で将来月cutoverと将来料金のpublish。旧確定請求を移行・再計算しない。
6. 最初の新方式月次下書き・union counts・価格版を人間がレビューしてから既存ISSUE手順へ進む。

API: `POST /api/admin/commercial-billing/oem-policy`。同一origin、既存SUPER_ADMIN session、JSON、`confirmed:true`、`workspaceId`、`reason`必須。

- `SET_OFFERING`: `groupId, productPolicy, classification, expectedCurrentId`。初回null、変更時は現在ID。
- `REVIEW_REGISTRATION`: `groupMembershipId, registeredAt`。既存同意・参加状態と所属を再検証。同内容/actor再送は同じ履歴を返す。
- `REVIEW_CONTRACT`: `startsAt, endsAt`。実契約の存在、期間、重複を再検証。既知同内容は再送可能。
- `SCHEDULE_CUTOVER`: `month:'YYYY-MM', historyReviewed:true`。最短翌JST月、初期履歴が不足すると409。初期cutover後の再変更APIは作らない。
- shadow: `GET /api/admin/commercial-billing/oem-policy/shadow?workspaceId=<uuid>&month=YYYY-MM`。読取のみ。本文/資格情報をログへ出さない。

月次確定の既存入口は`src/http/commercial-usage-finalization.ts`。usageとinvoice準備結果の`reviewRequired`を運営が確認する。未解決会社を0円で処理しない。

## Rollback / 未解決

- cutover前: 新方式を予約しない。既存料金/請求は維持。価格公開予約は適用開始前・参照なしの場合だけcancelする。
- cutover後: 旧MAU計算器で新対象月を締め直さない。該当OEMの月次確定/請求発行を停止し、根拠を保全してforward fix/人間レビュー。旧Applicationへrollbackすると旧価格管理の公開入口も戻るため、単純rollbackを安全とみなさない。
- DBの破壊的down migration/台帳削除/immutable解除を用意しない。新履歴を残し、承認済み復旧Runbookに従う。
- 本番既存登録の根拠、過去の区分・契約期間、Migration時間/RLS/Backup/復元は未確認。人間の初期レビュー作業が必要。
- 実認証込みの料金管理・実決済E2Eは未実施。今回はcomponent操作とserver/service/DB認可試験まで。Productionでの操作は別承認。
- 契約終了後の契約外月も、現処理ではREVIEW_REQUIRED queueへ残り確定しない。自動0円請求へは進めない。運営で契約終了を確認する。終了済み月をqueueから自動除外する最適化は未実装。
- 任意の履歴修正/誤初期cutover修正UI、OEM独自料金、人数単価、初期費用、自動AI原価転嫁、大規模管理UIは未実装・対象外。

次工程はPR/CIレビュー。本番Migration/deploy/価格publish/cutover/請求書発行/実課金は、このPR完了の自動続行対象ではない。
