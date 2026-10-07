# パーソナルAI研修の段階実装計画

- 基準commit: `9e063dd8ebc905b91b005bc317c43797e22a6931`
- 調査日: 2026-10-06（Asia/Tokyo）
- 範囲/根拠: [現状E01〜E17](01_AI_TRAINING_PERSONAL_LEARNING_CURRENT_STATE.md)、[Gap表](02_AI_TRAINING_PERSONAL_LEARNING_GAP_ANALYSIS.md)、[目標Architecture](03_AI_TRAINING_PERSONAL_LEARNING_TARGET_ARCHITECTURE.md)。すべてProposed、未実装計画。
- 未確認: 本番学習効果、相談保持方針、AI新領域Rubric、期間/価格/契約、新保存schemaの必要性。UNKNOWNで開始Gateを止める。

## 2026-10-06 P1-C限定指示による更新

P1-A（#1145）/P1-B（#1146）はmain反映済み。今回P1-CはPlan / Learning Definition参照の最小Domain Contractと少数fixtureのみ。旧P1-C保存はP1-C-S候補として延期する。以降の計画は着手承認ではなく、P1-D/P1-E/保存/Providerは今回実装しない。過去の監査時点の検証記録は履歴として保持する。

Learning Definition Libraryを中心にし、完成教材の事前準備は必須ではない。固定骨格はSkill / Objective / Prerequisite / Concepts / Safety / Common Mistakes / Practice Pattern / Rubric参照。説明/例/練習/Hint/復習/難易度は別のPersonalization。Planは何を学ぶかだけを持ち、教えた本文を保存しない。Definition Factoryは欠けた設計図Draft→Validation→Human Review→Approved Definitionを将来方向とし、Content生成は下位候補へ変更する。

## 最初のPRと人間承認

### 2026-10-06 P1-D個別指示による順序更新

P1-A/B/Cはmain反映済み（P1-C #1147）。今回のP1-Dは保存前に必要な相談状態を確認するため、最大3問の非永続Application契約・決定的AI Mapping・候補本人選択までを先に実装する。旧計画の「保存専用PRを先にレビュー」はUI/API/永続化/Runtime接続のGateとして維持し、純粋な相談契約の着手条件ではなくする。P1-C-Sは今回実装しない。

既存setup UIはProfile/Goal保存と旧Runtimeを前提にするため、今回UI/APIは追加しない。P1-Cの3 Definitionはreview fixtureで、承認済み参照がなければGap。本人選択済み候補もProgramMemberGoal/Confirmed Goal参照/Planにはせず、後続保存PRで証跡・変更/取消・scope・Revisionを再検証する。

推奨する最初の実装PRはP1-Aの「Learning Scopeの純粋契約とAI研修固有の拒否/変換Rule」。汎用chat、LLMによる自動Goal確定、先行Content Factoryを作らず、Learning Firstを入口から守る。今回の監査文書PRはその前の設計レビューである。

実装開始前に次を人間が決める。

- AI研修は本人がAIを使う学習。教材の業務例と個社コンサルの境界、完成品modeの新版での扱い。
- V1最初のテーマ範囲。既存Prompt/文章中心から始める案を推奨し、画像/動画の教材未整備を完成扱いしない。
- Goal本人確認、主要Goal1つ、候補Goalの上限、変更後の再計画条件。
- 相談/Profile/Planの保存項目、保持/Export/削除/法人管理者に見せる指標。新相談全文を無期限保存しない。
- 学習Plan達成とEnrollment契約期限の分離、新版参加対象、旧30日V1維持。OPEN_ENDEDの提供期間/通知/料金責任は別承認。
- Planの参照整合性/CAS/履歴を既存保存先で保証できるか。必要なら最小additive schema案を次PRの前に承認。
- 教育評価としての妥当性と「習得」表示の基準。LLM点数だけで能力認定しない。

## Phaseと共通化タイミングの別軸

機能Phase 1=Personal Learning V1、Phase 2=学習品質、Phase 3=教材拡張。共通化段階はG1=AIで必要な明確共通責務、G2=AI Loop実証、G3=仮想Sales再検証、G4=実第二Packageで共通性確定。今回の仮想Sales検証は設計チェックとして先に行ったが、G4の実証を代替しない。Phase番号の一致を着手許可にしない。

## 小さなPR単位

### P1-A Learning Scopeと境界契約

- 目的/変更範囲: LEARNING / LEARNING_SUPPORT / CONTENT_REQUEST / CONSULTING / AUTOMATION_REQUEST / OUT_OF_SCOPEの結果、Rule版、理由、要確認を純粋契約候補として定義。AI Packageが具体判定/学習への変換を持つ（E04/E08/E16）。
- 対象外: DB、UI、Provider、汎用chat、成果物生成、Runtime接続、全Package Rule。
- 受入条件: 「画像を作って」は制作を実行せず学習希望確認、「メールを書いて」も学習へ、個社自動化/集客相談は拒否または明示確認。曖昧/未知は確認待ちで、学習へ勝手に承認しない。
- テスト: 許可/拒否/曖昧/命令注入/混合依頼とRule versionの固定。AI固有用語がCoreへ漏れない境界テスト。
- rollback: 新契約は未接続で旧V1に影響なし。契約変更は版更新、既存意味を上書きしない。

### P1-B ProfileとGoalの最小契約

- 目的/変更範囲: E06/E07の正本を再利用するLearner/AI Profile projection、Goal semantic参照/本人確認/優先順位/履歴の契約。common名を付けるだけの移動はしない。
- 対象外: 新Registry/巨大JSON/全社Profile共有、UI/Provider、同時多数Goal。
- 受入条件: Tool経験はPackage、ペース等は共通投影。既存Goal取消履歴を読める。自由文を既存Goal keyと偽装せず、旧Profile入力も維持する。
- テスト: 旧Catalog/Profile decode、AI経験と共通項目の境界、unknown key、学習Goalと契約dueAtの分離。
- rollback: projection adapterを外して旧読取へ戻せる。保存を追加する場合はP1-Cの承認前に着手しない。

### P1-C Plan / Learning Definition参照の最小Domain契約

- 目的/変更範囲: Confirmed Goalに紐付くPlan identity/Revision/参照経路/前提/理由code/Draftと本人確認receipt、版固定Definition参照。AI Packageの既存Missionから3 review fixture。
- 対象外: DB/schema/migration/保存/CAS/idempotency/UI/API/LLM/Provider/Codex/Teaching/Factory/Router接続。
- 受入条件: Candidate/Suggestion拒否、GoalとPlanの別確認、Revisionの上書き/承認引継ぎなし、CoreへAI語をhardcodeしない。本文なし、既存V1未変更。fixtureは公開済み教材/Definitionではない。
- テスト: P1-A/P1-B回帰、Confirmed Goal要件、scope/版/前提関係/Revision、本文混入拒否、Enrollment分離、仮想Sales参照。
- rollback: 未接続のcontract/fixture/exportをrevertするだけ。DB操作なし。今回PRレビュー後に停止する。

### P1-C-S GoalとPlanの永続化境界（延期・保存専用PR候補）

- 目的/変更範囲: P1-C Domainレビュー後の別承認で、confirmed Goal参照とPlan revision、Definition版/理由/承認状態の保存Port、Prisma最小実装、本人scope/Enrollment lock/CAS/idempotency、最小Audit（E03/E06/E07/E15）。Definition Libraryの巨大Registryは先行実装しない。
- 対象外: 実行選定、相談UI、Provider、既存Goal/Enrollmentの一括移行。
- 受入条件: 既存Programへ同じAssignment/Eventを二重作成しない。旧revisionは不変、競合409、削除中/所属失効は拒否。不要ならschema追加なし。必要なら独立additive migrationの理由・索引・参照・backup/rollbackを人間承認する。
- テスト: User/Service/Workspace越境、CAS同時更新、再送、削除後遅延保存、旧Goal行維持。隔離DB統合を必須にする。
- rollback: 新機能受付停止、旧V1並行維持。保存済み新Planを旧アプリが読む必要がない構造。additive列/tableを即時dropしない。

### P1-D 学習相談と本人確認入口

- 目的/変更範囲: 「今日は何を学びたいですか」→Scope→bounded希望→Goal候補→本人確認→Plan提案のmobile UI/API。Profileを必要時に追加質問する（E05/E06/E09/E13）。
- 対象外: 万能chat、長期会話Memory、個社改善提案、成果物納品、Content Factory、LINE開始。
- 受入条件: 認可scopeをserver解決、機密入力注意/上限、更新はsame-origin+validation。管理者に相談本文を公開しない。LLMを使うなら事前にProvider/費用/送信情報承認、構造化候補/Usage/失敗時確認待ち、Draftは実行しない。
- 追加Gate: 保存専用PRとGoal/Plan確認証跡を先にレビュー。承認済みDefinition骨格なしに自由Teachingを開始しない。Definition gapはDraftへ保留し、完成教材の事前存在を必須にはしない。
- テスト: Scope分類のUI、本人確認なし保存拒否、未知テーマはLibrary gapとして保留、Provider failure/invalid output、他Enrollment拒否、相談削除/Export。
- rollback: 入口を停止し旧初期設定を維持。提案済みDraftをconfirmedとして誤実行しない。

### P1-E Planと既存Routerの接続

- 目的/変更範囲: confirmed PlanをAiTrainingV1Policyへ最小投影し、既存persistDecisionでAssignmentを確定する。AI key/前提/復習規則はPackage（E03〜E05/E08）。
- 対象外: Router Framework、Sales実装、AI教材新規生成、契約期間変更。
- 受入条件: Plan/Goal/Unit/Template版が一致。review/recovery/wait優先の意味を保ち、Rule版と選定理由を保存。未承認/削除済み/未知Unitは旧動作への明示fallbackまたは保留で、架空完了にしない。
- Definition更新Gate: 承認済みDefinition版→既存Mission/quality/Rubricの対応、外部prerequisiteの実証、現行Goal/Plan Revision/認可/期間/削除状態を実行直前に再照合する。Plan CONFIRMEDやfixture存在は実行許可ではない。
- テスト: 旧25 keyの回帰、前提不足、完了/失敗/復習、Goal変更同時選定、二重Assignment、fallback理由、削除世代/期間拒否。
- rollback: Plan接続を停止し旧Policyを維持。既に提示したsnapshot/評価版を上書きしない。

### P1-F Goal型学習の新版と期間互換

- 目的/変更範囲: AI新版の許可定義識別、提供版管理、学習Plan達成と契約終了の分離。E01/E02/E14のOPEN_ENDED可否、phase日数、Offering terms、購入期限、expiry/retention、LINE送信を通し検証する。
- 対象外: 旧V1の書換、一括期間延長、本番採用/招待、料金変更、保持期限変更。
- 受入条件: 30日V1と新版が並行稼働。完全一致validationを単に削除しない。新モデル不要と判断する場合も対応表/後方互換を証明。学習達成だけでendsAt/endedAtを変更しない。
- テスト: FIXED/OPEN両定義、改変拒否、null期限/境界時刻、有料/無料/停止所属、再開時の期間、旧display1〜5、LINE候補、Retention起算/削除対象を隔離環境で確認。
- rollback: 新規採用を止め旧V1を残す。新版受講者を旧定義へ自動変換しない。契約/削除データを推測復元しない。

Phase 1完了は希望→本人確認Goal→Plan→既存課題→評価→次課題の通し検証、Privacy/期限/越境/競合の否定テスト、人間の学習体験レビューが条件。実装完了と本番参加承認は別。

### P2-A AI Skill MapとLearning Definition Libraryの版管理

- 目的/変更範囲: E08/E16の責務の違いを維持し、AI Literacy/Safety/Promptingから必要なDefinition固定骨格/Skill/Rubricを整理。Image/Video等は実需と専門評価で段階追加し、大量教材を先に作らない。
- 対象外: 全領域一括実装、一般Package Builder、共通Skill名hardcode、Support Skillと習熟Skillの統合。
- 受入条件: immutable意味版、旧6技能の対応、DefinitionのObjective/Prerequisite/Concepts/Safety/Mistakes/Practice/Rubric参照、同版内意味変更拒否。Presentation参照は任意で、完成教材を必須にしない。
- テスト: 旧Catalog版、存在しないUnit/Rubric、前提循環/不足、Skill namespace collision、Service独自教材越境。
- rollback: 新教材の新規提示を停止。過去Assignment/評価版を維持、学習履歴を削除しない。

### P2-B AssessmentとAdaptive Learning

- 目的/変更範囲: テーマ別Rubric、理解/技能evidence、説明量/再説明/基礎短縮とPlan再提案。既存Job/Domain PASS/Review、Barrier/Hintを拡張（E08〜E10）。
- 対象外: LLM単独の習得確定、一律自動進級、Provider/課金設定の無承認変更。
- 受入条件: result/Revision/Audit共通、意味/Prompt/PASS/Skill投影はPackage。未評価と0点を区別、教育評価者が基準妥当性を確認。
- テスト: Rubric別成功/失敗、未知版、注入、遅延評価/取消/期間終了、再試行、SHORT目的維持、評価からRouterへの反映。
- rollback: 新評価受付と再計画を停止。処理中Jobは旧結果と混ぜず、適用可能revisionだけ確定。

### P2-C Learning Memoryと能力中心Growth

- 目的/変更範囲: Event/Profile/Assessment/Goal/Planを正本とするread model、何ができるか/証拠/次の学習表示。相談本文は再保存せず参照最小化（E11/E13/E15/E17）。
- 対象外: Bunshin Memory同期、性格推定、個人本文の企業公開、匿名化を閾値だけで保証。
- 受入条件: 完了数levelと習得を分け、保持/削除/Export/退会対象inventory更新、本人/法人表示別projection、小集団方針承認。
- テスト: 再構築、重複Event、削除後再投影防止、未評価表示、本文非取得、別User/Service/Bunshin越境。
- rollback: 新projection/UIを停止、旧正本を維持。派生データを元に未確認習得を復元しない。

### P3-A Learning Definition Factoryの設計再レビュー

- 目的/変更範囲: AI V1完成・Loop実証後に、Definition Library検索→Definition Gap→Skill/Objective/Prerequisite/Concepts/Safety/Mistakes/Practice/Rubric Draft→Validation→Human Review→Approved Definitionの最小設計。Codex等はDraft候補のProvider。Content生成は骨格に基づく下位候補。既存E16との相違を先に評価し、支援Skillと習熟Skill/Definitionを混同しない。
- 対象外: 今回のCodex接続、ユーザー環境実行、完成成果物、自動改善/PR/Merge/Deploy、Marketplace/SDK。
- 受入条件: AI以外の仮想Sales Definitionでも骨格参照を表現できる、個人情報除去/Definition・教材権利/予算/承認役割/再利用版の条件を人間が確定。実第二Packageは別商品承認。
- テスト案: 将来の非本番fixtureで旧Library再利用、未知Gap、Draft検証失敗、未承認登録拒否、scope/版整合。実Provider試験は別承認。
- rollback観点: 自動登録をそもそも許可せず、承認済み版のみ配布。外部実行開始前なら設計を棄却可能。

## 設計の危険点と開始条件

最大の危険は、共通Profile/Routerを作る名目でAI固有fieldをCoreへ混ぜること、Event JSONにPlan正本と個人本文を重複すること、Support Skillを能力評価として扱うこと、OPEN_ENDEDを料金/保持/通知無期限の許可と誤ること。

各PRは目的・対象外・受入条件を個別承認し、全CIと必要な隔離DB検証後に人間レビューする。本番設定、Template採用、Enrollment登録、LINE、Skill Exposure、Provider有効化は独立した運用承認を必要とする。今回の4文書完成をもって停止し、P1-Aを含む実装へは進まない。

## 今回の検証記録

- main fetchと作業checkout cleanを確認し、`docs/personal-learning-gap-analysis`を基準mainから分岐。元のdirty checkoutは変更していない。
- コード/model/HTTP/UI/テスト内容を静的監査。E番号の根拠を参照する。
- Node 24.19.0で`pnpm --filter @bunshin/capability-training test`: 16ファイル/91テスト成功。
- Node 24.19.0で`pnpm --filter web exec vitest run test/training-program-provisioning.test.ts test/ai-training-admin-evaluation-privacy.test.tsx`: 2ファイル/18テスト成功。初回は既定Node 22がengine条件で拒否されたため、環境設定を変更せず同梱Node 24のPATHを当該プロセスだけに指定して再実行した。
- 変更6文書のPrettier check、`git diff --check`、同文書のローカルMarkdownリンク43件の存在検査に成功。アンカー/コード参照の意味は静的読解による確認で、リンク存在検査とは別。
- 実DB/Provider/実端末試験は未実行。上記成功を本番の学習効果・消去保証・運用安全条件のPASSEDとして扱わない。
- 今回は文書のみ。コード・DB/schema/migration・Provider設定・本番データの変更なし。typecheck/lint/buildの全体再実行は文書のみのため省略し、PRのCIと区別する。
