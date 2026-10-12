# OEM初期費用 自動回収除外 実装報告

## 1. 調査した内容

- 団体単位の既存自動回収同意は、管理画面と既存実装報告の両方で「次回以降の月額料金」を対象としていた。
- 初期費用追加後の日次自動回収候補は`ISSUED`等の状態だけで検索し、`TenantInvoice.kind`を限定していなかった。
- このままでは、月額料金だけの同意を初期費用にも拡張したとみなし、保存済みStripe支払方法へ初期費用を自動請求し得ることを確認した。

## 2. 変更したファイル

- `apps/web/src/payments/commercial-invoice-automatic-collection.ts`
- `apps/web/app/(app)/admin/organizations/[workspaceId]/commercial/commercial-contract-section.tsx`
- `apps/web/test/commercial-automatic-collection.test.ts`
- `apps/web/test/oem-setup-fee-admin.test.ts`
- `docs/DECISION_LOG.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/OEM_SETUP_FEE_AUTOMATIC_COLLECTION_GUARD_IMPLEMENTATION.md`

## 3. 主要な設計判断

- 日次自動回収の候補は`TenantInvoice.kind = MONTHLY_USAGE`へ限定する。
- `SETUP_FEE`は、手動入金または団体管理者が明示的に開始する既存Stripe Checkoutで扱う。
- 初期費用を自動回収するための同意を、既存の月額同意や契約状態から推測しない。
- 管理画面に、現在の自動回収対象は月額料金だけで初期費用は対象外であることを明記する。
- schema、migration、保存済み同意、請求状態、Stripe設定は変更しない。

## 4. 実行した検証

- 対象Web tests: PASS（2 files / 6 tests）
- Web全体tests: PASS（471 files / 3315 tests、2 files / 2 tests skipped）
- Web typecheck: PASS
- Web lint: PASS（0 errors。既存ファイルに未使用`eslint-disable`警告1件）
- Web production build: PASS（Next.js、static pages 35/35）
- Architecture boundary tests: PASS（10 tests）
- Prettier / `git diff --check`: PASS

## 5. 未解決事項

- 本番Stripeの自動回収は実行していない。
- 初期費用を将来自動回収する場合の専用同意、取消、返金方針は未設計。
- 既に作成済みの初期費用請求が本番に存在するか、その状態は確認していない。

## 6. 次Phaseへ進める条件

1. PRレビューとGitHub CI成功。
2. production基点の限定releaseを別途レビューする。
3. 本番自動回収の有効化・実行は明示承認を得る。
4. 初期費用の自動回収が必要になった場合は、月額とは別の同意証跡と取消・返金方針を先に承認する。
