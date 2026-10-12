# OEM正式登録課金 初期履歴・cutover管理画面 実装報告

## 1. 調査した内容

- 正式登録課金V2には、提供区分、初期正式登録、契約期間、将来月cutover、月次shadowのSUPER_ADMIN APIとDB Serviceが既に存在する。
- 団体別商用管理画面には課金人数根拠が表示される一方、初期履歴を準備してshadow差分を確認し、cutoverへ進む運用画面がなかった。
- `OemOfferingPeriod`、`OemRegistrationPeriod`、`OemContractPeriod`、`OemBillingPolicy`が正本であり、現在状態、サービス名、価格、同意日時から過去履歴を推測してはいけない。

## 2. 変更したファイル

- `packages/database/src/oem-billing-admin.ts`
- `packages/database/test/oem-billing.integration-cases.ts`
- `apps/web/app/(app)/admin/organizations/[workspaceId]/commercial/page.tsx`
- `apps/web/app/(app)/admin/organizations/[workspaceId]/commercial/commercial-admin-dashboard.tsx`
- `apps/web/app/(app)/admin/organizations/[workspaceId]/commercial/commercial-admin-types.ts`
- `apps/web/app/(app)/admin/organizations/[workspaceId]/commercial/oem-billing-preparation-section.tsx`
- `apps/web/test/oem-billing-preparation-admin.test.ts`
- `docs/DECISION_LOG.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- 本報告

## 3. 主要な設計判断

- 新しい台帳や計算器を作らず、既存の4履歴正本と既存shadowをOrganization単位の読み取りモデルへ投影する。
- 保存はServer Actionの入力検証後、session actorを既存DB Serviceへ渡す。ブラウザーからactorを受け取らず、DB transaction内のSUPER_ADMIN再認可、Workspace境界、lock、CAS、商品互換性検査を維持する。
- 提供区分、契約期間、正式登録、cutoverの各操作に理由と明示確認を必須にする。正式登録日時の初期値は同意日時を候補表示するだけで、自動保存しない。
- 終了済み登録履歴がある現在参加者には初期登録フォームを出さず、訂正・再登録の個別レビューへ止める。
- shadowが履歴不足なら人数を表示せず、0人や旧MAUで補完しない。cutoverフォームは表示上の準備条件を満たす場合だけ出すが、最終許可は既存Serviceがtransaction内で再検証する。
- 既存cutoverは変更・取消できない。schema、migration、課金計算、月次確定、請求発行は変更しない。

## 4. 実行した検証

- 対象Web tests: PASS（3 files / 12 tests）
- Database全体unit tests: PASS（197 files / 963 tests）
- Web全体tests: PASS（474 files / 3327 tests、2 files / 2 testsは既存skip）
- 使い捨てPostgreSQL 16: 全238 migrations適用成功、対象integration test PASS（1 test、185 tests skipped）
- Database / Web typecheck: PASS（Node 24 / pnpm 10）
- 変更Database / Webファイルlint: PASS
- Architecture boundary check / tests: PASS（10 tests）
- Web production build: PASS（Next.js、static pages 35/35）
- 変更ファイルPrettier / `git diff --check`: PASS

## 5. 未解決事項

- 終了済み登録履歴の訂正・再登録、誤cutoverの訂正、cutover取消は含めない。
- 契約終了後の契約外月を要確認queueから分離する機能は含めない。
- 本番の既存Offering、登録証跡、契約期間、shadow差分、Migration適用状態は未確認。
- 実認証を含む非本番スマートフォン操作は未確認。

## 6. 次Phaseへ進める条件

1. PRレビューとGitHub CI成功。
2. 実認証を含む非本番環境で、履歴不足、準備完了、予約済みの各状態を確認する。
3. 本番Migration、Deploy、履歴登録、cutover、料金公開、請求確定、実課金はそれぞれ明示承認を得る。
