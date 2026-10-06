# Personal Learning P1-A Learning Scope実装報告

- 基準main SHA: `ecee3aa4b252d314561b6c5b2bad324bdd118d44`（PR #1144を含む最新mainをfetch）
- branch: `feat/personal-learning-scope-v1`
- 実装commit: `709af4c44af8851b3088a8b8e0f348af5a861b02`。本報告は後続文書commitで追加し、最終PR headは完了報告で記録する。
- 状態: P1-Aのみ。未接続の純粋契約と決定的Rule。本番利用・P1-B開始の承認ではない。
- 正本: [現状監査](01_AI_TRAINING_PERSONAL_LEARNING_CURRENT_STATE.md)、[Gap](02_AI_TRAINING_PERSONAL_LEARNING_GAP_ANALYSIS.md)、[3層設計](03_AI_TRAINING_PERSONAL_LEARNING_TARGET_ARCHITECTURE.md)、[実装計画P1-A](04_AI_TRAINING_PERSONAL_LEARNING_IMPLEMENTATION_PLAN.md#p1-a-learning-scopeと境界契約)。今回の人間指示がP1-A着手を限定承認した。

## 変更ファイルと配置判断

- `packages/application/src/learning-scope.ts`: package非依存の結果型、6分類、整合性検証/immutable receipt。
- `packages/application/src/index.ts`: 既存公開入口に追加。
- `packages/application/test/learning-scope.test.ts`: 18 contract test。
- `packages/capability-training/src/learning-scope.ts`: AI研修固有語・変換候補・V1判定Rule。
- `packages/capability-training/src/index.ts`: 既存公開入口に追加。
- `packages/capability-training/test/learning-scope.test.ts`: 61 boundary test。
- `docs/DECISION_LOG.md`: 未接続P1-Aの判断を追記。
- 本報告書。

既存training→applicationの依存と公開exportsを再利用した。新package、MOVE、依存追加、Provider/Prisma参照なし。共通契約はAIの教材名/Provider名/日本語判定パターンを持たない。結果の状態は研修を跨いでも意味が変わらないが、Sales等のRule実装は行っていない。

## Domain Contract

`LearningScopeResult`は`classification`、`detectedClassifications`、`ruleVersion`、`reason`、`requiresConfirmation`、`suggestedLearningIntent`を持つ。`classification=null`は未判定を示し、7つ目の分類を増やさない。`reason`は固定codeで、本人入力のコピーではない。

6分類はLEARNING / LEARNING_SUPPORT / CONTENT_REQUEST / CONSULTING / AUTOMATION_REQUEST / OUT_OF_SCOPE。分類は実行権限ではない。`requiresConfirmation=false`もGoal承認・安全承認・教材提供可能性を意味しない。Goal/Plan/Approval/Artifact/実行commandは含めない。

契約constructorは分類の整合性、版/理由code、候補最大300文字を検証する。未判定・混合・CONTENT_REQUEST・AUTOMATION_REQUESTの確認待ちを必須にする。候補は単一CONTENT_REQUEST/AUTOMATION_REQUESTだけに許可し、CONSULTINGへの自動提案を拒否する。結果と検出配列をcopy/freezeする。

## AI Training Package Rule

- Rule Version: `AI_TRAINING_LEARNING_SCOPE_V1`。同版の意味を変更せず、将来のRule改訂は版更新と回帰fixtureを必要とする。
- `classifyAiTrainingLearningScope({ text, hasCurrentAiLearningContext? })`は同期・決定的・副作用なし。入力最大2,000文字。空/超過/未対応は確認待ち。日本語の明示パターンだけを対象にし、NFKC正規化を使う。
- AI題材と明示的な学習希望の組合せをLEARNINGとする。単に「学ぶ」「学習用」「教材として」があるだけでは許可しない。依頼動詞が埋め込まれた学習/説明要求も確認待ち。
- 支援は明示的AI課題/Prompt/API等、または信頼できる現在のAI学習contextと課題参照/再説明の組合せ。contextはcallerが別途検証すべき値で、本人の「これは勉強」という文言から作らない。contextがあっても無関係な相談を支援へ変換しない。
- 完成画像/動画/メール/資料等の制作要求はCONTENT_REQUEST。自動化/Agent構築・設定要求はAUTOMATION_REQUEST。静的な「自分で作る方法を学ぶ」候補だけを返し、本人確認前にはGoal化しない。CONSULTINGは学習候補を返さない。
- 句読点/一部の接続語で要求を分け、検出分類を重複除去する。primaryはAUTOMATION_REQUEST→CONSULTING→CONTENT_REQUEST→OUT_OF_SCOPE→LEARNING_SUPPORT→LEARNINGの保守的な順序。複数検出は常に確認待ち・候補なし。未知の句を学習句に紛れて捨てない。
- 自動化「について/方法を教えて」は曖昧扱い。ルール無視等の既知回避表現は`BOUNDARY_BYPASS`で確認待ち。その他の未対応表現も確認待ちで、自然言語の全意図・全攻撃を識別する保証ではない。

## テストと検証

分類例は実装指示の明確な学習、制作、集客/売上/戦略、自動化/Agent/Zapier、学習支援、天気/旅行を含む。曖昧4例、混合3例、境界回避4例、未知の句、句読点なしの依頼、AIという英字部分文字列、context悪用、版固定・入力上限・immutable receipt・不正契約の否定テストを追加した。

- Node 24.19.0: capability-training全体17ファイル/152テスト成功（既存91 + 新61）。
- Node 24.19.0: application全体127ファイル/712テスト成功（新contract18を含む既存Program回帰）。
- Architecture check成功、Architecture否定テスト10件成功。
- application / capability-trainingのtypecheck成功。初回はテストの`node:fs`型依存を検出したため、不要なファイル読取テストを削除し、依存追加なしで再検証した。
- application / capability-trainingのlint、build成功。全Repositoryの`pnpm format:check`成功。本報告追加後の変更8ファイルPrettier checkと`git diff --check`も成功。
- 実DB/Provider/UI/本番の試験は行っていない。全Repositoryのtest/typecheck/lint/buildは上記の対象package検証と区別し、GitHub CI結果は完了報告で示す。

## 既存V1への影響と未実装

旧30日V1、Mission、Assignment、評価、LINE、Enrollment、Exposureの実装/設定を変更していない。公開入口へ追加しただけでRuntime/HTTP/Jobから呼び出さない。DB/schema/migration/UI/Provider/本番データ変更なし。元のdirty checkoutも変更していない。

Profile、Goal V2、Plan、Consultation、Memory、Router、Skill/Library/Assessment V2、Codex、Content Factory、生成/自動化/Agent実行、Sales/OEM等は未実装。Rule判定は認可・教材整備・教育評価・安全判定を代替しない。

## 次Phaseへの引継ぎとrollback

P1-Aレビュー後の別指示を待つ。将来のcallerはnull/確認待ち/混合を学習確定として使わず、候補を本人確認付きDraftとして扱うこと。認可・Scope・Goal承認・保存・実行は別契約であり、この結果だけで開始しない。未対応入力のfixturesを集める際も個人本文を無断保存しない。

rollbackは未接続の新関数と公開export/文書のrevertで可能。既存学習データやAssignmentの復元/削除、migrationは不要。今回はPR作成後に停止し、merge/deploy/P1-Bへ進まない。
