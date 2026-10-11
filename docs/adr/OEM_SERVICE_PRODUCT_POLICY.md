# OEM Service Product Policy

Status: implementation review; production migration and release are not authorized.

## Context

OEMはハッシー固有の商品名ではなく、ワタシワークスが提供するService Productを他社のOrganization Workspaceで運営する提供・契約形態である。

既存のOEM正式登録課金は、Workspace配下の複数Service Groupを合算し、有料提供の正式登録Rと無料提供の実利用Aの和集合を課金人数とする。この計算は商品名に依存していない。一方、商品の識別と制約は`HASSY | MANABERU_STYLE`の閉じた型、API enum、DB CHECKに重複していた。

## Decision

- OEM、Service Product、Service Groupを分離する。
- 商品はプラットフォーム管理の`CommercialServiceProduct`とし、変更しないkeyで識別する。
- FREE許可と必要Capabilityは不変の`CommercialServiceProductPolicyVersion`へ保存する。
- `OemOfferingPeriod`は商品IDと適用したポリシー版IDを保存する。後続の商品設定変更で過去の根拠を変えない。
- 新商品はSUPER_ADMINが明示登録する。未登録、将来適用、無効な商品は`REVIEW_REQUIRED`で停止し、HASSYにfallbackしない。
- マナベルスタイルのFREE禁止とAI_TRAINING要件は、商品名分岐ではなくseedされたポリシーデータで維持する。
- OEM契約・月次課金単位は引き続きWorkspaceとする。同じUserが複数Serviceを利用しても、Workspace内で一人に重複排除する。
- 共通料金表、月次Snapshot、請求書の既存責務は変更しない。商品別料金や初期費用はこの変更に含めない。

## Safety

- migrationは新規台帳とFKを追加し、既存`HASSY`と`MANABERU_STYLE`をv1ポリシーへ明示backfillする。
- 未知の既存`product_policy`が1件でもあればmigrationを失敗させ、推測補完しない。
- ポリシー版はDB triggerで更新・削除を拒否する。
- 新台帳はRLSを有効化し、public policyを作成しない。
- 本番Migration、Deploy、商品登録、Offering変更、cutover、請求は別承認とする。

## Consequences

新しいワタシワークス商品は、商品key、FREE許可、必要Capability、適用日を登録すれば、課金計算コードを変更せずにOEM提供できる。ポリシー改定、商品廃止、商品別料金は将来の独立した管理操作とする。
