# ハッシー 実運用判定

## 判定

- **100社モニター: NO-GO**
- **少数・監督付き検証: CONDITIONAL GO**

重大障害を確定した判定ではなく、100社開始に必要な実生成品質、容量、原価、実端末の証拠が不足しているためである。

## 利用フロー

| 段階               | コード上の接続                                                                           | 利用可否・未検証                                                              |
| ------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 企業登録・初期設定 | Service参加、Business Profile、Social Profile、Strategy、Content Pillar                  | 実装済み。初めての利用者が迷わず完了できるかは実ユーザー未検証                |
| 企業情報保存       | `service-generation-knowledge-loader.ts`、`daily-mission-personalization.ts`             | Profile、Goal、承認Knowledgeをscope付きで利用。別企業/Bunshinの暗黙共有は禁止 |
| テーマ・文章生成   | Weekly Plan、Daily brief/content/quality/rebrief                                         | 実装済み。実AI品質と事実性は未検証                                            |
| 採用・不採用       | `mission-engagement.ts`、理由/詳細保存                                                   | 投稿案の判断として実装。採用を投稿済みにしない                                |
| 本人投稿・結果     | `mission-outcomes.ts`、PostRecord/Activity/Performance                                   | 手入力記録。SNS自動投稿や外部SNSとの完全照合ではない                          |
| 次回反映           | `feedbackSummary` / `behaviorSummary` / `performanceSummary` を次回Planner/Contentへ入力 | 保存だけでなく接続済み。出力改善の実測はUNKNOWN                               |
| 継続支援           | Activity Barrier検出、支援候補、LINE scheduler/除外                                      | 実装済み。実配送、再開率、誤通知は未検証                                      |
| LINE・スマホ       | Service画面、LINE導線、本人Mission UI                                                    | 合成境界テストあり。実LIFF/端末/再ログイン/送信は未実施                       |

主な根拠は `apps/web/src/services/daily-mission-generation.ts`、`service-generation-knowledge-loader.ts`、`daily-mission-learning-history.ts`、`packages/capability-social/src/mission-engagement.ts`、`mission-outcomes.ts`、`activity-barrier*.ts` と対応テスト。

## 重点3条件

| 条件           | 実装証拠                                                                 | 実利用で必要な確認                                                                                         |
| -------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 企業ごとに違う | Business Profile、Goal、Knowledge、Personality、Strategyを生成入力へ渡す | 企業条件を1項目ずつ変え、主題・根拠・CTAが適切に変わり、他社情報が混ざらないことを人間評価                 |
| 毎日違う       | `missionDate`、直近28日のtopic/angle/format、Weekly item、重複検査       | 日付や言い換えだけでなく、14日程度の題材・目的・曜日適合を実AI出力で確認                                   |
| 履歴に基づく   | 採否理由、投稿結果、反応を要約し次回Planner/Contentへ渡す                | 例として「長すぎる」を不採用にする前後で改善し、単発理由を永久嗜好にせず、未測定成果を創作しないことを確認 |

`daily-mission-14-day-simulation.test.ts` は3人×14日の固定fixtureが重複検査を通るテストであり、実AIによる個別最適化の証明ではない。ランダムな言い換えだけを合格にしない。

## 100社開始を止めている条件

1. 実認証から企業設定、提案、採否、本人投稿記録、次回提案までの本番完走がない。
2. 同時実行、queue、DB接続、Provider rate limit、再試行、所要時間の100社相当試験がない。
3. productionにはDaily原価観測はあるが、main #1220〜#1229の共通費用Admission・原価UNKNOWN時停止が未反映。
4. 1社/1日、30日、100社の実測原価と予算/Alert/停止責任者が未確定。
5. 実LINE/スマホ、停滞通知、再開、誤送信防止が未受入。

## 限定検証の運用制限

- まず数社に限定し、対象、期間、1日上限、総予算、監視担当、停止条件を明示する。
- 投稿は本人が行い、採用・コピー・投稿実施・成果を別々に記録する。
- 自動投稿、成果保証、100社対応済みとは案内しない。
- 実AI使用、LINE送信、利用者登録、本番設定はそれぞれ別承認とする。
- 個別化3条件、越境なし、失敗時の再試行/失敗記録、費用を日次レビューする。

少数受入で重大な問題がなく、負荷・費用試験と停止訓練がPASSした後に段階拡大する。
