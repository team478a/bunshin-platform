# パーソナルAI研修のGap Analysis

- 基準commit: `9e063dd8ebc905b91b005bc317c43797e22a6931`（latest main取得時）
- 調査日: 2026-10-06（Asia/Tokyo）
- 範囲: [現状監査](01_AI_TRAINING_PERSONAL_LEARNING_CURRENT_STATE.md)のE01〜E17。E番号はファイル・model・関数・API・UI・testへの根拠参照。
- 状態: Proposed。分類は実際のMOVE/共通化・本番操作の承認ではない。未確認の運用条件はUNKNOWN。

## 判定と共通化条件

A=そのまま再利用、B=既存拡張、C=新規責務、D=Learning Firstでは不要/非推奨。複合機能は共通契約とPackage内容を分けて判定する。Architecture Scope=COREは所属確定ではなく候補を含み、既存Program Runtime再利用は明記する。

新共通Core候補は、(1) AI以外でも意味不変、(2) Package知識不要、(3) 状態遷移・責務共通、(4) 既存Programに同責務なし、(5) Packageが不自然にならない、の全5条件で判断する。既存Program責務は新Coreを作らずEXISTING_PLATFORMとする。NOWも「承認後の最小実装」であり今回実装しない。

## Gap一覧

優先度P0は境界と移行前提、P1は最初の学習Loop、P2は品質拡張、P3は実証後。Riskは共通化の危険、実装安全性とは別。横長の表は全必須列を維持するための比較表である。

| 機能                                  | 目標状態                     | 現状                                 | 判定 | 再利用する既存機能               | 不足                           | 推奨対応                            | 根拠ファイル/API/model/test | 優先度 | 依存関係                 | リスク                   | Architecture Scope | Reuse Potential   | Generalization Risk | Generalization Timing |
| ------------------------------------- | ---------------------------- | ------------------------------------ | ---- | -------------------------------- | ------------------------------ | ----------------------------------- | --------------------------- | ------ | ------------------------ | ------------------------ | ------------------ | ----------------- | ------------------- | --------------------- |
| Learning First境界                    | 教える・本人実践             | 業務改善例/完成品modeあり            | B    | Catalog/Support Policy           | 学習依頼分類                   | Scope拒否/変換規則を先行            | E04/E08/E16                 | P0     | 人間方針承認             | コンサルへ逸脱           | AI_PACKAGE         | AI_ONLY           | HIGH                | NOW                   |
| Learner共通Profile                    | ペース/希望/説明方法         | AI Profileに混在                     | B    | Profile/Preference               | 共通とAI経験分離               | scope付きtyped projectionから開始   | E06/E07                     | P1     | Scope/Privacy            | 巨大JSON/暗黙共有        | CORE               | CROSS_TRAINING    | MEDIUM              | NOW                   |
| AI Package Profile                    | Tool/AI経験                  | 2 level/用途等                       | B    | TrainingParticipantProfile       | Tool別経験/Version             | bounded AI専用契約を別定義          | E06                         | P1     | 共通Profile投影          | Provider名をCoreへ混入   | AI_PACKAGE         | AI_ONLY           | LOW                 | NOW                   |
| Learning Goal V2契約                  | 本人確認/履歴/優先Goal       | 汎用数値Goal/旧Goal取消履歴          | B    | ProgramMemberGoal                | semantic version/希望正規化    | 既存ID参照、active Goalを限定       | E07/E06                     | P1     | Scope/Privacy            | Goal二重正本             | CORE               | CROSS_TRAINING    | MEDIUM              | NOW                   |
| AI Goal正規化                         | 自由希望→AI学習目標          | 固定5 key                            | B    | learning-catalog                 | 新テーマ/曖昧依頼確認          | AI例・対象外変換はPackage           | E04/E06                     | P1     | Goal契約/Scope           | 自動断定                 | AI_PACKAGE         | AI_ONLY           | LOW                 | NOW                   |
| Learning Consultation                 | 学習専用入口                 | 初期フォーム/回答のみ                | C    | 認可/本人UI/評価ではない         | 相談状態/Goal確認              | 短い相談→確認、汎用chatなし         | E05/E06/E09                 | P1     | Scope/Goal               | 相談本文漏えい           | AI_PACKAGE         | AI_ONLY           | MEDIUM              | NOW                   |
| Learning Scope共通結果                | 学習/対象外等の判定receipt   | 専用契約未確認                       | C    | Version/Validation習慣           | reason/判定版/確認             | 小さな純粋契約候補                  | E03/E16                     | P0     | 分類境界承認             | 判断エンジン過剰化       | CORE               | CROSS_TRAINING    | MEDIUM              | NOW                   |
| Personal Learning Plan                | Goal→経路/再計画             | Policy次Actionだけ                   | C    | Template版/Assignment/Goal       | Plan revision/本人確認         | 新規責務だけ契約化                  | E03/E04/E07                 | P1     | Goal/Unit参照            | Runtime二重化            | CORE               | CROSS_TRAINING    | MEDIUM              | NOW                   |
| Router共通契約                        | prerequisite/完了/復習→候補  | NextActionPolicy既存                 | B    | NextActionPolicy/Decision        | Plan/技能参照                  | 既存Portへ最小入力追加              | E03/E05                     | P1     | Plan/評価                | 汎用Framework化          | CORE               | EXISTING_PLATFORM | MEDIUM              | NOW                   |
| AI Learning Policy                    | AI基礎/安全/復習優先         | AiTrainingV1Policy rules4            | B    | 同Policy/mission key             | Plan読み取り/新題材            | keyとRuleはPackageに残す            | E04/E05/E08                 | P1     | Router契約               | CoreへAI key埋込         | AI_PACKAGE         | AI_ONLY           | LOW                 | NOW                   |
| Learning Unit共通参照                 | package/id/version/前提      | Program定義にkey/phase               | B    | TemplateVersion/Mission          | objective/skill/evaluation参照 | wrapper参照案、単独Registry先行なし | E01/E08                     | P1     | Plan最小要件             | version二重化            | CORE               | CROSS_TRAINING    | MEDIUM              | NOW                   |
| AI Learning Library                   | 版固定教材と安全基準         | quality/catalog固定配列              | B    | quality/catalog/Support手順      | 新題材/内容版対応              | 明示版付きAI教材から                | E08/E16                     | P2     | AI V1実証                | Support Skillと混同      | AI_PACKAGE         | AI_ONLY           | LOW                 | AFTER_AI_V1           |
| Skill共通契約                         | 定義/Version/習熟evidence    | 6技能JSON+Rule版                     | B    | score投影/Event                  | skill ref/version/証拠         | 新Registryでなく参照契約            | E06/E08/E11                 | P2     | AI V1/評価               | 点数だけの習得保証       | CORE               | CROSS_TRAINING    | HIGH                | AFTER_AI_V1           |
| AI Skill Map V2                       | Literacy/Safety/Image等      | Prompt実務6技能                      | B    | 6技能/quality                    | 新領域taxonomy                 | AI PackageのVersioned体系           | E08/E11                     | P2     | 学習目標/教材            | enum乱立                 | AI_PACKAGE         | AI_ONLY           | LOW                 | AFTER_AI_V1           |
| Assessment共通実行                    | Result/Revision/Status/Audit | 非同期Job/回答状態                   | B    | Job/Answer/Event/AiUsage         | rubric ref/結果版              | 学習評価contractのみ、採点はPackage | E09/E08                     | P2     | Unit/Skill参照           | 凡庸な一律PASS           | CORE               | EXISTING_PLATFORM | HIGH                | AFTER_AI_V1           |
| AI Rubric V2                          | テーマ別基準                 | 6技能/60点Domain判定                 | B    | evaluator/finalize               | Image/Automation基準           | 専門教材と評価者レビュー            | E08/E09                     | P2     | AI Skill Map             | 未妥当評価の確定         | AI_PACKAGE         | AI_ONLY           | LOW                 | AFTER_AI_V1           |
| Adaptive共通状態                      | 復習/前提/難易度状態         | SHORT/EASY/WAIT等                    | B    | Assignment variant/Event         | 説明/再説明の希望              | 状態契約候補、ruleはPackage         | E05/E10                     | P2     | Plan/Skill               | 異ジャンルへの同じRule   | CORE               | CROSS_TRAINING    | HIGH                | AFTER_AI_V1           |
| AI Adaptive Policy                    | 基礎/安全/Prompt復習         | 決定的Barrier/難易度                 | B    | resolveTrainingBarrierAdjustment | 前提技能/説明差分              | 同目的を保持して拡張                | E05/E10                     | P2     | AI V1実証                | 短縮で目標喪失           | AI_PACKAGE         | AI_ONLY           | LOW                 | AFTER_AI_V1           |
| Learning Memory                       | 学習履歴/希望/苦戦の投影     | Event/Profile/Snapshot               | B    | 既存イベント/投影                | 正本対応/消去/新しい希望       | 派生read model、全文再保存なし      | E03/E06/E15/E17             | P2     | Privacy/Plan             | Bunshin Memoryへ越境     | CORE               | CROSS_TRAINING    | HIGH                | AFTER_AI_V1           |
| Progress/Growth                       | 能力と学習証拠の表示         | 6技能+完了数level                    | B    | buildTrainingGrowthSummary       | Goal達成/未評価表示            | countと習得を分離                   | E11/E08                     | P2     | Skill/Assessment         | 過大な習得表現           | CORE               | CROSS_TRAINING    | MEDIUM              | AFTER_AI_V1           |
| Enrollment/Assignment/Event/Audit     | 実行正本一つ                 | 共通Programあり                      | A    | 同model/Repository               | 新規Core不要                   | KEEP、参照のみ追加                  | E01/E02/E03                 | P0     | なし                     | 契約期限の迂回           | CORE               | EXISTING_PLATFORM | LOW                 | NOW                   |
| Goal型期間/終了                       | 学習達成とアクセス期限を分離 | OPEN_ENDED契約/AI30日固定            | B    | Offering/period/lifecycle        | AI採用版互換/達成条件          | 新版並行、旧受講非変更              | E01/E02/E14                 | P0     | 法務/版識別承認          | 無断延長/Retention誤起算 | AI_PACKAGE         | EXISTING_PLATFORM | HIGH                | NOW                   |
| Branding/LINE/Operator設定            | 既存提供責任を維持           | Service/Program管理あり              | A    | Service/OEM/LINE                 | 独自教材範囲は未確定           | 既存scopeを使う                     | E02/E07/E12                 | P0     | 管理権限                 | 外部公開/誤配信          | SERVICE            | EXISTING_PLATFORM | LOW                 | NOW                   |
| Privacy/法人管理                      | 本文非公開/最小指標          | SQL投影/本人消去あり                 | B    | E13/E15                          | 新相談/Plan対象追加            | inventoryと小集団方針承認           | E13/E15                     | P0     | データ保持承認           | 個人の推認/コピー残存    | SERVICE            | EXISTING_PLATFORM | MEDIUM              | NOW                   |
| Support手順Skill                      | 人間承認の限定支援           | Service Registry実装                 | A    | Skill Lifecycle/Exposure停止     | Library転用の妥当性            | KEEP、習熟Skillと区別               | E16                         | P2     | Learning First再レビュー | 未使用Extension先行      | AI_PACKAGE         | AI_ONLY           | HIGH                | AFTER_AI_V1           |
| Content Factory/Codex教材             | Gap→仕様→Draft→承認→版       | pure支援契約/Registry、Codex接続なし | C    | validation/人間承認              | 教材spec/品質/非個人化         | AI Loop実証後のみ検討               | E16                         | P3     | AI V1完成/予算           | 本文送信/自動登録        | AI_PACKAGE         | CROSS_TRAINING    | HIGH                | AFTER_AI_V1           |
| 第二Package/OEM教材Editor             | 実需に基づく横展開           | Program提供基盤はある                | C    | Service/Version/権限             | 実需/契約/教材権利             | 第二Package時点で共通性確定         | E01/E02/E07                 | P3     | 第二商品承認             | Marketplace先行          | SERVICE            | CROSS_TRAINING    | HIGH                | AFTER_SECOND_PACKAGE  |
| 成果物代行/コンサル/汎用chat/自動実装 | 提供しない                   | READY_TO_USE等と文言のずれ           | D    | 学習例だけ再レビュー             | 境界監査                       | 新機能化しない、既存削除も別承認    | E04/E08/E16                 | P0     | 人間レビュー             | 学習価値の喪失           | AI_PACKAGE         | AI_ONLY           | HIGH                | NOT_RECOMMENDED       |
| Provider/Backupの完全消去保証         | 契約に基づく保証             | local処理では証明不可                | C    | Export/削除inventory             | 実契約/運用証跡                | UNKNOWN、保証を表示しない           | E09/E15                     | P0     | 法務/運営確認            | 誤った消去保証           | UNKNOWN            | UNKNOWN           | HIGH                | NOT_RECOMMENDED       |

## 主要機能の2つの判断

| 機能群                             | 今AI研修に必要か                 | 本当にAI固有か                                          |
| ---------------------------------- | -------------------------------- | ------------------------------------------------------- |
| Profile/Goal/Plan                  | はい。Phase 1最小Loop            | 共通状態/参照は非固有。Tool経験/目標変換はAI固有        |
| Consultation/Scope                 | はい。入口でLearning Firstを守る | 結果envelopeは非固有。今回の入口・変換/拒否規則はAI固有 |
| Router/Unit参照                    | はい。既存Runtimeへの接続        | 選定Port/参照は非固有。AI基礎優先/keyはAI固有           |
| Skill/Assessment/Library           | 既存でV1を始め、新領域はPhase 2  | 型/証拠は非固有。技能名/教材/RubricはAI固有             |
| Adaptive/Memory/Progress           | 既存を使用、拡張はLoop実証後     | 状態/投影は非固有。短縮規則/能力意味はPackage固有       |
| 期間/Privacy/Enrollment            | はい。移行/相談前のP0条件        | Enrollment/個人境界は既存共通。AI30日制約は固有         |
| Content Factory/第二Package/Editor | 今は不要                         | 教材内容はPackage固有。共通性確定は将来                 |

## 最も大きいGap 5件

1. Learning Scope GuardとLearning First文言/教材/支援modeの不一致。
2. 自由な学習希望→本人確認Goal→Revision付きPlanの正本がない。
3. Planと前提技能を既存Policy/Assignmentへ安全に接続する契約が不足。
4. 新テーマのAI Skill Map・Library・テーマ別Rubricが不足。
5. 学習達成と契約期限/終了/Retentionの分離、相談/Planを含むPrivacy移行が未設計。

名前検索で見つからなかった責務を全Repositoryに存在しないと断言しない。実本番の第二Package需要、教材権利、評価妥当性、少数集計閾値はUNKNOWN。未確認はPASSEDへ変換しない。
