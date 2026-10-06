# Personal Learning P1-D Consultation 実装報告

- 基準main SHA: `12eca68412ac9a6f9ecdbfc03f6242b45f643ad7`（#1147 merge、latest main fetch済み）。
- branch: `feat/personal-learning-consultation-v1`
- 実装commit: `bddaf3a6b997eb59db622746e495130790a6d6e4`。本報告は後続文書commitで追加するため、PR headとは区別する。
- 状態: 非永続Application契約まで。UI/API/Provider/Runtimeは未接続、本番利用承認ではない。
- 参照: [P1-C報告](AI_TRAINING_PERSONAL_LEARNING_P1C_PLAN_DEFINITION_IMPLEMENTATION.md)、[段階計画](04_AI_TRAINING_PERSONAL_LEARNING_IMPLEMENTATION_PLAN.md)。今回のP1-D指示が旧保存先行計画に優先する。Decision Logへ実装前に判断を追記した。

## Consultation contract / Core・Package境界

既存applicationへ`LearningConsultationRequest` / `Question` / `GoalSuggestion` / `Result`を追加し、公開入口からexportする。AI keyword/Mappingはcapability-trainingの`consultAiTrainingLearning`だけに置く。新package/汎用Intent Engine/Chat sessionを作らない。

契約版は`LEARNING_CONSULTATION_V1`、AI Rule版は`AI_TRAINING_CONSULTATION_V1`。入力はscope、最大2000文字の希望、最大3個のquestion/answer code。長い会話履歴はない。純粋関数は同一入力から質問順を再計算して、飛越/順序違い/未知回答/余剰回答を拒否する。自由文経験回答は今回受け付けず、NONE/SOME/UNKNOWNの選択を使う。

状態はASKING / GOAL_CANDIDATE / LEARNER_SELECTED_CANDIDATE / LEARNING_DEFINITION_GAP / SCOPE_REVIEW_REQUIRED / OUTSIDE_SCOPE / LEARNING_SUPPORT / DECLINED。最大3問は、テーマ選択または学習への変換確認→必要時だけAI経験→Goal確認。テーマが明確ならテーマ質問は省略し、Gapが分かった時点で不要な経験質問をしない。

scopeはWorkspace/Group/Enrollment/Membership/Userの5軸。trusted callerの解決済みscopeと入力・両Profileを照合する。これはHTTP認証/所属認可/期限検査の実装ではない。将来入口はserverで本人/所属を解決し、contextや承認参照をクライアントJSONから採用してはいけない。

## P1-A Learning Scopeとの接続

希望は必ず既存`classifyAiTrainingLearningScope`を通す。Rule変更や既存V1接続はない。混合、boundary bypass、検出Intentと未解釈節の混在は保留して候補を返さない。CONSULTING/OUT_OF_SCOPEは対象外で、学習への自動変換もしない。

単独CONTENT_REQUEST/AUTOMATION_REQUESTは「代行でなく学ぶ方法を選ぶか」を確認する。YESの後にPackageが用意した**新しい学習要求**をP1-Aで再判定する。suggestedLearningIntentは直接Candidateへ渡さない。画像/動画/自動化は再判定後もDefinition Gapで、制作/実行しない。一般成果物/メールはPromptを組み立てる基礎学習へ限定し、プログラム制作やメール納品をGoalにしない。変換確認とGoal選択は別。

「何を学べばいいか分からない」「ChatGPTをもっと使えるようになりたい」などP1-Aで確定できない表現は、有限テーマを本人が選ぶ質問へ進む。未解釈の元文をLEARNINGとして偽装しない。LEARNING_SUPPORTは既存支援へのhandoff候補状態だけで、新Teaching/回答生成はしない。現在の支援contextはP1-B primary GoalがACTIVEの場合だけ使う。

## Profile / Progressive Profiling / Personalization

P1-BのLearner/AiTraining投影を利用する。AIレベルが既知またはAI経験が明示NONE/SOMEなら、生成AI経験を再質問しない。レベル/経験ともUNKNOWNの時だけ、対応可能なPrompt学習で1問聞く。BEGINNERやNOT_YETからNONEを推定しない。回答しない場合もUNKNOWNのままで一般的な基礎Goal候補を提示できる。

今回の個別化は必要質問の省略、学習テーマに対応するGoal表現とDefinition経路候補だけ。既知AIレベルをSkill習得証拠にせず、基礎前提を勝手に省略しない。画像等は未対応なので画像経験fieldや質問を先行追加しない。教材/例/練習/Hint/復習生成はない。

## Goal Candidate / 本人選択

既存Catalogの`USE_AI_IN_DAILY_WORK`（`AI_TRAINING_CATALOG_V1`）を意味参照に使い、対象をPromptの構造/背景/条件学習へ絞った学習目的・到達状態・対象Skillを別の候補表示契約へ出す。業務売上/集客KPIやCourse受講を目的にしない。Catalog/既存Goal保存・取消は変更しない。

Goal候補はP1-B `LearningGoalCandidate`のまま。本人YES後も`LEARNER_SELECTED_CANDIDATE`であり、DB上のACTIVE Goal、`ConfirmedLearningGoalReference`、Planではない。候補本文・scope・Rule版・意味参照・Definition版を結び付けたcandidateKeyと表示時の確認回答を照合し、別候補への確認流用を拒否する。このkeyは認証tokenでも耐改ざん署名でもなく、本人認証/保存証跡は後工程。クライアントが送った自己申告だけで保存済み本人確認へ昇格してはいけない。

## Definition lookup / Definition Gap

P1-C fixtureの版固定参照・Skill参照を読む。完成教材本文/content referenceの存在は要求しない。PROMPT_STRUCTUREは1個、CONTEXT_SETTINGは前提込み2個、CONSTRAINT_SETTING/一般Promptは前提込み3個の候補を返す。これはPlan Draftの素材にすぎず、Plan生成/確定関数を呼ばない。

3 fixtureは未承認なので**デフォルトはUNAPPROVED_OR_MISSING_DEFINITIONのGap**。trusted callerが人間レビュー済みの完全一致Definition参照を与えた場合だけ候補生成を検証できる。承認操作/承認保存/Library検索Adapterは今回作らず、テスト入力の承認は合成値で、本番承認の証拠ではない。部分承認や旧版/異版はGap。画像/動画/自動化/Agent/API/Excel等はUNSUPPORTED_THEMEで、Goal候補や新Definitionを生成しない。

## Privacy / UIを追加しない理由

入力希望と構造化回答は純粋関数呼出の非永続データだけ。結果にProfile/Memory/chat historyを返さず、入力Profileを変更しない。エラーに本文を含めず、企業管理者画面/ログ/汎用Bunshin Memory/既存Profile全文保存へ接続しない。非永続をブラウザ/HTTP/telemetryの消去保証とは扱わない。実入口を作る前に保持/削除/Export/telemetryと同意を別レビューする。

既存`ai-training-setup-card.tsx`は5段階の初期診断と`saveProfile`を前提にし、既存Goal保存と旧30日Runtimeにつながる。ここへ候補確認を足すと、未永続候補と保存済みGoalの混同を招く。P1-D指示20に従って今回はDomain/Applicationまでに限定し、UI/HTTP APIを変更しない。スマートフォン/実認証/実端末のUXは未検証。

## 変更ファイル / テスト

- application: `src/learning-consultation.ts`と`src/index.ts`（中立契約/export）。
- capability-training: `src/learning-consultation.ts`と`src/index.ts`（決定的相談/export）、`test/learning-consultation.test.ts`。
- `docs/DECISION_LOG.md`、`04_AI_TRAINING_PERSONAL_LEARNING_IMPLEMENTATION_PLAN.md`、本報告書。

新規テストは49件。明確なLearning、Profile既知/UNKNOWN、変換へのYES/NO、Scope再判定、Consulting/対象外、承認あり/部分/異版/なしGap、Candidate/本人選択、Plan拒否、候補確認流用、最大3問、自由文/本文回答拒否、5軸越境、mixed/bypass、入力Profile不変・決定性・freezeを確認する。ChatGPTという名前だけで画像/音声/コード/税務など別テーマをPrompt対応済みへ誤Mappingしない否定テストも含む。

Node 24.19.0 / pnpm 10.10.0で以下を確認した。

- application全回帰: 129 files / 792 tests成功（P1-A/B/C、Program関連を含む）。
- capability-training全回帰: 20 files / 240 tests成功（新規49を含む）。
- `architecture:check`成功、`test:architecture` 10 tests成功。計1042 tests成功。
- 対象2packageのtypecheck/lint/build成功。Repository `format:check`、変更ファイルの最終Prettier check、`git diff --check`成功。
- 開発中に混合要求の保留、const型、optional fieldのstrict型検査を修正して再検証した。P1-A Ruleを変更したり型検査を抑制したりしていない。

対象package検証は全Repositoryのtypecheck/lint/test/build、実DB/HTTP認証/実端末/本番確認とは区別する。GitHub CIはpush後に別途確認し、ローカル成功からCI成功を推定しない。

## 未実装 / P1-C-S・P1-Eへの引継ぎ / rollback

DB/schema/migration/保存/Prisma/CAS/idempotency、UI/API、Provider/LLM/Web検索/Codex、Definition Factory、Chat履歴/Memory、Teaching/Content/Hint/Assessment変更、Mission/Assignment生成、Router/Runtime/LINE/旧30日V1/Salesは変更・接続なし。既存Program実行正本を維持する。

P1-C-Sでは実入口の候補ID/変更版、scope、Rule/Definition意味版、本人確認証跡、Goal IDとの結び付け、旧Goal取消/Primary唯一性、Planとは別の確認、期限/再送/CAS/失効/削除・Export inventoryを最小化してレビューする。全文Chat保存を前提にせず、今回の一時回答をProfileへ丸ごとコピーしない。approvedDefinitionRefsの実読取・人間承認方法も未実装。

P1-Eは別指示後。Approved Definition/実前提習得/本人認可/現行Goal・Plan Revision/受講期限を実行直前に確認し、候補本人選択だけでAssignmentを作らない。rollbackは未接続の新契約/純粋関数/exportと文書をrevertするだけで、DB復元や受講者移行は不要。元dirty checkoutは変更せず、本PR完成で停止し、merge/deploy/次工程を行わない。
