# OEM契約期間 訂正フロー 実装報告

## 1. 調査した内容

- `OemContractPeriod`はOEM契約期間の正本で、既存DB triggerは終了日時の初回追記以外のUPDATEとDELETEを拒否する。
- 初期履歴・cutover管理画面は新規期間を登録できるが、証跡誤読による開始・終了日時の訂正入口がなかった。
- 月次計算、請求準備、契約終了後の最終請求Checkout、契約対象外月のキュー分離が契約期間を直接参照している。
- 確定済み`TenantMonthlyUsage`は請求前でも不変の課金根拠であり、対象月の契約有無を変える訂正に含めてはいけない。

## 2. 変更したファイル

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20261012070000_oem_contract_period_supersession/migration.sql`
- `packages/database/src/oem-billing-admin.ts`
- `packages/database/src/oem-billing-history.ts`
- `packages/database/src/commercial-usage.ts`
- `packages/database/src/commercial-billing-service.ts`
- `packages/database/test/oem-billing.integration-cases.ts`
- `packages/database/test/oem-contract-period-correction-schema.test.ts`
- `apps/web/src/http/oem-billing-policy.ts`
- `apps/web/src/payments/commercial-invoice-payment.ts`
- `apps/web/app/(app)/admin/organizations/[workspaceId]/commercial/page.tsx`
- `apps/web/app/(app)/admin/organizations/[workspaceId]/commercial/commercial-admin-types.ts`
- `apps/web/app/(app)/admin/organizations/[workspaceId]/commercial/oem-billing-preparation-section.tsx`
- 関連Web tests
- `docs/DECISION_LOG.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- 本報告

## 3. 主要な設計判断

- 元の契約期間を更新・削除せず、訂正版が直前版を`supersedesId`で参照するappend-onlyな1対1チェーンにする。月次計算と請求は後続を持たない最新葉だけを参照する。
- Workspace row lock、期待開始・終了日時、最新葉判定でCASを行う。同一actor・同一理由・同一訂正値の再送は同じ訂正版を返し、別内容の再送は`STALE_CONTRACT_PERIOD`で止める。
- 訂正前後の区間差分と、保存済み確定月のJST境界を比較する。差分が確定済み月に重なる訂正は`FINALIZED_BILLING_PERIOD_IMMUTABLE`で拒否する。影響しない将来終了日の追加まで一律禁止しない。
- 他の有効契約期間との重複を再検証し、元版と訂正版を`CommercialBillingAudit`のbefore/afterへ保存する。
- UIとJSON APIはいずれもSUPER_ADMIN session actor、明示確認、根拠理由を必須にする。ブラウザー入力のactorは受け取らない。
- DB migrationは既存行を削除・書換えず、nullable自己参照列、1対1 unique、FK、自己参照禁止CHECK、検索indexだけを追加する。

## 4. 実行した検証

- 対象Web tests: 3 files / 24 tests成功
- 対象Database unit tests: 3 files / 24 tests成功
- Database全unit tests: 198 files / 967 tests成功
- Web全tests: 474 files / 3,329 tests成功、2 files / 2 tests skip
- 全体typecheck: 25 tasks成功（learning UI typecheckを含む）
- Prisma schema validation成功
- 使い捨てPostgreSQL 16への全239 migrations適用成功
- 対象integration test成功（元版保持、冪等再送、最新葉projection、監査、確定月拒否。1成功 / 186 skip）
- Database / Web lint、Architecture boundary check成功
- Web production build成功
- Prettier、`git diff --check`成功

## 5. 未解決事項

- Offering期間と正式登録期間の訂正は`docs/OEM_OPERATIONAL_HISTORY_CORRECTION_IMPLEMENTATION.md`で実装した。
- 誤った初期cutoverの取消・差替えは未実装。
- 確定済み月へ影響する訂正は自動で行わない。請求取消、会計、再確定を含む別の人間承認Runbookが必要。
- 本番Migration、Deploy、履歴訂正、月次確定、請求発行、実課金は実施しない。

## 6. 次Phaseへ進める条件

1. PRレビューとGitHub CI成功。
2. 非本番で、未確定期間の訂正、応答喪失後の再送、競合、確定済み月拒否を実認証で確認する。
3. 本番Migration、Deploy、履歴訂正はそれぞれ個別の明示承認を得る。
