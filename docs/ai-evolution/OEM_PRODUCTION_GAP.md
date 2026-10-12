# OEM・本番環境 差分監査

## 結論

mainのOEM課金はハッシー専用ではなく、**ワタシワークスが提供する任意のService Productを明示登録して使う共通基盤**へ進化している。一方、production `e5812090…` には#1176の正式登録課金V2も、#1231以降の共通商品・初期費用・履歴訂正も含まれない。新方式による本番請求は **NO-GO**。

既存productionの従来課金・請求経路が存在することと、新OEMルールが使えることを混同しない。

## mainとproduction

| 項目                | main `31ea1d20…`                   | production `e5812090…`                                |
| ------------------- | ---------------------------------- | ----------------------------------------------------- |
| 系統                | #1249まで                          | #1219までの限定release                                |
| 分岐                | productionとの共通祖先後100 commit | mainとの共通祖先後68 commit                           |
| OEM正式登録課金V2   | #1176と後続改善を含む              | sourceと2 Migrationを含まない                         |
| 共通Service Product | #1231〜#1236                       | 未配備                                                |
| 初期費用            | #1237〜#1239                       | 未配備                                                |
| 返金要照合          | #1240〜#1243                       | 未配備                                                |
| 人数根拠/cutover UI | #1244〜#1245                       | 未配備                                                |
| 終了契約/履歴訂正   | #1246〜#1249                       | 未配備                                                |
| Personal Learning   | mainの後続機能を含む               | 焦点表示、承認UI、原価可視化、費用Hard Stopを限定配備 |

tree差分は286 files、+26,508 / -2,212。main一括releaseの根拠にせず、対象機能とMigrationを限定する。

## 商品・課金ルール

| 要件         | mainの正本                                                               | 本番差分                                      |
| ------------ | ------------------------------------------------------------------------ | --------------------------------------------- |
| ハッシー無料 | 契約期間内FREE提供の有効利用者集合Aを実測                                | V2未配備                                      |
| ハッシー有料 | 有効な正式登録集合R。未利用でも登録課金                                  | V2未配備                                      |
| マナベル     | Product PolicyでFREE不可・必要Capabilityを明示。名称やslugから推測しない | V2/商品Policy未配備                           |
| 重複         | Workspace内でR∪A、同一人を二重計上しない                                 | 新方式未配備                                  |
| 料金・人数   | 共通段階料金、R/A/重複/R∪A、月次snapshot、要確認表示                     | 管理UIを含め未配備                            |
| 初期費用     | 月額と別Invoice。契約証拠、商品、税込金額、合意日を不変保存              | 未配備。80万円/30万円等をコード固定していない |
| Offering移行 | 1件ずつ新版へCAS移行。過去期間/請求を変更しない                          | 未配備                                        |
| 履歴訂正     | 契約、提供、登録、cutoverをappend-onlyで取消/差替え                      | 未配備                                        |
| 返金         | Stripe返金を自動確定せずREVIEW_REQUIREDへ                                | Webhook購読・実返金とも未検証                 |

`OemProductPolicy` はFREE可否と必要Capabilityを版付きで持ち、SUPER_ADMINが登録する。Workspace単位請求と共通料金表は維持し、商品名、金額、決済方式から商品種別を推測しない。

## AI原価とOEM請求

- AI原価: `AiUsageEvent`、Personal Learning AI Call、Provider Call Admission。
- OEM請求: Offering/Registration/Contract/Usage期間と `TenantMonthlyUsage` snapshot。
- 初期費用: `OemSetupFeeCharge` と専用Invoice。

単位と正本が異なるため、AI原価を人数へ加えたり、人数料金をAI原価と表示したりしない。EVO-04の照合とProvider Admissionは原価安全の基盤だが、Provider請求書、税・為替、OEM別の完全な原価/利益帰属は未完成。

## Migration・RLS・本番差分

production→mainにのみ存在する主なMigration:

- `20261007170000_add_oem_registration_billing`
- `20261007173000_oem_billing_guardrails`
- `20261011180000_ai_provider_call_admission`
- `20261011200000_oem_service_product_policy`
- `20261011220000_oem_product_policy_admin`
- `20261011230000_oem_setup_fee_invoicing`
- `20261012070000_oem_contract_period_supersession`
- `20261012080000_oem_operational_period_supersession`
- `20261012090000_oem_billing_policy_revision`

productionのMigration runnerは#1219時点で `20261010070000_personal_learning_call_cost_reservation` を唯一のtarget、`20261008140000_learning_member_line_link` を直前Migrationとして固定し、履歴集合を事前照合する。したがって#1176以降のOEM Migrationは当該限定releaseに含まれない。

ただし今回、本番DB catalogを新たに直接SELECTしていない。手動drift、Application接続role、全RLS policy、最新Backup/復元整合はUNKNOWN。本番DBを推測でPASSにしない。

mainの通常Vercel buildも `db:migrate:vercel` を実行する。mainをproductionへ丸ごと載せると多数のpending Migrationと機能を同時に扱うため禁止。限定releaseではMigration lineage、lock/statement/process上限、Backup、RLS role、旧コード混在、rollbackを対象ごとに再レビューする。

## 本番開始前のGate

1. 本番全Migration履歴、対象schema、RLS/接続role、最新Backupと隔離復旧を読取確認。
2. 現在のOffering/契約/登録/利用/既存請求を匿名集計で照合し、初期履歴を推測せず証拠から作る。
3. 新旧方式をshadow比較し、R/A/重複/R∪A、料金、既存確定月不変を人間確認。
4. Product Policy、Offering移行、cutoverを1件ずつ別承認。請求確定・発行・決済も別承認。
5. 既存利用者、旧月次請求、Stripe、督促、CSV/PDF、終了契約の非回帰を確認。

今回はMigration、Deploy、商品登録、履歴登録、cutover、請求、返金、実課金を行っていない。
