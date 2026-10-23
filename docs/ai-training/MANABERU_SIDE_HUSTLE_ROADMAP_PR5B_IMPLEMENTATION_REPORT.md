# 副業版の地図見直し PR-5b 実装報告

作成日: 2026-10-23

作業ブランチ: `codex/manaberu-side-hustle-roadmap-pr5b`

開始基点: `origin/main`（PR #1390 merge後）

## 1. 調査した内容

- PR-5aではサーバーが `REVISE` を記録できる一方、画面の選択肢は非表示だった。
- 既存の地図作成APIは選択済み候補について地図イベントを保存するが、改訂地図を本人が確定して希望・テーマへ反映する経路はなかった。
- 希望の保存はEnrollmentスコープの認可・revision検査を持つ既存Repositoryを使用する。改訂では希望本文とテーマのgoalSnapshotを同時に更新する必要がある。

## 2. 変更したファイル

- `packages/capability-training/src/side-hustle-roadmap.ts` — 改訂地図の月行、現在段階行、目安行を検証して再構成する純粋関数を追加。
- `packages/capability-training/test/side-hustle-roadmap.test.ts` — 全行置換、目安行の挿入、重複目安行の拒否を追加。
- `packages/database/src/side-hustle-hearing.ts` — 希望revisionとテーマの現行地図スナップショットを認可済みtransactionで保存する処理を追加。
- `packages/database/test/side-hustle-hearing.test.ts` — 確定再送の冪等性とスナップショット更新を検証。
- `apps/web/src/services/side-hustle-roadmap-revision.ts` — 現在の地図・段階・希望を検証し、確定処理へ接続。
- `apps/web/src/http/side-hustle.ts` — 同一オリジン・JSON限定の地図確定APIを追加。
- `apps/web/app/api/services/[serviceSlug]/ai-training/enrollments/[programEnrollmentId]/side-hustle/revision/route.ts` — 確定APIのrouteを追加。
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/side-hustle/client.tsx` — REVISE後の地図確認・確定画面と再送操作IDを追加。
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/side-hustle/checkin-controls.tsx` — 「地図を見直す」を再表示。
- `apps/web/test/side-hustle-progress-ui.test.tsx` — 選択肢表示を確認。
- `docs/DECISION_LOG.md` — PR-5bの本人確認・保存方針を記録。

## 3. 主要な設計判断

- 新しい地図を作っただけでは希望を更新せず、本人が「この地図で確定」を押した時だけ更新する。
- 目安行は0行なら現在段階行の直後へ追加、1行なら置換、2行以上なら `CONFLICT` とする。90日分の月行と現在段階行も一意であることを要求する。
- 希望の新revisionとテーマの地図スナップショットを一つのEnrollmentスコープ付きtransactionで保存する。transaction内で現段階イベントを再確認し、画面表示時から段階が変わっていたら競合にする。同じ操作IDの再送では希望revisionを重複作成しない。
- PR作成・マージ・デプロイ・本番DB接続・Pilot有効化は行わない。

## 4. 実行した検証

- `pnpm typecheck` — 成功（25 Turboタスクおよびlearning-ui型検査）。途中で新規DBテストfixtureの型不足を検出し、明示型を追加して再実行。
- `pnpm lint` — 成功。Web lintに今回の変更外の既存unused eslint-disable警告4件（エラーなし）。
- `pnpm format:check` — 成功。
- `pnpm build` — 成功（Next.js production build、38件の静的ページ生成）。
- `pnpm test` — 変更対象の副業テストを含むほぼ全テストが成功。並列実行時に既存の`daily-missions` 2件と`deployment-database-gate` 1件が5秒timeoutしたため、個別再実行しそれぞれ10/10件・27/27件成功を確認。Capability Trainingは39ファイル/616件成功、Databaseは217ファイル/1,217件成功、ただし前記manifest timeoutの初回実行分を含む。
- 対象テストを個別にも確認: `side-hustle-roadmap.test.ts` 21/21、`side-hustle-hearing.test.ts` 4/4、進捗UIとHTTP 6/6。
- `git diff --check` — 成功。migrationは不要。本番DB、AI Provider、デプロイは実行していない。

## 5. 未解決事項

- 実利用者での操作確認、本番反映、Pilot有効化は未実施。

## 6. 次へ進める条件

- 標準検証とPRレビューを完了する。マージとデプロイは別途明示的な判断を要する。
