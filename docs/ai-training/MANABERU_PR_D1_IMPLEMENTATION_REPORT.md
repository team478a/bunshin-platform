# マナベル PR-D-1 実装報告：保存基盤

状態: Draft。D-1の実装・CI確認後に田中のレビューを待つ。マージ、本番migration適用、production反映、feature flag変更は未実施。

## 1. 調査した内容

- 最新版として指定された本線化指示書v4と決定記録のみを基準にした。v1〜v3は参照していない。
- 既存の動的研修は受講・利用記録を保持し、保持期限判定では学習操作がない場合に受講開始日へフォールバックする。
- `multiTopic`の既定値はOFF。D-1でも既定値・本番設定を変更しない。

## 2. 変更したファイル

- `packages/database/prisma/schema.prisma`、`packages/database/prisma/migrations/20261017100000_personal_learning_topics_persona_examples/migration.sql`: テーマ、本人像、保存活用例の保存テーブルとtenant複合FK/RLSを追加。既存希望から作る初期テーマの`last_learner_use_at`はNULLとし、受講開始日を保持判定に使えるようにした。
- `packages/database/src/personal-learning-d.ts`: 所有範囲を限定した保存Repositoryを追加。新テーブルへの読み書き前に、本人の有効Membership、動的AI研修の有効Enrollment、Programの`multiTopic` flag ONを確認する。本人像のAI投入用取得は最大20件に制限する。
- `packages/database/src/schema-readiness.ts`、`packages/database/src/index.ts`: migration readinessとRepository exportを更新。
- `packages/database/test/personal-learning-d.integration-cases.ts`、`packages/database/test/database.integration.test.ts`: PostgreSQL統合テストを追加・登録。別ユーザー、別Service/Workspaceからの閲覧・変更拒否、flag OFF時のアクセス拒否、REJECTED保持、AI投入取得20件上限を確認する。
- `packages/database/test/personal-learning-d-topic-boundary.test.ts`: additive migration、NULL利用日、tenant境界、Bunshin Memoryからの分離を検査。
- `packages/capability-training/src/personal-learning-topics.ts`、`packages/capability-training/test/personal-learning-topics.test.ts`: multiTopic OFF時1件、明示ON時最大3件のdomain policyを維持・検査。
- `docs/IMPLEMENTATION_ROADMAP.md`: v4と決定記録を正本として明記。
- **D-3へ移したもの:** `lesson-candidate`/`conversation`から本人像を取得してAIへ渡すProvider/Service接続とそのテストは、このPRから除外した。D-1はProviderを呼ばない。

## 3. 主要な設計判断

- `REJECTED`項目に対して同じ属性の新しいAI推測が保存されても、値・根拠・状態を更新せず`REJECTED`を返す。競合時も条件付き更新で拒否状態を保護する。
- 初期テーマの最終利用日はNULLとする。動的保持判定の既存ロジックが利用記録なしの場合にEnrollmentの`startsAt`を使う。過去の希望作成日時を最終利用日と誤認しない。
- 本人像AI投入取得はD-3のための保存層メソッドのみを準備し、上限20件、REJECTED除外、確度ラベルを設定する。AI Provider呼出し・lesson候補・conversation接続は含めない。
- D系テーブルは単にWorkspace/Service/User IDが一致するだけでは読み書きしない。既存の所有Membershipと有効な動的Program/Enrollmentを確認し、該当する`multiTopic`がONの場合だけ新テーブルへ進む。`multiTopic` OFFや旧固定研修はD系データへフォールバックしない。
- DB複合外部キーに加え、Repositoryの全read/write条件にWorkspace・Service(Group)・Membership・Userを含める。本人像/活用例はEnrollmentではなく本人のService内スコープに隔離し、Bunshin ID/Memory relationは持たせない。

## 4. 実行した検証

| 検証                                      | 結果                        |
| ----------------------------------------- | --------------------------- |
| `@bunshin/database db:validate`           | 成功                        |
| `@bunshin/database` TypeScript typecheck  | 成功                        |
| D-1 migration/tenant boundary unit tests  | 4件成功                     |
| `@bunshin/capability-training` unit tests | 30 files / 474 tests成功    |
| `@bunshin/database` unit tests            | 208 files / 1,024 tests成功 |
| D-1対象ファイルのESLint                   | 成功                        |
| CI `verify`                               | 成功（run 39016845076: format / typecheck / lint / unit tests / learning UI / build） |
| CI `database`（PostgreSQL統合テスト含む） | 成功（run 39016845076: db:validate / ephemeral PostgreSQL migration・readiness / integration tests） |

## 5. 本番反映順序・未解決事項

- 本番適用が別途承認された場合の順序は **migration適用 → その後にプログラムを反映**。プログラムを先に反映すると未作成テーブルを参照する可能性がある。現時点では本番migration・deploy・flag変更のいずれも行っていない。
- このPRはD-1の保存基盤のみ。D-2（テーマ別目標・計画・会話）、D-3（本人像の確認画面とAI投入接続）、D-4（活用例UI・書き出し・保存期間処理）は別々のDraft PRと実装報告にする。
- D-3は画面・本人同意後に限ってAI接続し、このPRの上限20件取得を利用する。
- GitHub Actions run `39016845076` は、D-1差分（commit `d46f0946`）に対して `verify` と `database` の両方が成功した。databaseジョブのmigrationはCI専用の使い捨てPostgreSQLに対する検証であり、本番DBには適用していない。

## 6. 次へ進める条件

- D-1のDraft差分、DB統合テスト、CI `verify`/`database`成功を確認済み。田中のレビューを待つ。
- 田中の確認前にマージしない。production migration・deploy・flag変更は、別途明示承認があるまで実施しない。
