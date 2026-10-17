# マナベル PR-D 実装報告

状態: Draft・実装途中の基盤差分。PR-Dの全受入条件は未達のため、マージ不可。マージ・本番反映・本番migration適用・multiTopic有効化は行っていない。

## 1. 調査した内容

- 指定された本線化指示書v4、決定記録の決定6、AI進化方針書を仕様根拠とした。v1〜v3は参照していない。
- 既存の`PersonalLearningRequest`はEnrollment単位でrevisionを保持し、Goal/Plan・会話・実践経路もEnrollment単位で動作する。保存済み`TrainingToolkitItem`は合格済み回答から作られる受講単位の既存機能であり、テーマ終了後も使える任意保存の活用例集とは異なる。
- 既存の`multiTopic`設定既定値はOFF。今回も既定値を変更していない。
- 決定6の保持期間は動的学習経路だけに適用し、既存固定研修や問い合わせ保持期間を変更しない。

## 2. 変更したファイル

- `packages/database/prisma/schema.prisma`: サービス・Workspace・Membership・User境界を持つテーマ、本人像項目、保存活用例の追加モデル。
- `packages/database/prisma/migrations/20261017100000_personal_learning_topics_persona_examples/migration.sql`: additive migration。既存の各Enrollmentの最初の希望から初期テーマを作る。既存希望・Goal・Plan・会話・実践記録は削除・書換えしない。RLSを有効化し、クライアント直アクセス用ポリシーは作らない。
- `packages/database/src/schema-readiness.ts`: repository readinessがこのブランチの最新migrationを検査するよう更新。
- `packages/capability-training/src/personal-learning-topics.ts`: `multiTopic` OFFなら同時進行1件、ONなら提案上限3件のdomain policy。既定値はOFFのまま。
- `packages/capability-training/test/personal-learning-topics.test.ts`: flag既定値、上限、拒否された本人像推測のAI context除外を確認。
- `packages/database/src/personal-learning-d.ts`: 所有スコープ付きテーマ操作、本人像の本人管理、保存活用例の保存・削除・利用時刻更新Repository。テーマ上限はDBのProgram設定からサーバー側で解決する。
- `apps/web/src/services/personal-learning-lesson-candidate.ts`、`apps/web/src/services/personal-learning-conversation.ts`、`apps/web/src/providers/openai-learning-lesson.ts`、`apps/web/src/providers/openai-learning-conversation.ts`: 同一Membershipスコープから拒否済みを除いた本人像項目を初回提案・同じスレッドの会話へ渡し、未確認推測/本人確認済みの区別を保持。
- `apps/web/test/openai-learning-lesson.test.ts`、`apps/web/test/openai-learning-conversation.test.ts`: 推測ラベル付き本人像をAI入力へ渡すことを検証。
- `packages/database/test/personal-learning-d-topic-boundary.test.ts`: tenant境界・非BunshinMemory・非破壊backfillを確認。
- `docs/IMPLEMENTATION_ROADMAP.md`: PR-A〜Gの正本参照をv4・決定記録へ訂正。

## 3. 主要な設計判断

- 本人像・活用例にはBunshin IDやBunshin Memory relationを設けない。本人像の根拠は本文複製でなく`evidenceType / evidenceId / evidenceCreatedAt`参照として保存する。AIへの投入policy helperは`REJECTED`を除外し、未確認推測と本人確認済みを別ラベルにする。
- テーマ数「3」は指示書v4が求める初期値案。田中の承認前にmultiTopic flagをONにせず、本番設定も変えない。
- migrationは既存データ保持を優先し、最初の希望を各受講の初期テーマとして追加記録する。

## 4. 実行した検証

- Node 24で`pnpm --filter @bunshin/database db:validate`成功。
- Prisma Client生成成功。
- `@bunshin/capability-training` unit test: 475件成功。
- Database unit test: 208 files、1,023 testsが成功（リポジトリ追加前の再実行）。Database型検査は追加Repositoryの修正後に再実行予定。
- `@bunshin/capability-training`: 30 files、475 tests成功。typecheck成功。
- 対象Web/Database変更ファイルのESLint、`git diff --check`が成功。
- Web全体のtypecheckは2分超出力がなく手動中断したため、結果未確認。
- Database integration testは未実行。PR CIも未実行。

## 5. 未解決事項・マージ前に必要な作業

この差分は保存層とpolicyの基礎であり、指定されたPR-Dの完成実装ではない。次が未完了のためマージしないこと。

1. 各テーマIDにGoal / Plan / 実践 / 会話スレッドを束縛し、AI入力・更新・削除の全経路でtopic scopeを強制する。既存のEnrollment単位APIを壊さず、初期テーマから移行する。
2. 本人像の画面/API（根拠記録リンク、「AIによる推測」表示、本人の確認・修正・削除）を接続し、拒否・削除が次回AI呼び出しに確実に反映されることをDB統合テストで検証する。現状はRepositoryとAI入力接続までで、本人UI/APIは未実装。
3. 受講単位に依存しない保存活用例の本人向け作成・閲覧・編集・削除、エクスポートを接続する。現状はRepositoryのみで、画面/APIと本人選択のsource検証は未実装。運営者の応答は件数だけに制限する。
4. 決定6の保持期限・プレビュー・実削除・個別/一括削除・Exportへテーマ、本人像、保存活用例を接続する。persona/exampleはサービス内の最新本人利用時刻を共有保持基準にする。本人の可視性即時削除と30日以内物理削除の設計も検証する。
5. 他Service・他Workspace・他User・BunshinMemoryの読書き不可をDB integration testで検証する。既存サービスの単一テーマ経路が変わらないことも確認する。
6. PR-D全体のtypecheck/lint/test/build、Database統合CIを再実行する。

## 6. 次へ進める条件

- Draftを作成して差分と未完了範囲を透明に提出する。マージ対象は上記1〜6を完了した版のみとし、現状のDraftはマージしない。
- 田中の確認前にマージしない。Productionへのmigration適用、deploy、flag変更、cron有効化は別途明示承認後とする。
