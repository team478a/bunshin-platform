# OEM契約・請求管理 実装報告

## 1. 調査した内容

- PR #718で追加した`ServiceUsageEvent`と`TenantMonthlyUsage`から、確定MAUを請求へ接続できるか確認した。
- 既存の`ServiceCommercialSetting.billingMode`はプロジェクト単位の提供条件であり、運営団体単位の契約、請求、入金管理は保持していなかった。
- Stripe等の決済Providerは未接続であるため、外部請求書・銀行振込・外部決済のどれでも使える内部台帳を優先した。

## 2. 変更したファイル

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260918170000_add_oem_contract_invoicing/migration.sql`
- `packages/application/src/commercial-billing.ts`
- `packages/database/src/commercial-billing.ts`
- `apps/web/app/(app)/admin/organizations/[workspaceId]/commercial/page.tsx`
- `apps/web/app/(app)/organizations/[workspaceId]/usage/page.tsx`
- `apps/web/src/http/commercial-usage-finalization.ts`
- 関連するexport、テスト、DB readiness、Decision Log

## 3. 主要な設計判断

### 運営団体単位の契約

`OrganizationCommercialContract`をWorkspaceに1件持たせ、準備中、契約中、一時停止、終了を管理する。請求先、支払期限、外部顧客番号、契約期間を保持する。契約中への変更はOEM権限がある団体だけ許可する。

### 確定MAUと請求の一対一対応

`TenantInvoice.monthlyUsageId`を一意にし、同じ月の二重請求を防ぐ。MAU、料金帯、料金表version、金額を請求作成時に複写し、後の料金表変更で請求根拠が変わらないようにする。3,001 MAU以上の個別見積は自動請求を作成しない。

### Provider非依存の内部請求台帳

内部台帳は下書き、請求済み、入金済み、取消を管理する。税務上の請求書や実決済は外部サービスで行い、その参照番号を保存する。Stripe固有IDをCoreへ入れていないため、将来Providerを選択できる。

### 監査とテナント分離

契約と請求状態の変更を`CommercialBillingAudit`へ保存する。請求の検索と更新は必ず`workspaceId`を条件に含め、別団体の請求を更新できないようにした。

### 月次自動処理

既存の月次MAU確定cronの後に、契約中の団体について下書き請求を冪等に作成する。管理画面からの手動確定・再作成も可能。

## 4. 実行した検証

- Prisma generate / validate
- Application、Database、Webのテスト
- lint / typecheck / production build
- 請求状態遷移、二重請求防止、個別見積除外、Workspace境界の自動テスト

## 5. 未解決事項

- 実際の請求書PDF発行、消費税計算、インボイス制度項目は外部請求サービス側で設定する必要がある。
- Stripe等の自動決済、Webhookによる自動入金消込はProvider選定と契約情報の準備後に実装する。
- 個別見積の金額は合意後に別途登録できる管理機能が必要。

## 6. 次Phaseへ進める条件

- 本番でOEM契約情報を登録し、前月MAU確定から下書き請求が1件だけ作られることを確認する。
- 利用する請求・決済Provider、税込・税別、支払方法、請求番号体系を決定する。
