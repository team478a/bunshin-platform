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

- `packages/capability-training/src/side-hustle-progress.ts` — 振り返り契約、2件/28日判定と理由別案内、段階・月の目安行の希望改訂
- `packages/capability-training/src/index.ts` — 新契約のexport
- `packages/application/src/personal-learning-persistence.ts` — 段階更新用の内部冪等キーを形式限定で許可
- `packages/database/src/side-hustle-hearing.ts` — 進捗読み出し、DB件数集計、希望revision競合を含む振り返り・段階更新
- `packages/database/src/personal-learning-persistence.ts` — raw SQLで発生するPostgreSQL serialization failure（SQLSTATE 40001）を`CONFLICT`へ正規化
- `packages/database/src/training-personal-data-export.ts` — 振り返り・段階イベントを本人データ出力対象に追加
- `packages/database/src/training-retention-snapshot.ts` — 同イベントを保持期限対象に追加
- `apps/web/src/http/side-hustle.ts` — 進捗GET・振り返りPOSTと理由別応答
- `apps/web/app/api/services/[serviceSlug]/ai-training/enrollments/[programEnrollmentId]/side-hustle/progress/route.ts`
- `apps/web/app/api/services/[serviceSlug]/ai-training/enrollments/[programEnrollmentId]/side-hustle/checkin/route.ts`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/side-hustle/client.tsx` — 振り返りフォーム、進行確認、再送操作ID
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/side-hustle/checkin-controls.tsx` — ADVANCE選択・送信の無効化と画面選択肢の管理
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/page.tsx` — 地図カードを進捗読出しに接続

### テスト

- 新規 `packages/capability-training/test/side-hustle-progress.test.ts`
- 変更 `packages/database/test/personal-learning-d.integration-cases.ts` — 実DBでの開始・進捗と、除外される証拠、3か月目完了、一時停止・別Enrollmentの拒否、希望追記との競合を検証
- 新規 `apps/web/test/side-hustle-progress-ui.test.tsx` — `canAdvance=false` の無効化とPR-5b選択肢の非表示
- 変更 `packages/database/test/training-personal-data-export.test.ts` — 振り返り・段階イベントを出力対象として確認
- 変更 `packages/database/test/training-retention-execution.test.ts` — 振り返り・段階イベントを保持期限対象として確認
- 変更 `apps/web/test/side-hustle-http.test.ts` — 振り返りAPIの同一オリジン・JSON限定を確認

### 共有ファイル

- `docs/DECISION_LOG.md` — 末尾にPR-5aの段階管理方針を追記

## 3. 主要な設計判断

- 進捗の正本は段階イベントとし、`goalSnapshot.currentPeriod/currentPeriodStartedAt` は表示用コピーとして更新する。初期状態は `MONTH_1`。
- 実践数はDB COUNT相当のSQL集計で算出し、全回答のメモリ読み込みをしない。1課題の複数提出は最新revisionのみを評価する。
- 振り返り保存と段階の希望revision・段階イベント・goalSnapshot更新を同一transactionにする。段階遷移イベントのキーはtopic/from/toに基づき、別operation IDでも二重更新しない。
- 段階更新時に `originalText` の月の目安行を置き換えるか現段階行の直後へ追加し、次の実践による希望追記後も残す。`currentPosition` は既存の次実践用の値として更新する。希望revisionの事前確認後に競合が起きた場合は、PostgreSQLの40001を含め`CONFLICT`にし、後続更新に再読込・再試行させる。
- 3か月目の進行は希望revisionを増やさず `COMPLETED` を記録し、テーマをACTIVEのまま維持する。
- AI Provider、migration、LINE通知、PR-5bの地図見直し、本番設定・デプロイは変更しない。

## 4. 実行した検証

- Node 24.19.0で実行。
- `pnpm format:check` — 成功。
- `pnpm typecheck` — 成功（25 Turboタスクおよびlearning-ui型検査）。初回検査で画面の進捗状態のnull許容漏れを検出し、修正後に再実行。
- `pnpm lint` — 成功。初回検査で追加コードの不要な型アサーションを検出し削除、修正後に全体を再実行。
- Web lintには既存ファイルの未使用eslint-disable警告が4件ある（エラーなし、今回の変更外）。
- `pnpm test` — 全体再実行で成功（25 Turboタスク）。アーキテクチャ境界10件、Capability Training 614件、Application 1,026件、Database unit 1,147件、Web 3,755件など。外部依存が必要なliveテスト3件はskip。初回全体実行では`daily-missions.test.ts`の2件がタイムアウトしたが、同ファイル単独で10/10成功し、全体再実行でも再現しなかった。
- `pnpm build` — 成功（Next.js 16.3.3 production build、静的ページ38件を生成）。
- `git diff --check` — 成功。
- `@bunshin/database test:integration` — 専用の破棄可能PostgreSQLコンテナと識別コメント付き空DBで実行し、256/256件成功。追加したmockなしケースで実データの進捗集計、チェックイン、段階遷移、希望revision更新、別operation ID再送時の二重遷移防止を確認。初回の全実行で内部冪等キー形式、続く対象ケースで集計テストのscope列を検出・修正し、最後にDBを作り直して全件再実行。
- `@bunshin/capability-training` — 39 test files / 614 tests passed。
- `apps/web/test/side-hustle-progress-ui.test.tsx` — 1 test passed。`apps/web/test/side-hustle-http.test.ts` — 5 tests passed。
- migrationは追加していない。実データDB、本番、Pilot、外部AI Providerには接続・呼び出ししていない。

## 5. 未解決事項

- PR-5a指示書§5-1に記載された未解決の境界テストを追加した。実DB結合テストで`SELF_REPORT_ONLY`・確認待ち・前段階の回答の除外、3か月目の`COMPLETED`、希望の版を増やさないこと、テーマがACTIVEのままであること、一時停止・別Enrollment拒否、希望追記と段階更新の競合（片方が`CONFLICT`となり、再試行後に両方の本文を保持）を確認する。
- 契約テストでnoteの境界空白・保証表現・除外語、段階行の欠落／重複、目安行の重複、残り項目を省いた際の`currentPosition` 500文字上限を確認する。画面テストで`canAdvance=false`時のADVANCE無効化とPR-5b選択肢の非表示を確認する。
- PR-5bの地図見直し実装は意図どおり本PRの範囲外であり、画面から選べない。サーバーは既存の`REVISE`記録を受け付ける。
- 本番反映、Pilot有効化、実利用者での評価は未実施。

## 6. 次へ進める条件

- PR-5a実装、標準検証、主経路と境界条件の隔離DB統合検証を完了し、PRレビューへ進める。
- 本PRのマージを本番反映・Pilot開始とみなさない。PR-5bの地図見直しは別作業とする。
