# OEM初期cutover 取消・差替え 実装報告

## 1. 調査した内容

- `OemBillingPolicy`はWorkspaceごとに1行だけ存在し、正式登録課金V2の開始月を決める。既存実装は将来月の初回予約だけを許可し、誤予約の取消・差替えをできなかった。
- 課金dashboard、月次確定、一括確定queue、契約期間連携が`OemBillingPolicy`を直接参照していた。
- 開始済みcutoverを旧MAUへ戻すと請求根拠を変えるため、通常の管理画面訂正として扱えない。確定済み`TenantMonthlyUsage`も不変である。

## 2. 変更したファイル

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20261012090000_oem_billing_policy_revision/migration.sql`
- `packages/database/src/oem-billing-policy-projection.ts`
- `packages/database/src/oem-billing-admin.ts`
- `packages/database/src/commercial-usage.ts`
- `packages/database/src/commercial-billing-service.ts`
- `packages/database/src/schema-readiness.ts`
- Database unit / integration tests
- `apps/web/src/http/oem-billing-policy.ts`
- `apps/web/app/(app)/admin/organizations/[workspaceId]/commercial/*`
- 関連Web tests
- `docs/DECISION_LOG.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- 本報告

## 3. 主要な設計判断

- 初回予約の`OemBillingPolicy`は更新・削除せず、`OemBillingPolicyRevision`をappend-onlyな1対1 supersessionチェーンとして追加する。
- 最新葉が`CANCELLED`なら旧MAU方式を継続し、`RESCHEDULED`なら再確認した将来月・rule version・履歴準備時刻を課金projectionにする。
- 予約中の取消・将来月差替えと、取消後の将来月再予約を同じ訂正操作で扱う。同一actor・理由・訂正値の再送は同じrevisionを返す。
- SUPER_ADMIN再認可、Workspace lock、期待値CAS、理由、明示確認を必須とする。差替え・再予約ではOffering、契約期間、正式登録履歴をtransaction内で再検証する。
- 現在月以前に開始したcutover、または変更区間に確定済み月がある訂正は拒否する。変更前後は`CommercialBillingAudit`へ保存する。
- DB triggerでrevisionのUPDATE / DELETEとWorkspaceを越えるsupersessionを拒否し、初回revisionと各後続を一意にする。

## 4. 実行した検証

- Database対象unit tests: 4 files / 25 tests成功
- Web対象tests: 3 files / 30 tests成功
- Database全体unit tests: 200 files / 969 tests成功
- Web全体tests: 474 files / 3333 tests成功（2 files / 2 tests skip）
- 全体typecheck成功（Turbo 25 / 25 tasks、学習UI型検査を含む）
- 全体lint成功（Turbo 25 / 25 tasks、学習UI lintを含む）
- Architecture boundary check成功
- Prisma schema validate成功
- 使い捨てPostgreSQL 16への全241 migrations適用成功
- 対象integration test成功（取消、冪等再送、旧MAU投影、再予約、別Workspace参照拒否、開始後拒否、確定月拒否、履歴UPDATE拒否。1成功 / 188 skip）
- Web production build成功
- Prettier適用、`git diff --check`成功

## 5. 未解決事項

- 開始済みcutoverの取消・旧方式へのrollbackは未実装。請求停止、会計、確定済みsnapshot、forward fixを含む別Runbookと人間承認が必要。
- 確定済み月の取消・再確定は実装しない。
- 本番Migration、Deploy、cutover予約・訂正、月次確定、請求発行、実課金は実施しない。

## 6. 次Phaseへ進める条件

1. PRレビューとGitHub CI成功。
2. 非本番で、取消、取消後再予約、応答喪失後の再送、開始済み拒否を実認証で確認する。
3. 本番Migration、Deploy、cutover操作はそれぞれ個別の明示承認を得る。
