# OEM提供・正式登録期間 訂正フロー 実装報告

## 1. 調査した内容

- `OemOfferingPeriod`と`OemRegistrationPeriod`は正式登録課金V2の人数・提供区分を決める正本で、既存DB triggerは終了情報の初回追記以外のUPDATEとDELETEを拒否する。
- 既存管理画面は初期履歴と将来の状態遷移を登録できるが、誤った開始・終了日時や提供区分を元証跡を残して訂正する入口がなかった。
- 月次shadow、確定、初期費用の商品判定、AI研修の商品適合性、cutover準備が両履歴を直接参照している。
- 確定済み`TenantMonthlyUsage`は不変の課金根拠であり、対象月の人数・提供区分を変える訂正に含めてはいけない。

## 2. 変更したファイル

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20261012080000_oem_operational_period_supersession/migration.sql`
- `packages/database/src/oem-billing-admin.ts`
- `packages/database/src/oem-billing-history.ts`
- `packages/database/src/oem-training-offering.ts`
- `packages/database/src/commercial-billing-service.ts`
- `packages/database/src/schema-readiness.ts`
- `packages/database/test/oem-billing.integration-cases.ts`
- `packages/database/test/oem-operational-period-correction-schema.test.ts`
- `apps/web/src/http/oem-billing-policy.ts`
- `apps/web/src/http/service-commercial-settings.ts`
- `apps/web/app/(app)/admin/organizations/[workspaceId]/commercial/*`
- 関連Web tests
- `docs/DECISION_LOG.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- 本報告

## 3. 主要な設計判断

- 元行を更新・削除せず、訂正版が直前版を`supersedesId`で参照するappend-onlyな1対1チェーンにする。課金計算と運用上の現在値は後続を持たない葉だけを参照する。
- Offering訂正は同じService Product・Policy Version内の期間境界と`FREE` / `PAID` / `PAID_BUNDLE`だけを対象にする。商品自体の差替えは別の人間レビューとする。
- 正式登録訂正はWorkspace、Group、Membership、Userを固定し、期間境界だけを対象にする。
- WorkspaceまたはMembership lock、期待値CAS、最新葉判定で競合を止める。同一actor・理由・訂正値の再送だけを冪等成功にする。
- 期間差分、または提供区分変更時の全対象区間がJST境界の確定済み月と重なる場合は`FINALIZED_BILLING_PERIOD_IMMUTABLE`で拒否する。
- 他の有効な葉との重複、商品ポリシー適合性、SUPER_ADMIN、理由、明示確認をtransaction内で再検証し、before/afterを`CommercialBillingAudit`へ保存する。

## 4. 実行した検証

- 対象Web tests: 3 files / 28 tests成功
- 対象Database unit tests: 4 files / 25 tests成功
- Database全体tests: 199 files / 968 tests成功
- Web全体tests: 474 files / 3331 tests成功、2 files / 2 tests skip
- root typecheck: 25 tasks成功、Learning UI typecheck成功
- 使い捨てPostgreSQL 16への全240 migrations適用成功
- 対象integration test成功（元版保持、冪等再送、最新葉projection、監査、確定月拒否。1成功 / 187 skip）
- Prisma schema validate成功
- Database / Web lint成功
- Architecture boundary check成功
- Web production build成功
- Prettier適用、`git diff --check`成功

## 5. 未解決事項

- 誤った初期cutoverの取消・差替えは`docs/OEM_CUTOVER_HISTORY_CORRECTION_IMPLEMENTATION.md`で実装した。
- Service Product自体またはPolicy Versionの過去訂正は未実装。
- 確定済み月へ影響する訂正は自動で行わない。請求取消、会計、再確定を含む別の人間承認Runbookが必要。
- 本番Migration、Deploy、履歴訂正、月次確定、請求発行、実課金は実施しない。

## 6. 次Phaseへ進める条件

1. PRレビューとGitHub CI成功。
2. 非本番で、未確定期間の訂正、応答喪失後の再送、競合、確定済み月拒否を実認証で確認する。
3. 本番Migration、Deploy、履歴訂正はそれぞれ個別の明示承認を得る。
