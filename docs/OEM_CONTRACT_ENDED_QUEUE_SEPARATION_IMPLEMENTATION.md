# OEM契約終了後 月次キュー分離 実装報告

## 1. 調査した内容

- 正式登録課金V2の月次一括処理は、対象月に有効なOrganizationに加えて、対象月以前に開始した`OemBillingPolicy`を持つWorkspaceを処理対象へ加える。
- 契約終了後も課金ポリシーは監査証跡として残るため、終了済みWorkspaceが毎月`REVIEW_REQUIRED`へ再投入されていた。
- `OemContractPeriod`が契約期間の正本であり、Entitlementの現在状態や請求ポリシーの存在から契約継続を推測してはいけない。

## 2. 変更したファイル

- `packages/database/src/commercial-usage.ts`
- `packages/database/test/commercial-usage.test.ts`
- `apps/web/src/http/commercial-usage-finalization.ts`
- `docs/DECISION_LOG.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- 本報告

## 3. 主要な設計判断

- 対象月より前に開始した確認済み契約期間が1件以上あり、その全件が対象月開始以前に明示終了している場合だけ、`CONTRACT_ENDED_BEFORE_PERIOD`として通常の要確認キューから分離する。
- `historyReadyAt`がない、課金ルール版が違う、契約履歴がない、将来開始・終了未設定の期間がある場合は分離しない。従来どおりfail-closedで月次確定または`REVIEW_REQUIRED`へ進める。
- 分離結果にはWorkspace、対象月、固定理由、最後の契約終了日時を返し、cronログへ件数を残す。
- 契約対象外月の`TenantMonthlyUsage`、0円請求書、請求書下書き、契約履歴の補完は作成しない。
- 単一Workspaceの明示的な確定入口は変更しない。今回の自動分離は月次一括キューだけに限定する。

## 4. 実行した検証

- 対象Database unit test: PASS（1 file / 9 tests）
- Database unit tests: PASS（197 files / 966 tests）
- Database / Web typecheck: PASS（Node 24 / pnpm 10）
- 変更TypeScriptファイルlint: PASS
- Architecture boundary check: PASS
- Web production build: PASS（Next.js、static pages 35/35）
- 変更ファイルPrettier / `git diff --check`: PASS

## 5. 未解決事項

- 誤登録した契約期間、初期cutover、Offering、正式登録履歴を訂正する管理フローは未実装。
- 契約終了後にも利用イベントが記録された場合の運用アラートは未実装。請求対象外の判定と利用停止の監視を混同しない。
- 本番Migration、Deploy、契約期間登録、月次確定、請求書発行、実課金は実施しない。

## 6. 次Phaseへ進める条件

1. PRレビューとGitHub CI成功。
2. 非本番で、明示終了済み・履歴欠落・有効契約の3ケースを月次一括入口から確認する。
3. 本番反映と各本番操作は個別の明示承認を得る。
