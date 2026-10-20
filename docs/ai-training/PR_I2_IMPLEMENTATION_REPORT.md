# PR-I2 実装報告：承認済みAIツール更新を学習提案へ接続

- 基準: PR-I1 merge後の `origin/main` (`ab97d168`)
- 状態: Draft。田中の確認前にマージしない。
- 本番操作: なし。DB migration、Program設定、機能フラグ、本番Provider/API呼出しは変更していない。
- 外部AI費用: 発生させていない。実Provider呼出し・評価セット実行はしていない。

## 1. 調査した内容

- PR-I1で追加された手動登録・審査済み公式更新情報カタログと90日承認期限を確認。
- 既存の最初の教材提案と同一スレッド相談は、`PERSONAL_LEARNING_LESSON_ADMISSION`、Personal Learning Call Admission、既存Provider Runtimeの費用予約・実績精算を通ることを確認。
- 現行のProgram別研修機能設定は未知・未設定の機能をOFFにする構造であり、旧設定（4/5項目）との互換性を保つ必要がある。

## 2. 変更内容と設計判断

1. Program単位の `toolUpdates` を追加し、初期値・旧Program・旧設定で常にOFFにした。管理画面の「プログラム設定」から、停止中のProgramについて他の学習機能と同様の監査付き手順で切り替えられる。
2. 公式情報は次の条件がすべてそろう場合だけ取得する。
   - 有効な `AI_TRAINING_V1` / `DYNAMIC_V1` Programで `toolUpdates` が明示的にON。
   - 受講者が選択した有効なテーマがある。
   - 希望に記録されたツールがChatGPT / Claude / Gemini / Canvaのいずれかと明示的に判別できる。
   - カタログ上で運営者承認済み、かつ有効期限内。
3. 検索数は最大3件。HTTPSとツール公式ドメインも読み出し時に再検査する。更新の要約・出典は未信頼データとして扱い、希望・テーマ・申告ツールのすべてに関連が明確な場合だけAIが参考にするよう指示する。関連が不明なら使わない。
4. 最初の提案と、同じ相談スレッドでの提案再作成の両方で、既存Admission・費用予約・精算を再利用する。別のAI呼出しや予約枠は追加していない。
5. 提案時にAIへ渡した更新のタイトルと出典URLを保存済み候補に関連付け、本人画面にその旨を明示して表示する（AIが実際に文章へ採用したと断定しない）。保存済みの旧候補には出典がなくても読み込み可能とし、空の出典一覧として扱う。
6. 受講者のテーマ読込はActorのWorkspace・Service・Enrollment・Membership・User・Topicに限定。カタログはプラットフォーム共通の承認済み公開情報のみで、BunshinMemoryや他の受講者データを読み込まない。新規テーブルの参照はフラグON、動的Program、選択テーマ、識別可能な申告ツールの後に限る。

## 3. 変更ファイル

- `packages/capability-training/src/personal-learning-pilot.ts`
- `packages/database/src/personal-learning-pilot-operations.ts`
- `apps/web/src/http/program-feature-flags.ts`
- `apps/web/app/s/[serviceSlug]/manage/programs/program-feature-flags-card.tsx`
- `apps/web/app/s/[serviceSlug]/manage/programs/personal-learning-preparation/pilot-operations-client.ts`
- `apps/web/src/services/personal-learning-tool-feature-context.ts`
- `apps/web/src/services/personal-learning-lesson-candidate.ts`
- `apps/web/src/services/personal-learning-conversation.ts`
- `apps/web/src/providers/openai-learning-lesson.ts`
- `apps/web/src/providers/openai-learning-conversation.ts`
- `packages/application/src/personal-learning-lesson-candidate.ts`
- `packages/application/src/personal-learning-conversation.ts`
- `packages/database/src/personal-learning-lesson-candidate.ts`
- `packages/database/src/personal-learning-conversation.ts`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/candidate-card.tsx`
- 関連テスト
- 本報告書

## 4. 検証

- `@bunshin/capability-training` test: 成功（496件）。
- `@bunshin/application` test: 成功（1,015件）。
- `@bunshin/database` test（非統合）: 成功（1,037件）。
- 受講者の更新候補取得、最初の提案、会話、Program設定画面のWebテスト: 成功（47件）。
- `@bunshin/database` とWebのTypeScript型検査: 成功。
- `git diff --check`: 成功。
- `verify` / `database` GitHub ActionsとDB統合テストの最終結果: Draft PR作成後に確認して追記する。DB統合テストをローカル実行するためのDB接続は行っていない。
- 実Providerを呼び出すテスト、外部検索、評価セット実行はしていない。

## 5. 未解決事項・運用上の注意

- 候補の関連性はAIが本人の希望・テーマに照らして判断する。検索はあくまで明示申告ツールに一致する承認済みカタログを最大3件に絞る。UI操作・最新仕様を公式出典以上に断定しない。
- 自動収集・定期実行・通知はこのPRに含めない。
- 機能はOFFのまま提出し、本番適用・Programフラグ変更は別途承認後に行う。
- 実Provider評価とその費用は、予算承認後の別作業とする。

## 6. 次の条件

- `verify` / `database` CIと関連テスト成功後、Draft PRとして田中の確認を依頼する。
- 田中の確認・マージ承認前にマージ、本番反映、migration適用、機能フラグ有効化を行わない。
