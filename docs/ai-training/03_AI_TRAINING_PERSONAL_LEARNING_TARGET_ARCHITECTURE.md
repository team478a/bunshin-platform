# パーソナルAI研修の目標Architecture

- 調査基準commit: `9e063dd8ebc905b91b005bc317c43797e22a6931`
- 調査日: 2026-10-06（Asia/Tokyo）
- 範囲/根拠: [現状監査E01〜E17](01_AI_TRAINING_PERSONAL_LEARNING_CURRENT_STATE.md)、[Gap分類](02_AI_TRAINING_PERSONAL_LEARNING_GAP_ANALYSIS.md)。以下は設計案であり実装済み契約ではない。
- 未確認: 新保存modelの必要性、教育評価妥当性、第二Packageの実需、Provider/Backupの消去保証。今回はMOVE/schema/migrationを行わない。

## 3層の責務図

```text
Layer 3  Service / Operator / OEM
  既存Workspace / Service / Group / Membership
  ブランド・Package利用許可・独自教材の所有scope・法務・運営・LINE設定
  既存TemplateVersion / ServiceProgram / Offering / Enrollment
                    | 認可済み参照・設定（学習本人情報の暗黙共有なし）
                    v
Layer 1  Personal Learning Core候補
  Learnerの共通投影 / Goal参照 / Plan revision
  Unit・Skill・Assessment参照 / Router結果 / Learning Scope結果
  Memory・Progressの派生投影（保存正本を重複させない）
  既存ProgramのAssignment / Event / Progress / Audit / Jobを利用
                    ^
                    | Package提供の版固定定義・Policy・検証済み結果
Layer 2  AI Training Package
  AI Profile / AI Goal変換 / Scope Rule / AI Skill Map
  AI Unit・教材・Rubric / AiTrainingV1Policy / Adaptive Rule
  AI評価Port -> Web composition -> Provider Adapter（Coreの外側）
```

これは責務図で、3つの新packageを今回作る指示ではない。Layer 1の既存Program部分はapplicationにKEEP。学習固有の新責務だけが共通化候補。Packageは共通Portを実装/利用し、CoreがAI_TRAININGの具体実装やProviderをimportする方向にはしない。DBはPort実装、Webは認可とcomposition root。公開入口は各package.jsonのexportsを使い、src内部参照を増やさない。

AI研修が第一の商品。営業/SNS/新人/接客/業種別/独自研修は将来候補にとどめる。学習契約を持てることと、別研修の商品提供・権限・法務を満たすことは別。

## 正本と契約案

### ScopeとLearner Profile

共通Learnerの識別は認可済みWorkspace + Service（実DBのgroupId）+ Enrollment + 本人Userを基本とする。全社/全Service共有のUser Profileへ変更しない。Bunshinを必須にせず、Bunshin Memoryとの暗黙同期を禁止する。

共通Profile候補は学習ペース、説明量/方法の希望、学習希望参照、現在Goal参照、履歴参照。AI Package ProfileはAIレベル、Tool別経験、AI用途、AIテーマ、入力禁止情報の確認状態。Provider名はAI教材/経験の対象名としてPackage内で使用できるがCoreの識別/状態遷移の中心にはしない。

最初はTrainingParticipantProfileを壊さず、boundedでschemaVersion付きの2つのtyped projectionを明示する。共通状態を別巨大JSONへ複製しない。既存dailyMinutes等は当面そのまま正本とし、projectionは読取のみ。新しい説明希望を保存する必要が確定した段階で、列追加/専用状態の最小案を比較する。Package Profileを動的schema engineにしない。履歴と変更監査には本文や機密情報を複製しない。

### GoalとPlan

ProgramMemberGoalのIDと旧履歴を再利用する。自由希望をLLM出力のままGoalへ保存せず、Scope判定→AI学習目標候補→本人確認→保存の順にする。共通Goalは学習目的、対象Skill参照、到達証拠、優先順位/状態/semantic versionの候補を持ち、AI固有目標変換はPackageへ残す。数値ACTION=1だけを理解達成の証明にしない。

Planは新しい責務候補である。最小案はscope、planId、revision、goalRef、packageRef、ordered Unit refs、prerequisites、選定理由code、作成Rule版、確認/失効状態、basedOn（Goal revision/評価参照）を持つ。Assignment/Event/Progressを複製しない。本人確認済みの主要Goalは最初1つとし、新希望は次候補として保持する案を推奨する。複数同時Goal数は人間承認対象。

再計画は旧Planを消さず、旧revisionを参照した変更提案→本人確認→CAS確定を想定する。相談中のDraftはRuntimeに接続しない。承認済みPlan、Enrollment、Template版、Unit版の一致を実行直前に再確認する。Plan永続化をProgramActionEventへ本文として押し込むかは未承認。イベントは事実receiptでありPlan正本の無制限代用品にしない。

### UnitとSkill

Learning Unit共通契約の候補はid、package、version、title、objective、prerequisites、targetSkills、difficulty、content reference、evaluation reference、status。全項目を初日から汎用Registryへ実装しない。最初は既存TemplateVersion + Mission key + quality版へ参照を張り、対応が未定ならUNKNOWNで停止する。公開済みUnitの意味を同じversionで変更しない。

Skill共通契約はskillRef（package/id/version）、習熟状態、評価証拠参照、評価日時/Rule版まで。Prompting、Image Generation、Questioning等の意味・階層・合格基準はPackage。現在のTrainingSupportSkillは支援手順であり、Learner Skillの正本へrename/MOVEしない。

Libraryは承認済みPackage contentを再利用する。Coreは参照と状態だけ、AI Packageは説明・Prompt練習・画像/動画/自動化の一般教材を持つ。独自教材もService所有scopeを維持し、他社Libraryへ自動共有しない。教材一般化時には個人相談/仕事情報の除去と権利確認を別Gateにする。

### RouterとAssessmentとAdaptive

NextActionPolicy/Decisionを再利用する。候補入力はGoal/Plan revision、completed/failed/review-required、prerequisite充足、Skill evidence、本人希望。Core側にAI Mission keyやPrompt skill名を埋め込まない。AiTrainingV1PolicyのAI基礎必須、Prompt復習、AI Safety、Role sequenceはPackageにKEEP。Planを参照してもWAIT/RECOVERY、理由code、Rule版、冪等persistDecisionを迂回しない。

Assessment共通契約候補はrequest/result identity、Unit/Rubric ref、revision、PENDING/READY/FAILED等の状態、Audit、学習投影への適用receipt。評価Prompt、何を評価するか、PASS条件、Skill投影RuleはPackage。既存Job/AI Usage/遅延結果拒否を維持し、FAILEDやUNKNOWNをPASS/完了へ変換しない。画像や自動化の採点を既存6技能へ雑に押し込まない。

Adaptive共通状態は説明希望、前提充足、review requirement、難易度/variantの選択receipt候補。具体的なAIの短縮課題や安全基礎優先はPackage Policy。現在のSHORT/HintはKEEP。短い課題へ変更してもobjective/criteriaを失わない。Learning MemoryはEvent/Assessment/Goal/Planを根拠にした投影で、LLMが未検証の習得/性格を正本として追加する構造にはしない。

## 期間移行案

学習Plan完了とEnrollment契約終了を分離する。学習Goal到達だけで契約/通知/Retentionを自動変更しない。OPEN_ENDEDは無制限無料提供や保持無期限の承認を意味しない。

旧AI V1の30日定義/既存Assignment display/評価Ruleは固定維持。新しいGoal型学習は独立した公開版と対応契約を設計し、旧V1と並行させる。module識別を名前推定/完全一致拒否の削除で緩めず、server-ownedの許可版対応を別PRで設計する。新module keyが必要かは未確定。

既存Offering starts/ends、Enrollment starts/ends、購入期限、本人アクセス、LINE送信Gate、lifecycle、expiry、Retention endedAtを別々に検証する。GoalのdueAtを延長しただけで受講期限を延長しない。新しい達成判断には証拠と人間レビューを必要とする。旧期間の一括書換、既存購入者の自動移行は行わない。

## 現行責務のLayerと変更分類

候補分類はファイル移動の指示ではない。複合modelは一つのLayerへ無理に断定せず、行を分けた。

| model / Repository / Policy / UI                                              | 現在の責務と根拠                       | Target Layer                      | 分類          | 判断                                   |
| ----------------------------------------------------------------------------- | -------------------------------------- | --------------------------------- | ------------- | -------------------------------------- |
| ProgramTemplate/Version、ProgramCoreService、PrismaProgramCoreRepository      | 提供版/募集/認可 E01/E02               | L1既存Program                     | KEEP          | Learning Unit Registryを二重実装しない |
| ServiceProgram/Offering、Support Policy、Program管理UI                        | 企業提供と契約 E02/E07                 | L3（共通実装は既存Program）       | KEEP          | Package有効化とService公開は別         |
| ProgramEnrollment、ProgramRuntimeRepository                                   | 受講/実行 E02/E03                      | L1既存Program                     | KEEP          | 期限/購入者を迂回しない                |
| Assignment/Event/ProgressSnapshot/Audit                                       | 履歴・実行projection E03               | L1既存Program                     | EXTEND        | 必要な学習参照receiptだけ              |
| TrainingParticipantProfile / PrismaTrainingParticipantProfileRepository       | 共通ペースとAI選定入力混在 E06         | L1候補+L2                         | EXTEND        | 正本は維持、typed projection分離       |
| ProfileのdailyMinutes/履歴参照                                                | 非AIでも意味共通 E06                   | L1候補                            | MOVE候補      | 移動は第二Package実需で再判断          |
| ProfileのAI経験/用途/AI theme                                                 | AI知識 E06                             | L2                                | KEEP          | Tool fieldをCoreへ追加しない           |
| ProgramMemberGoal / ProgramGoalsService                                       | Goal履歴と数値 E07                     | L1既存Program                     | EXTEND        | semantic版/本人確認とPlan参照          |
| learning-catalog / initial setup UI                                           | AI Goal/用途固定選択 E04/E06           | L2                                | EXTEND        | 学習相談専用入口                       |
| LearningPlan/相談receipt                                                      | 調査範囲で不足 E04〜E07                | L1候補/L2入口                     | NEW           | 新規責務だけ、巨大chat基盤なし         |
| NextActionPolicy/Decision                                                     | 選定契約 E03                           | L1既存Program                     | EXTEND        | Plan inputの最小投影                   |
| AiTrainingV1Policy / AiTrainingParticipantService                             | AI key/rulesと実行接続 E04/E05         | L2                                | EXTEND        | 旧Rule維持、新Plan接続                 |
| Runtime state/candidate/decision Repository                                   | Package scope投影/persist E05          | L2のPort実装（DB層）              | KEEP          | ORMをCoreへ持ち込まない                |
| mission-quality / Learning Catalog                                            | AI教材とcriteria E08                   | L2                                | EXTEND        | 新領域は別版                           |
| skill-evaluation / evaluator / evaluation Job                                 | AI Rubric/Providerと非同期処理 E08/E09 | L2/外部Adapter、Jobは既存共通     | EXTEND        | 共通resultとAI採点を区別               |
| TrainingSupportSkill/Version/Activation / lifecycle Repository / skills管理UI | Service-owned支援手順 E16              | L2の資産+L3所有                   | KEEP          | Learner習熟Skillへ統合しない           |
| barrier / personalization                                                     | AI具体例/short Rule E06/E10            | L2                                | EXTEND        | 学習目的固定、代行しない               |
| Toolkit / growth Repository / 本人UI                                          | 本人回答保存/能力表示 E11              | L2、Progress参照はL1              | EXTEND        | 完了数levelと能力を分離                |
| LINE scheduler/Deep Link                                                      | 既存通知とAI対象選定 E12               | L3設定+L2選定                     | KEEP          | 新通知基盤なし                         |
| training管理/metrics/pilot analytics                                          | Service本人進捗と限定指標 E13          | L3                                | EXTEND        | 相談本文を読まない                     |
| lifecycle/period/expiry/retention/本人Export・削除                            | 受講とAI個人データ E14/E15             | 既存L1契約+L2処理/L3運用          | EXTEND        | 新Plan/Memoryの消去inventory           |
| BunshinMemory Repository/UI                                                   | Bunshin所有 E17                        | Personal Learning外の既存Platform | KEEP          | 暗黙共有禁止                           |
| READY_TO_USE/30日固定文言・一部業務改善教材                                   | 新方針と再評価 E04/E08                 | L2                                | DEPRECATE候補 | 既存V1削除せず新版で判断               |
| OEM独自教材の横断共有/販売                                                    | 追加契約/権利不明 E02                  | L3候補                            | UNKNOWN       | Builder/Marketplaceを作らない          |

## 仮想第二Packageによる設計検証

実装なしの思考検証であり、教育専門家や実顧客による検証済みとは扱わない。

| 同じ契約の項目       | AI Training                                | 仮想Sales Training                         |
| -------------------- | ------------------------------------------ | ------------------------------------------ |
| packageRef           | AI_TRAINING / 教材版                       | SALES_TRAINING / 教材版（仮想）            |
| Goal                 | 画像生成を学ぶ                             | ヒアリング力を高める                       |
| Skill refs           | AI:Prompting / AI:ImageGeneration          | SALES:Questioning / SALES:ProblemDiscovery |
| Unit ref/title       | AI:IMAGE_PROMPT_BASIC / 画像生成Prompt基礎 | SALES:HEARING_BASIC / ヒアリング基礎       |
| objective            | 条件と確認手順を指定できる                 | 現状/課題を確認する質問を作れる            |
| prerequisites        | AI Literacy/Safety基礎                     | 傾聴/質問基礎                              |
| evaluation reference | AI PackageのPrompt基準版                   | Sales Packageのヒアリング基準版            |
| Plan/Router共通結果  | 未完了・前提充足Unit選定/復習              | 同じ状態契約、異なるPolicy                 |
| scope                | 認可済みService/Enrollment/User            | 同じ境界、学習履歴は共有しない             |

この例ではCore fieldにPrompt条件/CTA/Closing等がなくても表現できる。意味をopaqueなPackage参照に残すことにより、学習計画保存・履歴・版・前提確認は共通候補になる。しかし採点/Skill体系/具体的復習内容の共通化は証明していない。将来Sales専用RuleをCoreへ押し込む必要が出れば、その案は棄却する。

## Content Factoryと承認Gate

将来の流れはTraining Package→Learning Gap→Content Specification→Draft→Validation→Human Approval→Package Library。Codex等は教材/Manual支援だけ。完成画像/動画/プログラム、個社自動化、ユーザー環境設定には使わない。既存支援契約を教材全般へ自動拡張せず、個人由来情報の共有/Provider送信は別承認とする。

AI V1が学習Loopを実証する前に実装しない。Factory完成も自動公開/本番変更の許可ではない。Draft/Validation/Approval/外部実行/PR/Merge/Deployは別権限。Plugin、SDK、Dynamic Schema、Marketplace、未使用Extension Point、汎用教材Editorは対象外。
