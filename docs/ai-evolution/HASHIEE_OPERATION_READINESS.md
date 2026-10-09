# ハッシー 実運用判定

監査基準・本番SHA・検証範囲は[統合監査](INTEGRATED_READINESS_AUDIT.md)。**100社一括開始はNO-GO、少数限定の実利用検証はCONDITIONAL GO**。機能欠落を推測するのではなく、規模と実利用に必要な証拠不足を区別する。

## 一連のフロー

| 段階 / 確認事項      | 現行経路・根拠                                                                                                                                                                                  | 判定 / 次回反映・限界                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 企業登録・初期設定   | Service参加、Business Profile、Social Profile/Strategy/Content Pillar。`apps/web/src/services/public-service.ts`、`service-generation-knowledge-loader.ts`、`daily-mission-planning-context.ts` | 実装済み・実利用未確認。初回に欠損したStrategy/Weekly/Pillarがあると生成できない。初心者の迷い/離脱はUIの存在から判断しない |
| 企業情報保存→生成    | `daily-mission-generation.ts` → `buildDailyMissionPersonalizationBase`。Business Profile / 承認Knowledge / scope付きMemoryをPlannerとContentへ渡す                                              | 実装済み・合成確認。登録済み情報の利用であり、未登録の価格/実績を事実として補完しない                                       |
| 投稿テーマ・文章     | `runDailyMissionBriefGeneration` → Decision Content Orchestration、既存Quality Gate。`daily-mission-decision-context.ts` / `capability-social/src/social-decision-context.ts`                   | 実装済み・合成確認。生成日・最近のテーマ/形式・Goal/Weeklyを入力。品質/実行条件不明は安全PASSにしない                       |
| 採用・不採用         | `capability-social/src/mission-engagement.ts`、`summarizeMissionLearningHistory`（web services `daily-mission-learning-history.ts`）                                                            | 理由保存・単発/反復の区別・feedbackSummary作成を確認。採用は投稿実施でない                                                  |
| 本人による投稿・結果 | `capability-social/src/mission-outcomes.ts`、`social-decision-planner.ts` のoutcome入力、WeeklyのPerformance                                                                                    | 本人の投稿記録/手入力。SNS自動公開・全投稿の外部照合・成果実測を保証しない                                                  |
| 次回提案             | `daily-mission-generation.ts` はfeedbackSummary/behaviorSummary/performanceSummaryをPlannerとContent両方へ渡す。Decision Contextは採否・投稿・元Goalを分ける                                    | 保存だけではなく入力への接続あり。拒否理由に沿った出力改善・採用率改善の実測はUNKNOWN                                       |
| 週間計画             | `weekly-plan-generation.ts`、`OpenAIWeeklyPlanner.generate`、`capability-social/src/weekly-plan-validation.ts`                                                                                  | Goal/直近Performance/履歴を参照。未入力成果を成功と扱わない。実生成の具体性/日次整合は別受入                                |
| 停滞・再開/OEM支援   | `capability-social/src/activity-barrier*.ts`、`database/src/social-activity-barrier-*.ts`、web `social-activity-barrier-*-scheduler.ts`                                                         | 確定した停滞と障害日を区別、支援候補/配信除外ルールあり。実配送・再開効果は未検証                                           |
| LINE・スマホ         | 既存Service LINE/LIFF導線、barrier LINE scheduler、本人Mission画面                                                                                                                              | 認可/対象除外の合成確認。実端末、再ログイン、実送信、初回設定の完走は今回未実施                                             |

Owner KnowledgeとBunshin Memory、別会社/Workspace/User/Serviceを暗黙共有しない。サービスsafe mode・Grant条件も維持する。OEM支援候補は相談/投稿本文の無制限共有を意味しない。

## 重点3条件: ランダムな違いではない個別化

| 条件           | コード・テストの証拠                                                                                                                                       | まだ証明できないこと / 最小受入                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 企業ごとに違う | Business Profile / Goal / 承認Knowledge / Personality入力。`hassy-sns-goal-propagation-characterization.test.ts`、`hassy-goal-differential-rubric.test.ts` | 後者は合成出力fixtureのRubric。実API出力の良さではない。異なる合成企業の条件を一つずつ変え、主題/根拠/CTAの適切な変化と越境なしを人間レビュー |
| 毎日違う       | missionDate/recentTopics/recentFormats、週次計画項目を生成へ渡す。EVO01重複ケース、capability-social回帰                                                   | 日付/言い換えだけでは不足。同一企業の複数日で前日の題材重複・営業目的・曜日経路を確認。過度な新規性で品質を落とさない                         |
| 履歴に基づく   | 採否/理由→feedbackSummary→Planner/Content、投稿と採用は別、元Goal保持。`daily-mission-learning-history.test.ts`、Decision Context tests                    | 同じ条件で「長文不採用」追加前後の出力を比較。未測定実績を断言しない。単発拒否を恒久嗜好として固定しない                                      |

現在のEVO05はマナベル再現性中心。ハッシーの同母数・同期間の提案改善測定は未実装。新Memoryを追加する前に既存要約/テストと上記差分受入を再利用する。

## 100社前の条件

| 必要条件                                    | 現在                                          | 開始前の作業                                                                                                |
| ------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 実認証→初回設定→提案→採否→本人投稿記録→次回 | UNKNOWN                                       | 少数対象でスマホ/LINEを含む受入。実送信/APIは別承認                                                         |
| 個別化3条件・創作防止                       | 合成根拠あり、実出力UNKNOWN                   | 上記差分ケースと人間評価。ランダム差だけを合格にしない                                                      |
| 100社負荷                                   | UNKNOWN                                       | 現行cron/jobの同時数、daily重複防止、待ち時間、Provider失敗・再試行・DB接続上限を隔離環境で検証             |
| 費用                                        | token/cost記録あり、総額UNKNOWN               | PlannerだけでなくContent/Quality/修復/再試行/Weeklyを含む1社1週実測。未価格model/欠落usageは0円でない       |
| 監視・停止                                  | 既存job/usage/ログ、Pilot専用制御は研修のもの | ハッシーにも100人Seat/日次Admissionがあると推測しない。既存Provider/組織quotaの範囲と担当者の停止手順を確認 |
| OEM有料/無料提供                            | main V2あり、本番未配備                       | #1176の別Release Gate。内部検証とOEM請求開始を切り離す                                                      |

本番の既存ハッシー経路は配備コードとして存在するが、全企業設定・実生成・配信の正常性は今回未確認。過去のcron200/エラー0を利用者フロー完走へ読み替えない。

次は新SNS機能の開発ではなく、限定対象の受入証拠を集めて利用不能箇所だけ修正する。SNS自動投稿、画像/動画拡張、全社募集・実送信は本監査の範囲外。
