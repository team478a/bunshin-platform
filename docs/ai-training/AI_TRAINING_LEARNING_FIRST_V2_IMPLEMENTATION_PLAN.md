# Learning First V2 / User-Created Outcome: Implementation Plan

基準main `8c88daab44d350c164c7f269ee527bc119a929a7`。**計画のみ・人間レビュー待ち**。[Current Gap](AI_TRAINING_LEARNING_FIRST_V2_CURRENT_GAP.md) / [Target Model](AI_TRAINING_LEARNING_FIRST_V2_TARGET_MODEL.md)。今回作成するのはこの3文書だけ。コード/DB/UI/Provider/Definition追加、本番Migration/deploy/enable/APPROVE、募集は行わない。

## 結論と順序

P1-A〜Gは捨てない。Goal/Plan/確認/保存/Router/Assignment/既存評価は最大限再利用する。V2は本人の実践・完成・再現を上に足す小変更群とする。最優先は「何をもって本人の成功とするか」を人間が決めること。DiscoveryやTeaching生成を先行しない。

1. 人間が3者/境界/成功Evidence/計測分母をレビュー。
2. Production安全残PRと実環境Gateを別系統で満たす。
3. Wave 0は1〜2人・既存3Definition・合成題材・人間観察で仮説を確認。
4. 必要なV2-A/Cを小PRで実装、再確認してWave 1へ。最初の1用途だけ。
5. 能力/実用性Evidenceを少人数で校正して、100人拡大前に必要最小限を確定。
6. 広範Discovery/支援量生成/転移自動判定はPilot後。

Wave 0の手動観察は、未実装の製品機能を実装済みとする代替ではない。実Providerや本番利用はRelease Gate・別操作承認が必要。stagingは任意であり、安全試験の省略ではない。

## 小PR案と完了条件

| PR候補                            | 範囲 / 再利用                                         | 完了・検証条件                                                                               | 時期 / 依存                        | 含めないもの                                      |
| --------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------- |
| V2-A0 主体・境界の明確化          | 文書/必要最小UI文言、既存Learning First               | 本人制作は許容、代行は不許可、3Definition提供範囲が伝わる。境界例をレビュー                  | WAVE_0_REQUIRED / 本計画の人間承認 | Scope緩和/新Definition/Runtime変更                |
| V2-A1 Scope / CONTENT_REQUEST     | E01/E02の決定的Rule・同意・version                    | 能力希望を限定受理、CONSULTING/mixed/bypass回帰、用途維持と承認Gap、conversion≠Goal確認      | WAVE_1_REQUIRED / A0               | 汎用Intent/LLM/成果物生成                         |
| V2-B1 Goalの到達条件              | E02/E04の能力objective/semantic ref/保存              | 成功条件mapping、本人再確認、title照合復元と旧Goal/Plan互換、現承認Definitionのみ            | WAVE_1_REQUIRED / A1とC設計        | 自由Goal生成/二重Goal保存                         |
| V2-B2 AI Capability Discovery     | 固定職種/作業候補→学習用途→Definition lookup          | UNKNOWN/対象外/未承認Gap、個社戦略回答なし、Profile最小投影/質問上限                         | AFTER_PILOT / 限定実践実証         | 全業種/OEM Builder/自由相談/業務分析              |
| V2-C1 Guided Practice最小契約     | E05/E07/E08の3Definition/Assignment/Answer/Assessment | 本人操作・判断・修正・完成の区別、本文非収集設計、retry/idempotency/版/認可回帰、1用途       | WAVE_1_REQUIRED / A/Bレビュー      | 新Provider/自動操作/Tool接続/新Definition大量追加 |
| V2-C2 First Success Evidence / UI | C1 + ProgramActionEvent案、固定選択                   | 自己申告/観察の別表示、first1件の定義/起点、完了≠習得、越境/重複/削除/ログ本文非保存         | WAVE_1_REQUIRED / C1               | session基盤/自動習得/成果物Memory保存             |
| V2-D1 Capability Level Rubric校正 | E06評価を維持、最小Package投影案                      | 支援条件と再現試験、score/level別、UNKNOWN、Rule版・比較可能性、人間との不一致記録           | BEFORE_100_USERS / C少人数結果     | 巨大Skill Engine/人事評価/全Skill一括変換         |
| V2-D2 支援量調整                  | 定型hint/段階的scaffold/本人増援                      | 支援使用Evidence、低下時復帰、本人の再現と支援を分離、アクセシビリティ                       | AFTER_PILOT / D1                   | 自由Teaching生成/Model Router                     |
| V2-E1 Real Use / 再現Evidence     | E10のEvent/idempotency pattern、P1-G関連参照          | USEDとできたを分ける、任意回答/未回答/未利用/対象外、外部本文なし、server gate/Export/削除   | BEFORE_100_USERS / C/Dレビュー     | Toolkitボタン単純復活/自由業務文収集              |
| V2-E2 KPI集計                     | E09/E12のread-only SQL・版/分母・時間窓               | First Success/Goal/Practice/再現/継続/離脱proxy/RETRY/Fit、原価UNKNOWN率を併記、試行重複なし | BEFORE_100_USERS / 対応Evidence    | 新Dashboard/別Analytics正本/全Service横断個人追跡 |
| V2-E3 転移/満足/推奨              | 類似別題材の人間観察/任意選択                         | 直接Evidenceと申告区別、Fitとは別、対象/期間明記                                             | AFTER_PILOT / OPTIONAL             | 応用力の自動推定/大規模アンケート                 |

上記の各候補も変更が大きければcontract→保存→API/UIに分割する。新schemaの必要性はEvidenceの読取・修正・削除・監査要件が確定してから比較する。現在状態の正本を無制限Event payloadへ押し込まず、汎用Learning Memoryや新Assignment正本は作らない。

## Wave別Gate

| 区分             | 必要なV2内容                                                                                         | 別途安全条件                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| WAVE_0_REQUIRED  | 主体/境界の明確化、現能力と限界表示、合成題材の人間観察手順、同意/最小記録、既存Fit/Router/原価観測  | Runbook Gate A〜I。100capを含め既存要件を維持。本番操作・実課金は別承認                                |
| WAVE_1_REQUIRED  | 適切なCONTENT_REQUEST変換、能力Goal、最小Guided Practice/First Success。又は不足を明示しWave拡大停止 | Wave 0実認証E2E、重大Errorなし、Privacy/Provider/Cost正常、人間レビュー                                |
| BEFORE_100_USERS | 能力Rubric校正・再現/実利用Evidence・版付き集計、離脱proxyの限界を明示                               | authority累計/並列/複数Programの人数保証・費用枠・監視・停止再現。これはWave 0安全条件の先送りではない |
| AFTER_PILOT      | 作業Discovery拡張、支援量個別化、session計測、転移評価                                               | 実需要/教育効果・コスト/Privacyを確認して別承認                                                        |
| OPTIONAL         | 推奨意向等の任意Feedback、商品CORE1〜4分類                                                           | 学習体験を複雑化しない、未対応Extensionを公開しない                                                    |

Waveは追加人数、最終100上限。現policyは最大5allowlistであり、Wave 1累計7を現設定で有効化できない。複数Programへ分散して上限を迂回しない。安全PRを先にレビューする。

## Production残作業はV2と混ぜない

#1157はdual flag、fresh Assessment gate、marker消失時fallback拒否、LINE/V1分離を実装済み。運用証拠は未確認。

追加安全PR候補: 旧Work Result/Toolkit APIへPilotのPlan Assignment/Answerで直接アクセスする否定試験を先行し、既存本人認可に加えて未許可Pilot保存・停止中利用・marker消失fallbackを最小拒否する。旧30日V1の明示Work Result/Toolkit利用は維持する。UI非表示だけではserver隔離の証拠にしない。実装は今回行わず、Wave 0前のレビュー項目とする。

- 固定Pilot authority / 累計100 cap / 並列登録拒否 / Privacy削除時の枠方針。
- Pilot限定call admission / 並列・retry・FAILED reset迂回防止。P1-G観測を再実装せず、費用制御と区別。
- trusted本番Definition承認・本人Profile準備入口。既存管理/準備APIの本番拒否を勝手に解除しない。
- 本番Migration pending/Backup/RLS/lock時間/role、共有資源・実Auth、停止/drain rehearsal、Provider model/単価/予算、運用担当と承認証跡。

これらが不足する限りProduction Wave 0はNO-GO。V2文書/テスト成功・PR mergeをRelease Gate PASSとして扱わない。

## 実装PRの共通検証

既存P1-A〜G、Program/Assignment/評価/Skill/Auth/tenant/LINE/V1の回帰を維持。Rule版、Definition版、Goal/Plan revision、承認撤回、対象外Enrollment、marker消失、flag停止、古いJob、外部送信前拒否を試験する。UIはスマートフォン優先、1判断1画面、学習段階/支援/成功の意味を日本語で示す。

新Evidenceはcross-user/workspace/service/enrollment拒否、同一操作の再送、旧履歴保持、本人Export/削除/保持、Analyticsの本文非保存を試験。自己申告だけでAssessment PASSやGoal ACHIEVEDを作らない。PLAN_COMPLETED≠Goal習得≠Enrollment終了を継続する。

教育検証は少数の合成題材と人間観察から始める。実課金・外部Tool・顧客実データの利用は各々別承認。自動テスト合格を教育効果の証明にしない。

## 人間レビューで決める事項 / 停止

1. 最初の合成用途を何にするか（メール例は候補で未承認）。
2. 本人完成申告と観察確認のどちらをFirst Successと呼ぶか、表示/分母/起点。
3. 外部AIを本人が利用できる条件、入力禁止情報・成果物非収集・送信同意。
4. Level仮説/Rubric/再現課題と支援量の校正方法。
5. 現3Definitionで足りるか、新版が必要か。必要なら版/承認/旧Plan互換を独立レビュー。

本PRは調査3文書で停止する。V2-A以降、本番Migration/deploy/enable/承認/参加者作成/課金/募集へ進まない。rollbackはこの文書PRのrevertのみで、実行状態やDBを変更しない。
