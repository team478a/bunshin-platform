# 副業版の地図見直し PR-5c 実装報告

作成日: 2026-10-23

作業ブランチ: `codex/manaberu-side-hustle-roadmap-revision-pr5c`

基準: `origin/main` `fc49853819d211564706917beb6ab3ab26da59b4`（PR #1394 / PR-5bマージ後）

## 1. 調査した内容

- PR-5bはPR #1394としてマージ済み。本番またはPilotで利用されたことを示す証跡は、リポジトリ内のPR-5b報告・関連記録から確認できなかった。外部の本番/Pilot環境や運用記録は調査しておらず、「未使用」とは断定しない。したがってPR-5b形式の記録を変換する処理は追加していない。
- `readState` の地図参照先を調査した。呼出元は、副業画面の状態/API、候補提案・初期地図・見直しサービス、学習リクエスト画面である。開始前の選択・提案状態は従来どおりで、開始後はテーマ `goalSnapshot.roadmapEventId` が指す確定地図を返す。学習リクエスト画面は主に開始状態と選択候補を利用し、表示地図を別途参照しない。見直し提案は確定までこれらの現行状態に出さない。
- PR-5bの確定処理は全月行と `sourceRequestId` を更新していた。PR-5cでは、完了月を維持し、段階の目安行を置換・挿入する方式へ変更した。

## 2. 変更したファイル

### 実装・文書

- `packages/capability-training/src/side-hustle-roadmap.ts` — 見直し対象期間以降だけを希望本文へ反映し、完了月を保持する契約検証を追加。
- `apps/web/src/providers/personal-learning-offer-policy.ts` — `SIDE_HUSTLE_ROADMAP_REVISION` 用の方針・Prompt Versionを追加。
- `apps/web/src/providers/openai-side-hustle-roadmap.ts` — 見直し用入力を構成。振り返り内容を含め、実践回答本文・会話・除外語一覧を除外。
- `packages/application/src/personal-learning-text-operation.ts`、`packages/database/src/personal-learning-text-operation.ts` — 見直し操作を追加し、開始前地図づくりと合算した日次5回上限にする。
- `packages/database/src/side-hustle-hearing.ts` — 提案イベント保存・再読込、確定地図のみの読取、完了月の二重検査、同一提案の確定冪等性を実装。
- `apps/web/src/services/side-hustle-roadmap-revision.ts`、`apps/web/src/http/side-hustle.ts`、`apps/web/app/api/services/[serviceSlug]/ai-training/enrollments/[programEnrollmentId]/side-hustle/roadmap-revision/route.ts` — 見直し提案・確定APIを接続し、指示書のエラー表示へ分類。
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/side-hustle/client.tsx` — 現行/提案地図の比較、完了月表示、確定・同一ID再試行・新規IDでの作り直し・取り消しを追加。
- `packages/database/src/training-personal-data-export.ts`、`packages/database/src/training-retention-snapshot.ts` — 提案・確定イベントを本人データ出力、削除、保持期限の対象に追加。
- `docs/DECISION_LOG.md` — PR-5cの設計判断を記録。
- 本報告書。

### 変更した既存テスト

- `packages/capability-training/test/side-hustle-roadmap.test.ts` — 旧PR-5b契約の「全月置換」期待を、新要件の「完了月保持・見直し対象以降の置換」へ変更し、1文字差分拒否を追加。
- `packages/database/test/side-hustle-hearing.test.ts` — repository API変更に合わせてfixture/mockを更新し、既存の期待内容を維持。
- `packages/database/test/personal-learning-d.integration-cases.ts` — mockなしDB結合フローを追加。開始後に実践2件をDBへ記録し、MONTH_2へ進行、REVISE振り返り、提案保存、確定、再送を検証。
- `apps/web/test/openai-side-hustle-roadmap.test.ts` — 見直し用Provider入力を検証。
- `packages/database/test/training-personal-data-export.test.ts`、`packages/database/test/training-retention-execution.test.ts` — 新イベントをfixture/保持検査へ追加。

### 新規テスト

- `apps/web/test/side-hustle-roadmap-revision-service.test.ts` — 同一操作IDの保存済み提案再送が進捗読込・Provider呼出しを行わないことを検証。
- `packages/database/test/side-hustle-roadmap-admission.test.ts` — 地図作成と見直しの合算上限を検証。

## 3. 主要な設計判断

- 提案と確定を分離し、提案を保存した段階ではテーマ・現行地図・希望を変えない。確定はEnrollmentスコープのtransactionで希望revision、確定イベント、`goalSnapshot`を更新する。
- `fromPeriod` より前のマイルストーンを構造一致で検証し、提案保存時と確定時の両方で再確認する。確定時は元の希望本文から完了月を維持し、対象月以降・現在段階・目安行だけを更新する。
- `sourceRequestId`、現在段階、段階開始時刻は維持する。地図履歴には直前の確定地図イベントIDを記録する。
- 開始後の `readState` / `readProgress` はスナップショットが指す確定地図を読む。提案イベントを開始前の地図提案として誤表示しない。
- DB schema変更・migration・外部AI実呼出し・本番DB操作・Pilot有効化・デプロイは行わない。

## 4. 実行した検証

- `pnpm format:check` — 成功（最終実行）。
- `pnpm typecheck` — 成功（25 Turboタスクとlearning-ui型検査）。
- `pnpm lint` — 成功。既存のunused eslint-disable警告がWeb lintに4件あり、エラーなし。
- `pnpm build` — 成功。Next.js production build、TypeScript、静的ページ38件の生成を確認。
- `pnpm test` — 全workspaceで実行。architecture 10件成功、application 145ファイル/1,026件、capability-training 39ファイル/618件、social 29ファイル/305件を含むsuiteが成功。Databaseで既存の `deployment-database-gate.test.ts` と `apply-release-20261020.test.ts` の各1件が5秒timeoutとなったため、両ファイルを個別に再実行し **39/39件成功** を確認した。したがって全workspace一括実行はtimeoutのため終了コード非0、個別再実行で対象テストの成否を補足した。
- DB integration: fresh run `5c23a0b17fd2` の使い捨てPostgreSQL16を使用。263 migrationをこの新規DBだけに適用し、database name/comment markerのpreflight後に `pnpm --filter @bunshin/database test:integration` を実行。全267件中262件成功、5件失敗。1件は見直しテストfixtureの `typicalFlow` 件数不足で、3件は既存Personal Learning/retentionの5秒timeout、もう1件も既存expiryケースの5秒timeoutだった。fixtureを3件の有効なflowへ修正後、見直しのmockなしDB結合ケースを `vitest run test/database.integration.test.ts -t 'proposes and confirms a revision without changing completed months'` で再実行し **1件成功** を確認。別に再実行した既存境界4ケースではexpiryは成功したが、internal owner、PR-4開始、personal-data exportの3ケースは5秒timeoutを再現した。全integration suiteの成功とは扱わない。
- `git diff --check` — 成功。
- `pnpm test` / integration中の5秒timeoutは期待値変更・skip・timeout延長で隠していない。実AI Provider・本番DB接続は行っていない。integration DB・Auth・gateway containerおよび専用networkは検証後に停止・削除済み。

## 5. 未解決事項

- 本番またはPilotでPR-5b形式の記録が実際に使われたかは外部証跡未取得のため未確定。利用済みだった場合の移行は本PRの範囲外。
- 一括integration suiteは、報告した既存3ケースの5秒timeoutにより全件成功ではない。これらのtimeoutはテストまたは環境側で別途調査が必要。
- 実利用者の画面確認、本番反映、Pilot有効化は未実施。

## 6. 次へ進める条件

- DB結合テストを含む標準検証とコードレビューを完了する。
- PR-5b記録の利用有無を運用責任者が確認し、利用済みなら別途データ移行方針を決める。
- 本番反映・Pilot有効化・デプロイは別途承認を得る。本作業では実施しない。
