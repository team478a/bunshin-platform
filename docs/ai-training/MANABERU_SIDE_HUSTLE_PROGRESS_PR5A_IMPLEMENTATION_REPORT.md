# 副業版進捗・振り返り PR-5a 実装報告

作成日: 2026-10-22  
作業ブランチ: `codex/manaberu-side-hustle-progress-pr5a`  
開始時の`origin/main`: `36e06e9840aab46b8e83f8917b9df5129027f550`（PR #1386 merge）

## 1. 調査した内容

- テーマと実践の実際の結合は `PersonalLearningTopic` → `PersonalLearningPlanRevision.topicId` → `ProgramMissionAssignment.targetResourceId` / `displaySnapshot.dynamicPractice.topicId, planRevision` → `TrainingMissionAnswer.missionAssignmentId`。回答の評価は `evaluation.review.state` に保存される。
- 件数集計はこの結合をSQLで行う。テーマ・Enrollment・利用者のスコープを限定し、課題ごとに回答提出revisionが最大の最新回答のみを対象にする。最新回答が `READY` かつ `CURRENT_STEP_EVIDENCE` で、段階開始後に作成されたものだけを計上する。
- 段階更新と「結果に応じた次の実践」の希望改訂はいずれもEnrollmentロック下のSerializable transactionと希望のexpectedRevisionを利用する。競合時は一方が直列化競合またはrevision不一致となり、上書きせず `CONFLICT` になる。
- PR #1386は作業開始時点で `origin/main` の `36e06e98` に含まれることを確認した。

## 2. 変更したファイル

### 実装

- `packages/capability-training/src/side-hustle-progress.ts` — 振り返り契約、2件/28日判定、段階希望改訂の生成
- `packages/capability-training/src/index.ts` — 新契約のexport
- `packages/application/src/personal-learning-persistence.ts` — 段階更新用の内部冪等キーを形式限定で許可
- `packages/database/src/side-hustle-hearing.ts` — 進捗読み出し、DB件数集計、振り返り・段階更新を追加
- `packages/database/src/training-personal-data-export.ts` — 振り返り・段階イベントを本人データ出力対象に追加
- `packages/database/src/training-retention-snapshot.ts` — 同イベントを保持期限対象に追加
- `apps/web/src/http/side-hustle.ts` — 進捗GET・振り返りPOSTと理由別応答
- `apps/web/app/api/services/[serviceSlug]/ai-training/enrollments/[programEnrollmentId]/side-hustle/progress/route.ts`
- `apps/web/app/api/services/[serviceSlug]/ai-training/enrollments/[programEnrollmentId]/side-hustle/checkin/route.ts`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/side-hustle/client.tsx` — 振り返りフォーム、進行確認、再送操作ID
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/page.tsx` — 地図カードを進捗読出しに接続

### テスト

- 新規 `packages/capability-training/test/side-hustle-progress.test.ts`
- 変更 `packages/database/test/personal-learning-d.integration-cases.ts` — 実DBでの開始、2件のtopic連結済み確認回答、段階更新、希望改訂、別operation IDの重複抑止を追加
- 変更 `packages/database/test/training-personal-data-export.test.ts` — 振り返り・段階イベントを出力対象として確認
- 変更 `packages/database/test/training-retention-execution.test.ts` — 振り返り・段階イベントを保持期限対象として確認
- 変更 `apps/web/test/side-hustle-http.test.ts` — 振り返りAPIの同一オリジン・JSON限定を確認

### 共有ファイル

- `docs/DECISION_LOG.md` — 末尾にPR-5aの段階管理方針を追記

## 3. 主要な設計判断

- 進捗の正本は段階イベントとし、`goalSnapshot.currentPeriod/currentPeriodStartedAt` は表示用コピーとして更新する。初期状態は `MONTH_1`。
- 実践数はDB COUNT相当のSQL集計で算出し、全回答のメモリ読み込みをしない。1課題の複数提出は最新revisionのみを評価する。
- 振り返り保存と段階の希望revision・段階イベント・goalSnapshot更新を同一transactionにする。段階遷移イベントのキーはtopic/from/toに基づき、別operation IDでも二重更新しない。
- 3か月目の進行は希望revisionを増やさず `COMPLETED` を記録し、テーマをACTIVEのまま維持する。
- AI Provider、migration、LINE通知、PR-5bの地図見直し、本番設定・デプロイは変更しない。

## 4. 実行した検証

- Node 24.19.0で実行。
- `pnpm format:check` — 成功。
- `pnpm typecheck` — 成功（25 Turboタスクおよびlearning-ui型検査）。初回検査で画面の進捗状態のnull許容漏れを検出し、修正後に再実行。
- `pnpm lint` — 成功。初回検査で追加コードの不要な型アサーションを検出し削除、修正後に全体を再実行。
- Web lintには既存ファイルの未使用eslint-disable警告が4件ある（エラーなし、今回の変更外）。
- `pnpm test` — 成功（25 Turboタスク）。アーキテクチャ境界10件、Capability Training 613件、Application 1,026件、Database unit 1,147件、Web 3,754件など。外部依存が必要なliveテスト3件はskip。
- `pnpm build` — 成功（Next.js 16.3.3 production build、静的ページ38件を生成）。
- `git diff --check` — 成功。
- `@bunshin/database test:integration` — 専用の破棄可能PostgreSQLコンテナと識別コメント付き空DBで実行し、256/256件成功。追加したmockなしケースで実データの進捗集計、チェックイン、段階遷移、希望revision更新、別operation ID再送時の二重遷移防止を確認。初回の全実行で内部冪等キー形式、続く対象ケースで集計テストのscope列を検出・修正し、最後にDBを作り直して全件再実行。
- `@bunshin/capability-training` — 39 test files / 613 tests passed。
- `apps/web/test/side-hustle-http.test.ts` — 5 tests passed。
- migrationは追加していない。実データDB、本番、Pilot、外部AI Providerには接続・呼び出ししていない。

## 5. 未解決事項

- §5-1のDB境界テスト全件は未追加。具体的には、`SELF_REPORT_ONLY`・確認待ち・前段階の回答の件数除外、3か月目の`COMPLETED`、一時停止・他Enrollment拒否、希望更新との同時実行競合を個別に検証するケースが残る。実装本体は分岐を持つが、PRレビュー前にこれらの回帰テストを補う必要がある。
- 振り返り契約の境界空白・保証表現、同段階行の重複、残り項目を省いた時の500文字上限、および地図カードの`canAdvance=false`表示の個別テストも残る。
- PR-5bの地図見直し機能は意図どおり本PRの範囲外。
- 本番反映、Pilot有効化、実利用者での評価は未実施。

## 6. 次へ進める条件

- PR-5a実装と標準検証・主経路の隔離DB統合検証は完了。上記の§5-1境界テストを補完してからPRレビューに進む。
- 本PRのマージを本番反映・Pilot開始とみなさない。PR-5bの地図見直しは別作業とする。
