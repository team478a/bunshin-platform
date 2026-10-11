# OEM請求 返金要照合・運用通知統合 実装報告

## 1. 調査した内容

- 返金要照合は全体請求画面、団体別請求画面、経理用CSVで確認できるが、Platform管理者が日常利用する運用通知には表示されなかった。
- 既存Alert CenterはApplicationで表示判断、Database Adapterで集計、Webで導線表示を分離している。
- 返金通知には解消状態がないため、既存通知を安全・完了と推測して非表示にすることはできない。

## 2. 変更したファイル

- `packages/application/src/admin-alert-center.ts`
- `packages/database/src/admin-alerts.ts`
- `apps/web/app/(app)/admin/alerts/page.tsx`
- 関連テスト
- `docs/DECISION_LOG.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/OEM_INVOICE_REFUND_REVIEW_ALERT_IMPLEMENTATION.md`

## 3. 主要な設計判断

- 処理済みの`PARTIAL_REFUND_REVIEW_REQUIRED`または`FULL_REFUND_REVIEW_REQUIRED`が紐づく入金済み請求だけを対象とする。
- 複数の返金通知がある請求は`invoiceId`で重複排除し、対象請求件数をWARNINGとして表示する。
- 通知から`/admin/commercial-billing?status=REFUND_REVIEW`へ直接遷移し、既存の調査画面・団体別導線・CSVを再利用する。
- 通知文で内部請求状態が自動変更されていないことを明示する。
- 外部通知、返金実行、請求状態変更、通知解消は追加しない。

## 4. 実行した検証

- 対象Application tests: PASS（1 file / 9 tests）
- 対象Database tests: PASS（1 file / 1 test）
- 対象Web tests: PASS（1 file / 1 test）
- Application全体tests: PASS（136 files / 913 tests）
- Database全体tests: PASS（197 files / 961 tests）
- Web全体tests: PASS（472 files / 3321 tests、2 files / 2 tests skipped）
- Application / Database / Web typecheck: PASS
- Application / Database / Web lint: PASS
- スマートフォン幅の合成E2E: PASS（3 files / 13 tests）
- Architecture boundary tests: PASS（10 tests）
- Prettier / `git diff --check`: PASS
- Web production build: PASS（Next.js、static pages 35/35）

## 5. 未解決事項

- 返金要照合の解消状態と解消証跡は未設計であり、通知は自動消去しない。
- 返金の会計確定日、売上認識、部分返金後残高、取消文書、返金済み請求状態は未決定。
- 外部メール／LINE通知、本番Webhook購読、実返金、既存返金データの照合は未実施。

## 6. 次Phaseへ進める条件

1. PRレビューとGitHub CI成功。
2. production基点の限定releaseを別途レビューする。
3. 本番Webhook購読変更と実返金はそれぞれ明示承認を得る。
4. 請求状態変更や要照合解消を実装する前に、部分／全額返金の会計・取消方針を承認する。
