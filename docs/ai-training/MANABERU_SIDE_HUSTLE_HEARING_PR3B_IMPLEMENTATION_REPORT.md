# マナベル副業ヒアリング PR-3b 実装報告

状態: 実装・標準検証完了。PR-4、migration、本番反映、Pilot有効化は対象外。

作業ブランチ: `codex/manaberu-side-hustle-hearing-pr3b`
作業開始時の`origin/main`: `a1a8a30d495b2be80979611390f689f7164c5194`（PR #1381マージ済み）

## 1. 調査した内容

- PR-2の副業候補契約・安全検査・除外語・共通注意文、PR-3aの提供方針、同意・受講者認可、費用予約つきAIテキスト操作、動的学習イベントの本人データ出力/削除/保持処理を確認した。
- 指示書添付はPR #1381未マージの古いmain SHAを記載していた。PR #1381がマージされた現在の`origin/main`を基点に専用worktreeを作成し、共有チェックアウトの既存変更は保持した。
- Google側の連携・設定・データソースに変更はない。
- 受け入れ条件の一覧:
  - 本人データ出力: ヒアリング・提案・選択イベントをEnrollmentおよび本人で絞って出力。
  - 本人データ削除: ALL対象で既存のEnrollmentイベント削除範囲に含まれることをテストで確認。
  - 保持期限: 3イベントを学習者アクション/動的コンテンツ対象に追加。
  - migration: 追加なし。

## 2. 変更したファイル

### 実装

- `packages/capability-training/src/side-hustle-hearing.ts`
- `packages/capability-training/src/index.ts`
- `packages/capability-training/src/side-hustle-candidate.ts`
- `packages/database/src/side-hustle-hearing.ts`
- `packages/database/src/personal-learning-text-operation.ts`
- `packages/database/src/training-personal-data-export.ts`
- `packages/database/src/training-retention-snapshot.ts`
- `packages/database/src/index.ts`
- `packages/application/src/personal-learning-text-operation.ts`
- `apps/web/src/ai/openai-task-compatibility.ts`
- `apps/web/src/auth/line-return.ts`
- `apps/web/src/providers/openai-learning-lesson.ts`
- `apps/web/src/providers/openai-side-hustle-proposal.ts`
- `apps/web/src/providers/personal-learning-offer-policy.ts`
- `apps/web/src/services/side-hustle-proposal.ts`
- `apps/web/src/http/side-hustle.ts`
- `apps/web/app/api/services/[serviceSlug]/ai-training/enrollments/[programEnrollmentId]/side-hustle/route.ts`
- `apps/web/app/api/services/[serviceSlug]/ai-training/enrollments/[programEnrollmentId]/side-hustle/hearing/route.ts`
- `apps/web/app/api/services/[serviceSlug]/ai-training/enrollments/[programEnrollmentId]/side-hustle/proposal/route.ts`
- `apps/web/app/api/services/[serviceSlug]/ai-training/enrollments/[programEnrollmentId]/side-hustle/selection/route.ts`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/side-hustle/page.tsx`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/page.tsx`

### 新規テスト

- `packages/capability-training/test/side-hustle-hearing.test.ts`
- `packages/database/test/side-hustle-hearing.test.ts`
- `apps/web/test/openai-side-hustle-proposal.test.ts`
- `apps/web/test/side-hustle-http.test.ts`
- `apps/web/test/side-hustle-proposal-service.test.ts`

### 変更した既存テスト

- `packages/capability-training/test/side-hustle-candidate.test.ts`: 指示書指定の固定文変更に伴う期待値更新と、その固定文を検証するテスト。
- `packages/database/test/training-personal-data-export.test.ts`: 3イベントの出力範囲と内容を検証。
- `packages/database/test/training-personal-data-deletion.test.ts`: 3イベントが既存の本人削除スコープに含まれることを検証。
- `packages/database/test/training-retention-execution.test.ts`: 3イベント種別の保持期限対象を検証。
- `packages/application/test/personal-learning-text-operation.test.ts`: Enrollment限定の副業提案操作を検証。

### 共有文書

- `docs/DECISION_LOG.md`（追記のみ）
- `docs/ai-training/MANABERU_SIDE_HUSTLE_HEARING_PR3B_IMPLEMENTATION_REPORT.md`

## 3. 主要な設計判断

- ヒアリングを`SIDE_HUSTLE_HEARING_V1`として厳格に検証し、余分/不足キー、境界空白、空文字、列挙値・長さ・質問数の不正を拒否する。保存はEnrollment単位の`ProgramActionEvent`追記で版管理し、同じ冪等キーの不一致再送や古い版を競合として拒否する。
- 提案・選択は本人のEnrollmentスコープと`SIDE_HUSTLE_V1`提供方針を毎回確認する。AI提案は`SIDE_HUSTLE_PROPOSAL`として既存の費用予約・利用記録・Provider予約に載せ、同一ヒアリング版の再訪では保存済み結果を返す。JST日次5回のAdmission制限を設ける。
- PR-2の候補契約をStructured Output Schemaに反映。Provider入力には回答・不足条件・除外領域名と理由を含めるが、除外キーワード一覧は送らない。保存時にも最新ヒアリング版・Screening・成功利用記録を検証する。
- `EXCLUDED`候補の詳細は保存データに残しつつAPI表示から除外する。選択は確認チェック付きの明示操作のみ受け、`FIT`/`CAUTION`のみ確定可能。選択後は候補名と要約を表示し、PR-4の準備中案内に留める。
- 追加質問の回答も新しいヒアリングイベントとして保存する。ページ再読込時は保存済み回答数から未回答の追加質問を復元する。
- 3イベントを本人データ出力・削除・保持期限管理の対象に含めた。DBスキーマ・migrationは変更していない。

## 4. 実行した検証

Node.js環境: `v24.19.0`（リポジトリ要件`>=24 <25`を満たす同梱ランタイム）。

- `pnpm format:check`: 成功。
- `pnpm typecheck`: 成功（workspace 25 tasksおよびlearning UI型検査）。
- `pnpm lint`: 成功（architecture check、全package/Web ESLint、learning UI ESLint）。
- `pnpm test`: 成功（531 test files、3,748 tests pass、3 live tests skipped）。
- `pnpm build`: 成功（Next.js production build、全ルート生成まで完了）。
- `git diff --check`: 成功。
- 変更関連テスト: capability-training 37 files / 589 tests、database 4 files / 27 tests、web 3 files / 10 tests、application 1 file / 11 tests pass。これらは全体testに含まれる。

## 5. 未解決事項

- 付録文言との照合は実装で反映したが、レビューで再確認する。
- 本番設定、Pilot、LINE経路、PR-4の計画生成、migrationは未実施。

## 6. 次へ進める条件

- レビューでProvider費用/冪等性、JST上限、Enrollment境界、除外候補の非表示、選択確認、本人データ処理を確認する。
- PR-3bのマージ後、PR-4を別作業として開始する。
