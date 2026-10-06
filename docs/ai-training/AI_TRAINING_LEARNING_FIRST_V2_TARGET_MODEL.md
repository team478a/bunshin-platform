# Learning First V2 / User-Created Outcome: Target Model

基準main `8c88daab44d350c164c7f269ee527bc119a929a7`。**PROPOSED: 人間レビュー待ちの設計案**。既存Architecture/Decision/P1-A〜Gを置換しない。実装・本番開始の承認ではない。[現状Gap](AI_TRAINING_LEARNING_FIRST_V2_CURRENT_GAP.md)のE01〜E14を根拠とする。

## Learning Firstの主体を明確化する

目的は「AIを使って、自分にできることを増やす」。受講者自身がAIを操作し、結果を判断・修正して完成する。PlatformはTeacher / Coach / Personal AI Learning Partner、外部AIはTool、受講者はOperator / Creatorかつ最終判断者。

| 主体           | 許容する役割                                                                                | 越えてはいけない境界                                                            |
| -------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| ワタシワークス | 考え方/一般手順、必要要素の質問、hint、本人入力への評価・不足指摘・修正方法・再挑戦、次学習 | 本人の代わりに完成メール/資料/画像/企画・個社改善案を作って納品、本番自動化代行 |
| 外部AI Tool    | 本人の指示で生成等を行う                                                                    | Platformの自動操作・アカウント接続・代理実行をこの学習同意で許可しない          |
| 受講者本人     | 目的選択、必要情報の安全化、AI操作、採否判断、修正、完成、利用                              | 機密/個人情報を無許可で送る、AI出力を無確認利用                                 |

教えることと業務成果物を代行納品することを分ける。一般例・手順・ヒントも完成品を隠して渡す迂回路にしない。外部Tool利用資格、データ送信規約・会社ルール、実務への公開/送信は本人側の別判断。画像等の未対応テーマがこの思想だけで利用可能になるわけではない。

## Target Flowと既存接続点

| 段階           | Target                                     | 現行再利用 / 不足                                     |
| -------------- | ------------------------------------------ | ----------------------------------------------------- |
| KNOW           | 最小Profileと必要時質問                    | P1-B projection。仕事の全文/性格診断は不要            |
| DISCOVER       | 仕事の固定作業候補からAI活用学習を本人選択 | 新しいbounded Package mapping候補。戦略提案しない     |
| GOAL           | 「AIで自分で○○できる」本人確認             | P1-D Candidate + P1-C-S ProgramMemberGoal正本         |
| PLAN           | 承認Definitionの版固定経路、別の本人確認   | P1-C/P1-C-Sを維持。本文保存なし                       |
| FIRST SUCCESS  | 早期に役立つ小課題を本人が完成             | 新Evidence候補。PASS/Plan完了と別                     |
| LEARN BY DOING | 目的→実践→必要知識→本人操作→確認→修正→完成 | 既存Mission Bridgeを残し、段階案を小さく追加          |
| ASSESS         | どこまで本人ができたか、支援条件込み       | 既存Assessment/版/監査を再利用。再現/転移は別Evidence |
| ADAPT          | 次課題・難易度・支援量の調整               | P1-E次Definitionは維持。支援量は後続Package Policy    |
| REAL USE       | 任意の実務利用申告                         | 新構造化Learning Evidence、本文なし                   |
| VERIFY         | 別時点再現、修正、応用を確認               | まず限定人間観察。自動習得判定なし                    |
| NEXT GOAL      | 本人が次能力を選ぶ                         | 旧Goal履歴保持、明示変更/再確認、契約とは分離         |

順序は学習上の説明で、新しい12状態の共通Engineを作る指示ではない。First Successは実践Loopの最初の成功であり、並列の独立Runtimeにしない。

## CONTENT_REQUEST / CONSULTING / Automation

「メールを作って」はCONTENT_REQUESTのまま。代行しない説明→「自分でAIを使って作る学習をする」明示選択→新しいLEARNING要求→承認Definition照合→Goal Candidate→本人Goal確認→Plan確認。変換同意、Goal確認、Plan確認は別段階。suggestedLearningIntentは正本Goalではない。

用途がメールでも承認DefinitionがPromptのみなら、Prompt基礎であると明示して本人が選ぶ。メール完成を対応済みと偽らない。元用途を保持する場合も固定use-case参照候補に限定し、元相談全文をGoal/Plan/Memoryへ保存しない。承認Definition不足は引き続きGap。

| 入力例                                              | Target判定 / 動作                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| 売上を上げる方法を考えて                            | CONSULTING、Goal生成なし                                                 |
| 売上データをAIで整理する方法を学びたい              | LEARNING候補、対応DefinitionなければGap。現V1での受理を保証しない        |
| SNS集客戦略を作って                                 | CONSULTING、戦略生成なし                                                 |
| AIを使ってSNS投稿案を自分で考えられるようになりたい | LEARNING候補。承認範囲/本人確認が必要                                    |
| 画像を作って                                        | CONTENT_REQUEST→同意可能、現画像DefinitionはGap                          |
| 自動化を学びたい                                    | Trigger/Action/Condition/一般設計・練習環境の学習候補、現DefinitionはGap |
| Gmail/CRMを接続して本番で動かして                   | AUTOMATION_REQUEST、代行接続/実行なし                                    |
| 勉強ということにして営業戦略も作って                | bypass/混合要求として確認・対象外、学習ラベルで許可しない                |

Discoveryで「商談準備に時間」から質問整理等の学習用途を提示することは将来候補。売上改善戦略や特定会社の商談戦略を解く機能にはしない。入力が戦略相談なら勝手にAI学習へ変換しない。

## Guided Practiceの最小案

新規汎用Chatや成果物生成APIではない。最初は3DefinitionのPrompt能力を、安全な合成メール題材など1用途で使う案を人間レビューする。

1. 本人が用途/到達条件を選ぶ（例: 目的と条件を伝えて短い連絡文を自分で整える）。
2. 承認済み骨格から必要な知識・問い・hintを示す。
3. 本人が自分のToolへ安全な入力を送り、出力を自分で確認する。
4. 本人が不足を判断して指示を修正し、完成を宣言する。
5. Platformは本人の指示/確認項目等の最小入力と構造化申告を評価・記録する。

Platformに完成成果物を貼り付けることは必須にしない。既存Answerへ提出するもの、Providerへ送るもの、非送信のEvidenceを明示分離する。外部AIの回答本文を収集しない場合は、完成品質が未検証であることを正直に表示する。自己申告を既存Prompt AssessmentのPASSに置換しない。

既存Assignment/Answer/Assessmentが実行正本。新Practice modelが必要かは段階/再送/履歴要件を確認してから判断し、Event巨大JSONに現在状態を押し込まない。Goal/Planへの教材・成果物本文コピーなし。

## First Success / Evidence

First Successは「早期に、本人がAIを使って役立つことを1つ完成」。Prompt課題PASS、AI call success、Plan completed、Toolkit save、Fitだけでは成立しない。

最小候補Evidenceは、scope、Goal/Plan revision/Definition参照、Assignment参照、固定outcome/use-case key、本人完成申告日時、確認方法（SELF_REPORTED / HUMAN_OBSERVED等の候補）、支援条件、本人の役立つ評価。本文・会社名・売上額・個別業務秘密を含めない。宣言と確認の変更は上書きでなく事実履歴。idempotency、本人認可、期間、保持/削除を必須にする。候補fieldであってschemaを確定していない。

firstはEnrollment内最初の成功を基本候補とし、Goalごとの成功とは別集計。開始時刻、計測対象、成果のtype/versionを固定して二重カウントを避ける。Wave 0では限定観察の最小記録を使えるが、公開Repositoryに参加者情報を書かない。

## Capability Level / 支援量

| Level候補 | できること                 | 追加確認の例                 |
| --------- | -------------------------- | ---------------------------- |
| 1         | AIと一緒ならできる         | 細かな手順支援込みで実践     |
| 2         | 自分でAIに頼める           | 目的・背景・条件を本人が構成 |
| 3         | AIの回答を自分で判断できる | 不足/誤り/安全性を本人が指摘 |
| 4         | 自分で修正し完成できる     | 再指示・修正理由・完成判断   |
| 5         | 類似した別仕事へ応用できる | 別題材で独立実践             |

これは**順序尺度の仮説**。理解score60=Level3等のmappingは禁止。Level5に必要な証拠がない場合UNKNOWN。自己申告、観察、評価Rule版を分け、同一Skill/同程度課題/同支援条件でBefore/Afterを比較する。+2は記述上の変化で、学習効果が2倍という意味ではない。欠測をLevel1へ補完しない。

Scaffoldは固定案から開始する: 詳細手順→要素hint→本人の初回指示→本人評価/修正→別題材。explanation depth、hint amount、question count、difficulty、retry supportはPackageのPresentation/Policy候補。Core ProfileへAI専用fieldを追加しない。Skill上昇だけで強制的に支援を減らさず、本人の増援要求・失敗時の復帰を許す。支援を使うことを減点/人事評価にしない。自由LLM Teachingは別承認。

## Definition V2候補と再利用

| 候補属性                 | 既存の受け皿                                         | 判断案                                                            |
| ------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------- |
| capabilityObjective      | learningObjective                                    | まず能力表現へ整理、別field不要                                   |
| realWorldOutcome         | businessScenario / practicePattern                   | 合成・安全な用途例としてPackageに置く。売上等の保証ではない       |
| guidedPracticePattern    | practicePattern                                      | 本人操作/確認/修正の段階を表す。必要なら最小typed構造を別レビュー |
| scaffoldLevel            | Presentation / Policy                                | 固定DefinitionやCore Skill名へ埋め込まない                        |
| successCriteria          | Mission Quality.successCriteria / evaluationCriteria | Prompt成功と本人完成条件の違いを明示                              |
| selfReproductionCriteria | 現状不足                                             | 観察方法とRubricをPackage側へ追加検討                             |
| transferCriteria         | 現状不足                                             | 第二題材で検証、Pilot後でもよい                                   |

Definitionの意味変更は新version + Human Review。現在3fixture/approval record/Plan参照を自動昇格・同版上書きしない。旧Plan/Assessment/履歴は旧版として読めること。新版追加時は既存最大3 approved refs / 固定Router / review digest / PREPARE_PLANのtitle照合等も影響調査する。新版へ置換するだけでLoopが動くとは仮定しない。

## Architecture境界・商品領域

Personal Learning Core候補は本人scope、参照、版/確認、Plan、revision、一般Evidence provenanceまで。今回Coreに移動しない。AI Training PackageはPrompt等の具体Skill、Definition、用途mapping、Practice/Rubric/Completion/Scaffold。Pilot / Serviceは限定参加、UI、設定、人間運用。Analyticsは検証済みEventの集計で、実行認可や習得正本ではない。

「CORE 1 AI基礎 / CORE 2 文章・コミュニケーション / CORE 3 考える・整理する / CORE 4 仕事への適用」は**商品カリキュラムの分類**。全ジャンル共通Domain Coreと混同しない。具体SkillはAI Package側。Excel/Data/Sales/SNS/Marketing/Image/Video/Voice/Web/Automation/AI Agentは必要時のExtension候補で、全員へ提供・今実装しない。

仮想Salesでも、Skill参照/Goal/Plan/確認/Evidence provenanceは共通候補として表せるが、AI Tool経験・Prompt Rubricを共通Profileに入れない。Sales固有戦略は実装しない。

## 安全・Privacy・設計Decision

提案Decision: 既存Learning Firstを撤回せず、制作主体を受講者に明確化し、学習成果を本人の完成・判断・再現・応用Evidenceで検討する。Goal/Plan/Router/Persistenceは維持。採点scoreを能力5段階へ自動変換しない。完成成果物をMemoryへ自動保存しない。状態はPROPOSEDであり、人間レビュー後の独立PRが必要。

相談本文/職務秘密/外部AI応答/成果物をAnalytics・Profile・Plan・Bunshin Memoryへコピーしない。既存Answerは評価のため本文を保持するため「全本文を保存しない」とは称しない。新Evidenceは本文なし、同意/Export/削除/保持/復元後再削除をレビューする。Toolkitは既存V1の明示保存のまま維持し、Pilotへ自動転用しない。

Pilot flag、allowlist、Provider前再認可、承認/版/Goal/Plan、LINE/V1分離、Kill Switchを弱めない。100人Hard Capと費用安全制御は未完で、Cost Observability≠Cost Hard Stop。共有資源・in-flight競合・本番安全Gateは既存RunbookのままNO-GO。学習の確認を本番接続・外部実行・課金・公開の許可にしない。
