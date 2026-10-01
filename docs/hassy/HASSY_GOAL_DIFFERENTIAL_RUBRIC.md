# ハッシー Goal Differential Rubric

作成日: 2026-10-01（Asia/Tokyo）

目的: 同一企業・同一対象顧客でSNS Goalだけを変えたとき、CTAの末尾だけでなく投稿戦略全体が変わることを決定的に検証する。

## 1. 対象

V1の主要7 Goal:

- Awareness
- Visit / Reservation
- Inquiry
- Repeat
- Recruitment
- Sales
- Trust / Expertise

固定企業は美容室とし、業種、対象顧客、商品・サービス、SNS、投稿形式は同一にする。変数はGoalだけとする。

## 2. 必須比較項目

各Goalで次の7項目を一つの構造として評価する。

1. Strategy summary
2. Weekly theme
3. Daily topic
4. Recommendation reason
5. 投稿本文
6. 写真・動画案
7. CTA

全項目が`weeklySocialGoalPlanningProfile()`の`strategyFocus / topicDirections / ctaDirections`と整合することを合格条件とする。

## 3. 不合格条件

次は不合格とする。

- Awareness用のテーマ・本文を維持したまま「スタッフ募集中」等のCTAだけを追加する。
- Goal名だけを本文へ挿入する。
- 語尾、絵文字、日付、写真だけを変える。
- StrategyとWeeklyは採用目的だが、Daily本文が一般商品紹介のままである。
- CTAが目的別でも、visualが別Goalの題材のままである。

テストはAwarenessの出力へ別GoalのCTAだけを付けたfixtureが、CTA以外の複数項目で不合格になることを明示する。

## 4. 合格例の構造

| Goal                | 中心テーマ               | Visual                         | CTA                  |
| ------------------- | ------------------------ | ------------------------------ | -------------------- |
| Awareness           | 店舗の特徴・考え方       | カウンセリング、スタッフ、店内 | フォロー、保存       |
| Visit / Reservation | 初回来店・利用の流れ     | 入口、受付、施術席             | 予約、空き確認       |
| Inquiry             | 課題・FAQ・相談内容      | 質問、悩み、相談場面           | 問い合わせ、LINE相談 |
| Repeat              | アフターケア・再利用理由 | 自宅ケア用品                   | 再予約、次回来店確認 |
| Recruitment         | 働く人・仕事内容・職場   | 朝礼、施術準備、練習           | 採用情報、見学相談   |
| Sales               | 商品価値・使用場面・比較 | 商品、使用量、比較             | 商品を見る、購入     |
| Trust / Expertise   | 専門知識・判断プロセス   | 選定表、確認資料               | 保存、詳細、相談     |

## 5. Prompt contract

次のProviderは`approvedStrategy.goalPlanning`を受け取り、「CTAの末尾だけ」でGoal差を作らない指示を持つ。

- Weekly planner
- Daily mission planner
- Mission content generator
- Mission quality checker

Quality checkerはテーマや読者価値が別Goalのままなら`GOAL_MISMATCH`として修正を要求する。テストはこの契約が消えていないことも確認する。

## 6. 証明できること・できないこと

証明できること:

- Goalごとの合否基準が曖昧な文章ではなく自動テストとして固定されている。
- 主要7 GoalのStrategy、Theme、Content、Visual、CTAに異なる期待がある。
- CTAだけの差分を合格にしない。
- Provider Promptへ同じ契約が渡る。

証明できないこと:

- OpenAI実出力が毎回rubricを満たすこと。
- 特定Goalが実際の予約・採用・売上を増やす因果関係。
- 外部SNSアルゴリズムに対する優位性。

実Provider品質は、別途承認された少数サンプルで同じrubricを人手評価する。未測定結果を実績として扱わない。

## 7. 実行方法

```text
pnpm --dir apps/web exec vitest run test/hassy-goal-differential-rubric.test.ts
```

外部通信、有料API、本番DB、LINE送信、SNS投稿は使用しない。
