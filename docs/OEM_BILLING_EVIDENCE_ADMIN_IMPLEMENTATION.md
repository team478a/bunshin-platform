# OEM課金人数 根拠表示 実装報告

## 1. 調査した内容

- OEM Billing指示書は、管理画面で有料正式登録数、無料実利用数、重複数、最終課金人数、対象月、課金方式、請求額、要確認理由を一致して確認できることを求めている。
- 現行の正式登録課金V2は、現在月のshadow計算と確定月の`TenantMonthlyUsage`スナップショットへR、A、重複、R∪Aを保持している。
- 団体別管理画面はMAUと料金を中心に表示し、R/A内訳や安全な要確認理由を表示していなかった。また一部の説明が旧MAU方式だけを前提としていた。

## 2. 変更したファイル

- `packages/database/src/commercial-usage.ts`
- `apps/web/app/(app)/admin/organizations/[workspaceId]/commercial/commercial-admin-dashboard.tsx`
- `apps/web/app/(app)/admin/organizations/[workspaceId]/commercial/commercial-contract-section.tsx`
- `apps/web/app/(app)/organizations/[workspaceId]/usage/page.tsx`
- 関連テスト
- `docs/DECISION_LOG.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/OEM_BILLING_EVIDENCE_ADMIN_IMPLEMENTATION.md`

## 3. 主要な設計判断

- 現在月は既存`oemBillingShadow`の結果を表示用projectionへ渡し、新しい計算器を作らない。
- 確定月は保存済み`TenantMonthlyUsage`の人数スナップショットを表示し、現在の履歴から再計算しない。
- 旧MAU方式の月はR/A/重複を`null`のまま表示し、MAUから内訳を推測しない。
- `REVIEW_REQUIRED`では人数と料金を未確定に保ち、既知の内部理由を安全な運用文へ変換する。未知理由も要確認として表示する。
- schema、課金人数計算、料金表、月次確定、請求書、cutoverは変更しない。

## 4. 実行した検証

- 対象Database tests: PASS（1 file / 6 tests）
- 対象Web tests: PASS（1 file / 2 tests）
- Database全体tests: PASS（197 files / 963 tests）
- Web全体tests: PASS（473 files / 3323 tests、2 files / 2 tests skipped）
- Database / Web typecheck: PASS
- Database全体lint、変更Webファイルlint: PASS
- Web全体lint: PASS
- Architecture boundary check / tests: PASS（10 tests）
- スマートフォン幅の合成E2E: PASS（3 files / 13 tests）
- Web production build: PASS（Next.js、static pages 35/35）
- 変更ファイルPrettier / `git diff --check`: PASS

## 5. 未解決事項

- 本番の初期履歴、cutover、Migration適用、実請求の整合は未確認。
- 履歴修正、誤cutover修正、契約終了後のqueue除外は今回の表示機能に含めない。
- 現在月は確定値ではなくshadowであり、画面上でも月次確定や請求発行の代替にしない。
- 元指示書は本文と表を確認したが、この環境に文書レンダリング用LibreOfficeがなく画像によるレイアウト確認は実施できなかった。元文書は変更していない。

## 6. 次Phaseへ進める条件

1. PRレビューとGitHub CI成功。
2. 実認証を含む非本番スマートフォン表示で、現在月・旧月・要確認の3状態を確認する。
3. production基点の限定releaseを別途レビューする。
4. 本番Migration、cutover、料金公開、請求確定、実課金はそれぞれ明示承認を得る。
