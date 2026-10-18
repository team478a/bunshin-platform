# マナベル PR-C2 実装報告

状態: PR-C1（#1328）はmainへマージ済み（merge commit `b577bcac`）。本PR #1329はmainをbaseとするDraft。マージ・本番リリースは未実施。

## 1. 調査した内容

- 本線化指示書v4のPR-C 2・3・5を対象とした。追加回答は元の希望を変更せず補足情報として生成に渡し、実践中の相談は既存の希望revisionに対応する同一スレッドで続ける。
- 会話はEnrollment・User・Workspace・Group・希望revisionを束縛した既存`ProgramActionEvent`を使用する。候補は既存`PersonalLearningRequest.lessonCandidate`を使用するため、DBテーブル・migrationは追加しない。
- 会話単位の費用予約は既存`PERSONAL_LEARNING_LESSON_ADMISSION`を再利用する。学習提案・途中相談と共有される既存上限の未設定・不一致・超過時にはAIを呼ばない（利用者確認済み）。

## 2. 変更したファイル

- `packages/application/src/personal-learning-conversation.ts`: 会話コンテキストを最大8往復・UTF-8 10,000 bytes以内にする境界関数、再生成候補の完了契約。
- `packages/database/src/personal-learning-conversation.ts`: 古い会話から切り詰め、追加質問候補の改訂をAI利用記録・応答と同一トランザクションで保存。元の希望は保持し、候補IDを更新して確認状態をリセットする。本人がチャットで明示した端末・AIツールのみ未設定欄へ反映し、既存値は上書きしない。
- `apps/web/src/providers/openai-learning-conversation.ts`: versioned prompt/schemaを更新し、NEEDS_CONTEXT候補がある場合だけ改訂候補を返す。練習中の課題・直近記録を入力に含める。
- `apps/web/src/services/personal-learning-conversation.ts`: 既存Admissionで1回分の費用を予約し、候補・短縮済み実践状況を同じProvider呼び出しに渡す。
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/{conversation-card,candidate-card,card}.tsx`: 候補の確認質問に同じチャット欄から回答し、返された候補を画面に同期。
- `apps/web/test/openai-learning-conversation.test.ts`、`apps/web/test/personal-learning-conversation-service.test.ts`、`packages/application/test/personal-learning-conversation.test.ts`、`packages/database/test/personal-learning-persistence.integration-cases.ts`: 出力検証、既存上限、候補再生成、スレッド継続、履歴件数/バイト上限を検証。

## 3. 主要な設計判断

- 会話応答と候補の改訂は同じ会話Provider呼び出し・同じAdmission費用枠で行う。候補の再生成のために隠れた2回目のAI呼び出しをしない。
- `NEEDS_CONTEXT`候補に対する応答だけが候補改訂を許可する。保存時にも候補ID・request revision・未確認状態を検査し、競合や古い画面からの更新を拒否する。
- 元の`originalText`はDBから維持する。新候補は新しいIDになり、確認済み状態は引き継がない。実践開始は別の明示確認のまま。
- 会話の直近8往復をさらに10,000 UTF-8 bytes以内に制限する。実践状況は現在の課題・直近の記録に絞り、画像や全履歴をAIへ渡さない。リクエスト総byte/token上限は既存Admissionで検査する。
- AIは端末・ツールを推測せず、本人が明示した情報だけを未設定欄へ補完する。既存プロフィール値や元の希望文は上書きしない。
- AIは次の小さな一歩を促すだけで、課題開始・提出・評価・修了を決定しない。

## 4. 実行した検証

- ローカル: `@bunshin/application` の会話テスト 7件、WebのProvider/Serviceテスト 10件が成功。
- ローカル: Application・Database・Webのtypecheck、Application/Databaseのlint、変更したWebファイルのlint、変更ファイルのformat check、`git diff --check` が成功。
- GitHub Actions CI run [#38995775401](https://github.com/team478a/bunshin-platform/actions/runs/38995775401): `verify` と `database` の両jobが成功。`verify` はformat check・typecheck・lint・全test・learning UI test・buildを完了。`database` はDB validate/migrate/readinessおよび `pnpm test:integration` を完了。
- Database統合テストはGitHub Actionsの一時PostgreSQL環境で実行し、同一スレッドの候補再生成、明示された端末・ツールの補完、元の希望文の維持を含む。

## 5. 未解決事項

- 実際のAIによる社内評価と本番設定でのAdmission値確認は未実施。本PR #1329のユーザー確認・マージは未完了。本番リリースは行わない。

## 6. 次へ進む条件

- 本PR #1329のDraftレビュー、base変更後の必須CI成功、運用評価を確認する。田中の確認前にマージ・リリースしない。
