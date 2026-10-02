# ハッシー SNS運用目的対応監査

調査日: 2026-10-01（Asia/Tokyo）

調査ブランチ: `codex/hassy-sns-goal-audit`

再監査基準: `origin/main` / `67ff4deb7618f7fca06e2c21aea7ee42d88dcf51`

対象: `team478a/bunshin-platform` の実コード、schema、migration、テスト

非対象: 本番DB、本番Service設定、実ユーザー、OpenAI実生成、LINE実送信、実SNS投稿

## 1. Executive Summary

**結論: #1039〜#1046の実装後、主要7 Goalはコード上のGoal → Strategy → Weekly → Daily → Theme → Content/visual → CTAまで明示的につながり、V1のLEVEL 4を満たす構造になった。**

初回設定の固定`BRAND_AWARENESS`、Weekly/Dailyへのtyped Goal欠落、Goal別方針欠落、結果を全Goalで混ぜる問題、Goal変更時に新旧Strategyが混在する問題は解消された。

- 正規Goal 8値と既存語彙の明示mappingがSOCIAL capabilityにある。
- Account Strategyは来店・予約、再来店、信頼・専門性を含む11値をUI/API/DBで扱う。
- 初回設定は事業目的からStrategy Goalを導出する。曖昧な`ATTRACT`は黙って変換せず利用者選択を要求する。
- Weekly、Daily、投稿本文、写真・動画案、CTAへ同じtyped Goalとversioned planning policyを渡す。
- 生成SnapshotとWeekly PlanがGoal/Strategyを保持し、履歴と現在Goalを混同しない。
- 目的別の簡易結果を利用者が入力でき、同じGoalの次週計画だけへ反映する。
- Goal変更は次に生成するWeekly Planから有効になり、確定済みの今週と過去履歴は書き換えない。

ただし、実Provider出力を同一条件で比較した品質証跡は未取得である。したがって「契約・Prompt・保存・回帰テスト上のLEVEL 4」と「実生成品質の運用確認」は分ける。LEVEL 5は簡易自己申告と一部手入力KPIまでで、外部SNS・予約・採用・販売システムとの自動照合は未実装である。

## 2. 現在のSNS Goal実装

### 2.1 正規Goal

`packages/capability-social/src/social-goal.ts`:

- `AWARENESS`
- `VISIT_RESERVATION`
- `INQUIRY`
- `REPEAT`
- `RECRUITMENT`
- `SALES`
- `TRUST_EXPERTISE`
- `OTHER`

`CanonicalSocialGoal`はSNS施策の事業成果を表す。フォロワー、LINE登録、ブログ遷移は中間指標・導線として区別し、事業成果へ黙って変換しない。

### 2.2 保存・生成に使うStrategy Goal

`SOCIAL_ACCOUNT_STRATEGY_GOALS` / `SocialAccountStrategyGoal`:

- `FOLLOWERS`
- `LINE_REGISTRATION`
- `INQUIRY`
- `VISIT_RESERVATION`
- `SALES`
- `RECRUIT`
- `REPEAT`
- `BRAND_AWARENESS`
- `TRUST_EXPERTISE`
- `BLOG_TRAFFIC`
- `OTHER`

主な実フィールド・シンボル:

| 概念                 | 実フィールド・シンボル                               | 役割                             |
| -------------------- | ---------------------------------------------------- | -------------------------------- |
| 事業プロフィール目的 | `ServiceMemberBusinessProfile.primaryPurpose`        | Service参加時の現在の事業目的    |
| SNS戦略Goal          | `SocialAccountStrategy.goal`                         | 承認・版管理されるSNSの現在Goal  |
| 目的別方針           | `WeeklySocialGoalPlanningProfile`                    | focus、topic、CTAを明示          |
| Weekly Snapshot      | `WeeklyPlan.strategyId/strategyGoal/socialProfileId` | 週の途中で新旧Goalを混ぜない     |
| 生成Snapshot         | `GenerationContextSnapshot.payload.strategy.goal`    | 投稿結果を生成時Goalへ結び付ける |
| Goal結果             | `PostRecord.manualMetrics.socialGoalOutcome`         | 目的への簡易自己申告             |
| 事業成果             | `PostRecord.manualMetrics.businessOutcomes`          | 問い合わせ、予約、来店、購入等   |

`Bunshin.objectiveSummary`は長期的な会社/Bunshin目的、`SocialAccountStrategy.goal`は現在SNSで優先する目的として別経路のまま維持される。

## 3. 現在選択可能なGoal

### 3.1 Service onboarding

| 値            | UI表示                 | 初回Strategyへの変換                       |
| ------------- | ---------------------- | ------------------------------------------ |
| `ATTRACT`     | 集客                   | 来店予約・問い合わせ・販売から利用者が選択 |
| `RESERVATION` | 予約                   | `VISIT_RESERVATION`                        |
| `SALES`       | 販売                   | `SALES`                                    |
| `RECRUITING`  | 採用                   | `RECRUIT`                                  |
| `AWARENESS`   | 認知                   | `BRAND_AWARENESS`                          |
| `RETENTION`   | 既存顧客との関係づくり | `REPEAT`                                   |

### 3.2 Account Strategy UI

11値すべてを選択・保存できる。V1主要Goalの認知、来店・予約、問い合わせ、再来店、採用、販売、信頼・専門性を個別に設定できる。

### 3.3 A〜H対応

記号: `○` 明示対応、`△` 部分対応、`×` 未対応、`未確認` 実Provider/本番で未確認。

| Goal             | A UI | B DB | C Context | D Weekly | E Daily | F CTA |                    G 結果評価 |   H 次回提案 |
| ---------------- | ---: | ---: | --------: | -------: | ------: | ----: | ----------------------------: | -----------: |
| 認知             |    ○ |    ○ |         ○ |        ○ |       ○ |     ○ |                    △ 自己申告 | ○ 同Goalのみ |
| 来店・予約       |    ○ |    ○ |         ○ |        ○ |       ○ |     ○ |  ○ 手入力予約/来店 + 自己申告 |            ○ |
| 問い合わせ       |    ○ |    ○ |         ○ |        ○ |       ○ |     ○ | ○ 手入力問い合わせ + 自己申告 |            ○ |
| リピーター       |    ○ |    ○ |         ○ |        ○ |       ○ |     ○ |                    △ 自己申告 |            ○ |
| 採用             |    ○ |    ○ |         ○ |        ○ |       ○ |     ○ |                    △ 自己申告 |            ○ |
| 販売             |    ○ |    ○ |         ○ |        ○ |       ○ |     ○ |       ○ 手入力購入 + 自己申告 |            ○ |
| 信頼形成・専門性 |    ○ |    ○ |         ○ |        ○ |       ○ |     ○ |                    △ 自己申告 |            ○ |

自動取得できない成果を取得済みとは扱わない。自己申告は`SELF_REPORTED`、対応する手入力事業成果がある場合は`MEASURED`として区別する。

## 4. DB / Schema

- `SocialAccountStrategy.goal`はPrisma enumで保存し、`APPROVED / SUPERSEDED`とversionを持つ。
- `WeeklyPlan`は生成時の`socialProfileId / strategyId / strategyGoal`を保存する。
- `GenerationContextSnapshot.payload.strategy`はStrategy ID、version、Goalを保存する。
- `PostRecord.manualMetrics`は既存構造を維持し、`socialGoalOutcome`と`businessOutcomes`をJSONとして保存する。
- Workspace/User/Bunshin/SocialProfileの所有範囲はRepositoryで再検証される。

既存Weekly PlanはGoal Snapshotがnullのため、現在の承認済みStrategyへ後方互換fallbackする。過去データを推測でbackfillしない。

未実装:

- Primary + Secondary Goals
- Goal weight
- `effectiveFrom/effectiveUntil`
- 独自Goal説明の型付き保存

V1では単一Primary GoalとStrategy versionで十分であり、複数Goalや期間UIを先行実装しない。

## 5. Onboarding

```text
Service Onboarding primaryPurpose
  └─ ServiceMemberBusinessProfileへ保存
      ├─ Bunshin / business contextへ利用
      └─ initialSocialAccountStrategyGoal()
          ├─ RESOLVED: 初回Strategy Goalとdestinationを設定
          └─ REVIEW_REQUIRED: 利用者が具体的な成果を選択
```

`ATTRACT`を任意の1 Goalへ決めつけず、来店予約・問い合わせ・販売の選択を要求する。business purpose機能を使わない他Serviceでは従来の認知初期値を維持し、ハッシー固有設定を共通基盤へ強制しない。

## 6. Goal Propagation Map

```text
Onboarding / Account Strategy UI
  Goal
   ├─→ SocialAccountStrategy.goal + version/status
   ├─→ Strategy Provider input
   └─→ weeklySocialGoalPlanningProfile(goal)
          ├─ strategyFocus
          ├─ topicDirections
          └─ ctaDirections
               │
               ├─→ WeeklyPlannerInput.approvedStrategy
               │      └─→ WeeklyPlan.strategyId/strategyGoal snapshot
               │
               ├─→ DailyMissionPlannerProviderInput.approvedStrategy
               │      └─→ topic / angle / reason / format
               │
               ├─→ Content + Quality strategyContext
               │      └─→ body / visual / CTA
               │
               └─→ GenerationContextSnapshot.strategy.goal
                        └─→ Goal-specific outcome input
                              └─→ same-goal next Weekly recentPerformance
```

## 7. Strategyへの反映

`OpenAIStrategyGenerator`へtyped Goal、企業情報、対象顧客、利用可能時間、導線を渡す。生成したconcept、positioning、target、CTA、posting policyは版管理・承認される。

実OpenAI出力で7 Goalの戦略差を比較していないため、Provider品質は未確認。コード上はGoalが欠落せず、後段は生成自由文だけに依存しない。

## 8. Weekly Planへの反映

`WeeklyPlanGenerationService`は次をPlannerへ渡す。

- `approvedStrategy.goal`
- `approvedStrategy.goalPlanning`
- concept / positioning / target / CTA / posting policy
- Company/Bunshin context
- recent topics / feedback / result

Goal policyは目的別にテーマ軸とCTA候補を持つ。Goalのみ変更した監査テストでWeekly Planner inputが目的別に異なることを確認する。

## 9. Daily・Themeへの反映

Daily PlannerはWeeklyのStrategy Snapshotを正本とし、typed Goalと同じplanning profileを受け取る。新Strategy承認後も、確定済みWeekly PlanのDailyは旧Strategyで完走する。

目的別の主なテーマ差:

| Goal              | テーマ例                                         |
| ----------------- | ------------------------------------------------ |
| Awareness         | 店舗の特徴、スタッフ、考え方、ブランドストーリー |
| Visit/Reservation | 初回来店、メニュー、利用場面、店舗情報           |
| Inquiry           | 課題、FAQ、解決方法、相談テーマ                  |
| Repeat            | アフターケア、季節提案、新メニュー、再利用理由   |
| Recruitment       | 働く人、職場、仕事内容、価値観、キャリア         |
| Sales             | 商品価値、使用場面、比較、利用事例、購入理由     |
| Trust/Expertise   | 実績、専門知識、プロセス、誤解、顧客の疑問       |

## 10. Content・Photo/Video Idea・CTAへの反映

Content/variant/quality contextへGoalとplanning profileを渡す。本文だけでなく以下へ同じ方針が到達する。

- TEXT: `photoInstruction`
- SLIDE / IMAGE: 各slideの`visualScene`
- LIVE_ACTION: `shootingInstruction`とscript
- AI_VIDEO_PROMPT: Provider非依存の動画Prompt
- CTA: `ctaDirections`と承認Strategyの`ctaStrategy`

目的別方針がPromptに明示されるため、末尾だけを変える実装ではない。ただし実Providerが常にrubricを満たす保証ではなく、本番品質はサンプル監査が必要である。

## 11. Resultと次回提案

投稿の好みを表す`GOOD / NEUTRAL / BAD`と、目的達成を表す回答を分離した。

目的回答:

- `ACHIEVED`: 目的につながった
- `SOME_PROGRESS`: 手応えがあった
- `NO_CHANGE`: 変化はなかった
- `UNKNOWN`: まだ分からない

保存契約は4段階で共通化しつつ、利用者へ表示する質問と肯定回答はGoal別に具体化する。認知は「新しい人からの反応」、採用は「応募・見学の連絡／採用への質問」、信頼・専門性は「相談・依頼／保存・詳しい質問」を確認する。いずれも自動計測ではなく、利用者が実際に確認できた範囲の自己申告である。表示文言だけで外部KPI取得済みとは扱わない。

クライアントはGoalを送信せず、サーバーがGeneration SnapshotのGoalを使用する。Snapshotがない過去MissionへGoalを推測補完しない。

次週計画は現在Goalと同じGoalの結果だけを使用する。問い合わせは`inquiries`、来店予約は`reservations/visits`、リピートは`repeatReservations/repeatVisits`、販売は`orders`を一次指標として扱う。他Goalは現在自己申告中心である。利用者の回答は因果関係や外部KPI実績として断定しない。旧データの`reservations/visits`は新規・再来の別を証明できないため、再予約・再来店へ自動変換しない。

## 12. Goal変更時の挙動

確定規則:

1. 新Goal承認で新Strategy versionを作る。
2. 確定済みWeekly Planと残りのDailyは生成時Strategyで完走する。
3. 新Goalは次に生成するWeekly Planから適用する。
4. 過去Strategy、Weekly、Daily、結果を変更しない。
5. Strategy/Profile/Goal Snapshotが矛盾する場合は生成を停止する。

週途中の即時再計画はV1対象外。画面には反映時期を明示する。

## 13. Goal Differential Test

`apps/web/test/hassy-sns-goal-propagation-characterization.test.ts`は外部通信なしで次を確認する。

1. 初回Strategyが事業目的から導出され、曖昧目的は利用者選択になる。
2. 同じ美容室・同じStrategy文でGoalだけを変えるとWeekly inputのtyped Goal/policyが変わる。
3. Daily inputも同じtyped Goal/policyを受け取り、個人Contextを別途保持する。

既存のpackage/webテストはGoal別policy、Weekly、Daily、Content context、結果保存、次週集計、Goal変更時Snapshotを個別に検証する。

このテストは配線とpolicy差を証明するが、OpenAI実出力の品質優位性は証明しない。

## 14. Goal対応レベル

| Goal                |        現在Level | 根拠                                                 | 未確認              |
| ------------------- | ---------------: | ---------------------------------------------------- | ------------------- |
| Awareness           | 4 + 結果loop一部 | Strategy〜CTA、自己申告を次週へ反映                  | 実reach自動取得     |
| Visit / Reservation | 4 + 結果loop一部 | Strategy〜CTA、予約/来店手入力を同Goal次週へ反映     | 予約システム照合    |
| Inquiry             | 4 + 結果loop一部 | Strategy〜CTA、問い合わせ手入力を同Goal次週へ反映    | LINE/form自動照合   |
| Repeat              | 4 + 結果loop一部 | Strategy〜CTA、再予約/再来店手入力を同Goal次週へ反映 | 予約システム照合    |
| Recruitment         | 4 + 結果loop一部 | Strategy〜CTA、自己申告を次週へ反映                  | 応募/見学の自動照合 |
| Sales               | 4 + 結果loop一部 | Strategy〜CTA、購入手入力を同Goal次週へ反映          | 売上/商品閲覧照合   |
| Trust / Expertise   | 4 + 結果loop一部 | Strategy〜CTA、自己申告を次週へ反映                  | 信頼指標の定義      |

LEVEL 5完全達成とは判定しない。現在は取得可能な手入力と自己申告による段階実装である。

## 15. Goal × 履歴 / Barrier / KPI

### 履歴

Company Profile、Target、Goal、Weekly、Recent Posts、Accepted/Rejected、Posted、Feedback、Business Outcomesを統合する。生成時Goalと同じ履歴を成果学習へ使い、他Goalの成果を混ぜない。

### Barrier

障壁分類はService/User/Bunshin単位で分離されるが、`Barrier × Goal`の教育policyは未実装。大規模教育機能は今回の対象外である。

### KPI

| Goal              | 現在の一次指標                   | 補助・未取得                     |
| ----------------- | -------------------------------- | -------------------------------- |
| Awareness         | 自己申告                         | reach, impressions, profile view |
| Visit/Reservation | reservations, visits             | 予約経路・来店照合               |
| Inquiry           | inquiries                        | LINE/form別照合                  |
| Repeat            | repeatReservations, repeatVisits | 予約経路・再来店照合             |
| Recruitment       | 自己申告                         | 求人閲覧、見学、応募             |
| Sales             | orders                           | product view、売上額             |
| Trust/Expertise   | 自己申告                         | saves、shares、相談理由          |

## 16. SNSプラットフォーム差

正式型は`INSTAGRAM / TIKTOK / X / THREADS / YOUTUBE_SHORTS / OTHER`。Facebookは`OTHER`扱い。

format選択はplatform別で、Instagramはslide/image、TikTok・YouTube Shortsはlive action/video、X・Threadsはtextを優先する。Goal policyはplatform非依存の成果方針として組み合わせる。高度なアルゴリズム最適化は未実装。

## 17. Goal別テストマトリクス

| Case | Industry | Platform  | Goal              | 期待テーマ               | 期待CTA         |
| ---- | -------- | --------- | ----------------- | ------------------------ | --------------- |
| M1   | 美容室   | Instagram | Awareness         | 特徴・考え方             | フォロー/保存   |
| M2   | 美容室   | Instagram | Visit/Reservation | 初回来店・不安解消       | 予約/空き確認   |
| M3   | 美容室   | Instagram | Repeat            | 自宅ケア・次回来店       | 再予約          |
| M4   | 美容室   | Instagram | Recruitment       | スタッフ・仕事・職場     | 見学/採用情報   |
| M5   | 士業     | X         | Inquiry           | 課題・FAQ・相談条件      | 問い合わせ      |
| M6   | 士業     | Threads   | Trust/Expertise   | プロセス・誤解・専門知識 | 保存/相談       |
| M7   | EC小売   | TikTok    | Sales             | 使用場面・比較・購入理由 | 商品を見る/購入 |

全組合せの外部AI生成は未実行。代表サンプルを運用中に確認し、テーマ、本文、visual、CTAが単語置換ではなく構造的に異なるかを評価する。

## 18. Primary / Secondary / Weight / 期間

現在は単一Primary Goal。Secondary Goals、weight、期間指定は未実装である。

将来追加する場合も、Company/Bunshinの長期目的とcurrent SNS goalを分離し、Strategy versionへsnapshotする。V1では数値weight UIやGoal CMSを先行実装しない。

## 19. OEMとプロジェクト分離

Goal contractとpolicyはSOCIAL capabilityにあり、AI研修、占い、千ノ国メディアへ混在させない。OEM別候補制限やラベル変更は将来Service configurationで扱い、共通enumや画面へ企業名をハードコードしない。

現時点でOEM別Goal allowlist/CMSは未実装。V1必須ではない。

## 20. 残課題と推奨順

1. **実Provider Goal Differential品質確認**: M1〜M7から小さな承認済みサンプルを選び、同一入力でテーマ・本文・visual・CTAを人手rubric評価する。
2. **Goal × Barrier decision policy**: Goal別Mission成果だけで判断できる範囲と、未帰属Insightのため判断できない範囲を固定する。
3. **Secondary Goals**: 単一Goal運用の不足が確認された後に設計する。

Repeat KPI分離は実装済み。REPEATの画面では曖昧な`予約/来店`ではなく`再予約/再来店`を記録し、次週評価も明示的な2項目だけを一次指標として使う。保存先は既存の`manualMetrics` JSONを拡張したためmigrationは不要で、旧クライアント入力は新項目を0として受理する。

採用・認知・信頼の簡易成果入力も実装済み。DB/APIの4段階契約を維持しながら、Goalごとに利用者が判断できる具体的な質問と選択肢を表示する。外部KPIや投稿との因果関係は引き続き未確認である。

Goal × Barrierの現行経路と必要な代表例は`docs/hassy/HASSY_GOAL_BARRIER_AUDIT.md`へ記録した。Barrier rule v3でMission生成時Goalの件数に加え、投稿完了・手入力反応・次の行動をGoal別にEvidenceへ保存する。Missionへ紐づかないInsightは特定Goalへ推測配分せず、未帰属アカウント指標として分離する。未帰属・複数Goal・旧Evidence・Missionなし・未帰属Insightありは共通支援へ戻す安全ゲートも実装済みである。Goal別Barrier判定と支援文面は未実装である。

次の最小タスクは、**Goal別Mission成果だけで安全に判断できるBarrier policyを固定すること**である。`EFFECT / RESPONSE / LEAD / UNKNOWN`のうち、未帰属Insightを必要とする判定ではGoal別断定を避ける。

## 21. 実行した検証

成功:

```text
pnpm --dir apps/web exec vitest run \
  test/hassy-sns-goal-propagation-characterization.test.ts \
  test/weekly-plan-generation.test.ts \
  test/daily-mission-strategy-effective.test.ts \
  test/service-posting-outcomes-http.test.ts
Test Files 4 passed / Tests 112 passed

pnpm --filter @bunshin/capability-social exec vitest run \
  test/social-goal.test.ts test/daily-mission-planner.test.ts
Test Files 2 passed / Tests 29 passed

pnpm --dir apps/web typecheck
pnpm --filter @bunshin/capability-social typecheck
pnpm --dir apps/web exec eslint test/hassy-sns-goal-propagation-characterization.test.ts
pnpm exec prettier --check docs/hassy/HASSY_SNS_GOAL_AUDIT.md \
  apps/web/test/hassy-sns-goal-propagation-characterization.test.ts
git diff --check
```

未実行:

- OpenAI実API生成
- 本番DB・本番Service設定確認
- 実LINE配信・SNS投稿
- 外部SNS/予約/採用/販売システム連携

## 22. 未確認事項

- 本番ハッシー参加者に設定済みのGoal分布と旧Weekly Planの割合。
- 実ProviderがM1〜M7のrubricをどの程度満たすか。
- 実SNS指標の取得可能範囲と利用規約。
- OEMごとのGoal候補制限要件。
- Secondary Goalを必要とする具体的な運用頻度。

## 23. 変更範囲

本PRの再更新は監査文書と外部通信なしのcharacterization testのみ。本番アプリ、API、Provider、DB schema、migration、依存関係、lockfile、設定、LINE、デプロイは変更しない。
