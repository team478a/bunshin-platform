# マナベル副業定義カタログ PR-2 実装報告

状態: 実装済み・ローカル標準検証済み。運営確認、`ACTIVE`化、PRマージ、本番反映は未実施。

作業開始時の基準: `origin/main` `ca784e461418c7419e322d543623ae929fc537de`。既存の競合中・未追跡ファイルを含む作業ディレクトリには触れず、専用worktreeと`codex/manaberu-side-hustle-catalog-pr2`ブランチを作成した。PR #1376は基準mainへマージ済みだったため、追加のrebaseは行っていない。

## 1. 調査した内容

- `AGENTS.md`、実装仕様、アーキテクチャ原則、ロードマップ、Decision Log、並行作業ルール、PR #1376実装報告を確認した。
- 既存の版付きコード定義`learning-definition-fixtures.ts`とテストを確認し、コード上の定義を公開入口から提供する前例を確認した。
- `ApplicationError`は`@bunshin/shared`の公開入口にあり、`capability-training`には直接依存がなかったため、workspace依存を追加した。
- 本作業にDB、API、画面、LINE、Job、Cron、AI Provider、`SIDE_HUSTLE_V1`提供方針の変更は不要であることを確認した。

## 2. 変更したファイル

### capability-training

- `packages/capability-training/src/side-hustle-catalog.ts`: 型、列挙値、カタログ版、除外8件、全項目のfail-closed検証、保証表現拒否、凍結処理を追加。
- `packages/capability-training/src/side-hustle-catalog-data.ts`: 指示書付録Aの12件を全件`DRAFT`として追加し、モジュール読込み時に検証するよう実装。
- `packages/capability-training/src/side-hustle-screening.ts`: 条件検証、費用・時間・働き方・端末の決定的照合、全理由保持、未回答条件の返却を追加。
- `packages/capability-training/test/side-hustle-catalog.test.ts`: 指示書5-1の検証を追加。
- `packages/capability-training/test/side-hustle-screening.test.ts`: 指示書5-2の検証を追加。
- `packages/capability-training/package.json`: `ApplicationError`を公開入口から利用するため`@bunshin/shared` workspace依存を追加。
- `pnpm-lock.yaml`: workspace importerの依存関係を更新。

### 文書

- `docs/ai-training/MANABERU_SIDE_HUSTLE_CATALOG_REVIEW_SHEET.md`: 12件の全項目、共通要件、除外8件、確認欄を追加。
- `docs/ai-training/MANABERU_SIDE_HUSTLE_CATALOG_PR2_IMPLEMENTATION_REPORT.md`: 本報告を追加。

### 共有ファイルの変更

- `packages/capability-training/src/index.ts`: 新規3モジュールのexportだけを追加。
- `docs/DECISION_LOG.md`: 版付きカタログ、AIの説明責任境界、migrationを作らない理由を末尾へ追記。

## 3. 主要な設計判断

- 指示書の名称をそのまま採用し、カタログ版を`SIDE_HUSTLE_CATALOG_V1`、照合規則版を`SIDE_HUSTLE_SCREENING_V1`とした。
- 検証済みの値だけを新しいオブジェクトへ投影し、配列、定義、ネストした配列・オブジェクトを凍結する。カタログ本体はモジュール読込み時に検証し、不正データを保持しない。
- 条件照合時も渡されたカタログを同じ関数で検証する。テスト用カタログを含め、不正な定義を照合対象にしない。
- 未回答は各候補へ`_UNKNOWN`理由を残すが、verdictを悪化させない。EXCLUDEDとCAUTIONの理由は同時に保持し、verdictだけをEXCLUDED優先にする。
- 初期12件の文言・数値・要件は付録Aから追加・推測せず転記した。

## 4. 実行した検証

- `pnpm --filter @bunshin/capability-training typecheck`: 成功。
- `pnpm --filter @bunshin/capability-training lint`: 成功。
- `pnpm --filter @bunshin/capability-training test`: 成功（35ファイル、536テスト）。
- `pnpm format:check`: 成功。
- `pnpm typecheck`: 成功（25/25 tasks、learning UI typecheckを含む）。
- `pnpm lint`: 成功（25/25 tasks、architecture checkとlearning UI lintを含む）。
- `pnpm test`: 成功（25/25 tasks。Web 528ファイル・3,721テスト成功、3ファイル・3テストskip。database 212ファイル・1,060テスト成功。capability-training 35ファイル・536テスト成功）。
- `pnpm build`: 成功（13/13 tasks、Next.js production buildを含む）。
- `git diff --check`: 成功。

## 5. 未解決事項

- 付録Aの文言は変更していない。費用・時間の目安、リスク、要件、除外リストの妥当性は運営確認待ち。
- 全12件は`DRAFT`、`checkedAt: null`であり、推薦結果にはまだ含まれない。
- 実装・自動検証は本番反映を意味しない。DB、Program設定、本番環境は変更していない。

## 6. 次へ進める条件

- 田中が確認シートで12件と除外8件を確認し、修正点を確定する。
- PR-2のレビュー・CIが完了する。
- PR-2bで確認済み定義だけを`ACTIVE`へ変更し、実在するJST確認日を`checkedAt`へ設定する。
- PR-3の提供方針、ヒアリング保存、AIによる候補説明へはPR-2b完了後に進む。
