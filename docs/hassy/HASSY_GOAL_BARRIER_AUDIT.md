# ハッシー Goal × Barrier 監査

更新日: 2026-10-02（Asia/Tokyo）
対象基準: `2b3dd1e8`（PR #1077 merge後の`origin/main`）

## 1. Executive Summary

現在の障壁発見は、Workspace / Service / Membership / User / Bunshinを含むscopeで分離され、行動集計からは`SUSPECTED`だけを作り、利用者の回答があるまで`CONFIRMED`にしない。障壁の推測、本人確認、無料支援、完了・見送り、再発検出、OEM支援候補まで実コードが接続されている。

Barrier rule v3では、障害日を除外したMissionの生成時GoalをEvidenceへ帰属させ、Goal別件数、未帰属件数、複数Goal混在を保存する。Missionへ紐づく投稿完了、手入力の肯定反応、次の行動も生成時Goal別に区分する。一方、`SocialInsightSnapshot`はMissionとの関係を持たないため特定Goalへ推測配分せず、未帰属のアカウント指標として分離する。

支援選択では、旧Evidence、Missionなし、未帰属あり、複数Goal混在、未帰属アカウント指標ありを単一Goalとして扱わず、既存の共通支援へフォールバックする。単一Goalへ完全帰属できる場合も、Goal別支援が未定義の現段階では共通支援を維持し、選択理由をSnapshotへ保存する。

Barrier判定に使う集計値は引き続き28日間の全Goal合算であり、`EFFECT / LEAD / UNKNOWN`等の支援文面も全Goal共通である。そのため、現時点で「問い合わせ目的に合った障壁支援」「採用目的に合った応募導線支援」まで対応済みとは判定しない。

投稿後成果の現行保存形式`manualMetrics.businessOutcomes`はPR #1075以降、`inquiries / reservations / visits / repeatReservations / repeatVisits / orders`を障壁観測で読み取る。これは既存成果の観測漏れ修正であり、Goal別の因果関係判定ではない。

## 2. 現行フロー

```text
28日間のDaily Mission / Activity / LINE Delivery / PostRecord / SocialInsight
  ↓ PrismaSocialActivityBarrierObservationRepository.collect
障害日を除外した集計値
  ↓ inferSocialActivityBarriers
SUSPECTED候補（行動から断定しない）
  ↓ SocialActivityBarrierCase + Evidence
利用者へ候補を1問で確認
  ↓ PrismaSocialActivityBarrierConfirmationRepository.answer
CONFIRMEDまたはDISMISSED
  ↓ selectSocialActivitySupport(category, evidence)
安全条件を評価し、共通の無料支援と選択理由をSnapshot保存
  ↓ ACCEPT / COMPLETE / SKIP
再観測・解決判定・条件付きOEM支援候補
```

## 3. 実装状態

| 項目                          | 状態         | 根拠                                                    |
| ----------------------------- | ------------ | ------------------------------------------------------- |
| テナント・利用者・Bunshin分離 | 実装済み     | `SocialActivityBarrierScope`、各Repositoryのscope照合   |
| 障害日除外                    | 実装済み     | 生成失敗日・LINE失敗日を観測対象から除外                |
| 行動だけで障壁を確定しない    | 実装済み     | 推測結果は`SUSPECTED`のみ、本人回答で`CONFIRMED`        |
| 冪等な証拠・回答              | 実装済み     | Evidence key、confirmation idempotency key              |
| 無料支援のSnapshot            | 実装済み     | `definitionSnapshot`へ支援内容を保存                    |
| Goalの観測入力                | 実装済み     | Barrier rule v3の`goalAttribution`と`goalMetrics`       |
| Mission生成時Goalの参照       | 実装済み     | Generation Contextの許可済みGoalだけを読取              |
| Goal別Mission件数             | 実装済み     | Goal別件数、未帰属件数、混在フラグをEvidence JSONへ保存 |
| Goal別Mission成果指標         | 記録済み     | 投稿完了・手入力反応・次の行動を生成時Goal別に保存      |
| Goal別アカウントInsight       | 未実装       | Mission relationがなく、未帰属アカウント指標として保存  |
| Goal別Barrier判定             | 未実装       | 現行判定は引き続き28日間の全Goal合算                    |
| Goal別の質問・支援            | 未実装       | categoryだけで共通ラベル・支援を選択                    |
| Goal別支援の安全ゲート        | 実装済み     | 未帰属・混在・旧Evidence等は共通支援へフォールバック    |
| Goal変更履歴の保持            | 一部実装済み | Strategy履歴、Evidence件数・成果、支援選択理由を保持    |
| 現行の手入力成果読取          | 実装済み     | `manualMetrics.businessOutcomes`を観測対象へ追加済み    |

## 4. Barrier × Goal 差分

| Barrier                        | Goal非依存で使える部分   | Goal依存が必要な部分                               | 現在の判定               |
| ------------------------------ | ------------------------ | -------------------------------------------------- | ------------------------ |
| SETUP / HOW_TO / TIME / EFFORT | 操作・時間・作業量の支援 | 目的別の説明は補助的                               | 現行共通支援を再利用可能 |
| CONTENT                        | 内容が合わない本人確認   | Goalに合う題材・対象顧客・CTA                      | Goal Context未接続       |
| MEDIA / CONFIDENCE             | 写真準備・下書き支援     | Goal別の素材優先度は補助的                         | 現行共通支援を再利用可能 |
| EFFECT                         | 結果確認の手順           | Goalごとに見るべき成果が異なる                     | Goal Context必須         |
| RESPONSE                       | 反応への返信             | 採用質問、予約相談、購入質問等で次の案内が異なる   | Goal Context必須         |
| LEAD                           | 次の導線を一つに絞る     | 問い合わせ、予約、再予約、応募、購入で導線が異なる | Goal Context必須         |
| UNKNOWN                        | 記録方法の案内           | 認知・採用・信頼等で確認可能な指標が異なる         | Goal Context必須         |

## 5. 必要性を固定する代表例

1. `INQUIRY × EFFECT`: 「数字を見る」だけでなく、問い合わせにつながる前段反応と問い合わせ件数を分けて確認する。
2. `RECRUIT × LEAD`: 予約・購入ではなく、採用ページ、見学、応募、採用問い合わせの案内を確認する。
3. `REPEAT × LEAD`: 新規予約ではなく、再予約・再来店の導線を確認する。
4. `BRAND_AWARENESS × UNKNOWN`: 問い合わせ未発生を失敗とせず、新しい人からの反応や確認可能な閲覧・フォローを自己申告で確認する。
5. `TRUST_EXPERTISE × RESPONSE`: 一般返信ではなく、保存・詳しい質問・相談へどう応答するかを案内する。

これらは将来の支援文面を検証するfixtureであり、外部KPI取得や投稿との因果関係を証明しない。

## 6. 実装済みの最小修正

障壁観測で次の現行成果を読み取る。

- 肯定反応: `businessOutcomes.inquiries`
- 次の行動: `businessOutcomes.reservations / visits / repeatReservations / repeatVisits / orders`

過去のtop-level形式も継続して読む。問い合わせは現在の汎用Barrier分類では「肯定反応」とし、無条件に汎用conversionへ変換しない。問い合わせGoalでは問い合わせ自体が一次成果になるため、正しいGoal別分類は次段階で行う。

Barrier rule v3では、障害日を除外した各Missionについて生成時Snapshotの`strategy.goal`を読み、次をEvidenceのJSONへ保存する。

- Goal別Mission件数
- 観測Mission総数
- Goal帰属済み件数
- `UNATTRIBUTED`件数
- 観測期間内の異なるGoal数
- 複数Goal混在フラグ
- Goal別の投稿完了件数
- Goal別の手入力肯定反応件数
- Goal別の手入力による次の行動件数
- Missionへ帰属できないInsight件数と肯定反応件数

許可済みenum以外、Snapshot欠落、旧Missionは`UNATTRIBUTED`とし、現在Goalから推測補完しない。既存v1/v2 EvidenceはGoal成果指標なしとして引き続き読める。Evidenceの冪等キーをv3へ更新し、同じ観測期間でも旧形式と混同しない。

支援選択では次を安全ゲートとして固定する。

- Goal帰属なしの旧Evidenceは`ATTRIBUTION_UNAVAILABLE`
- 観測Missionなしは`NO_OBSERVED_MISSIONS`
- 未帰属Missionありは`UNATTRIBUTED_MISSIONS`
- 複数Goal混在は`MIXED_GOALS`
- Goal成果指標のない旧Evidenceは`METRICS_UNAVAILABLE`
- Goal別件数と成果件数が矛盾するEvidenceは`METRICS_INCONSISTENT`
- Missionへ帰属できないInsightありは`UNATTRIBUTED_ACCOUNT_METRICS`
- 単一Goalへ完全帰属しても、Goal別定義がない間は`GOAL_SPECIFIC_SUPPORT_NOT_CONFIGURED`

すべて現行の共通支援を選び、support rule v2として判定結果を`definitionSnapshot.selection`へ保存する。これにより、将来Goal別支援を追加しても、現在Goalによる過去Missionの推測補完や混在Evidenceへの誤適用を避けられる。

## 7. 採用しない変更

- 現在の承認Strategyだけを28日全体へ後付けしない。
- Goal変更前のMissionを新Goalの成果として再解釈しない。
- `LEAD`を全Goalで予約・購入導線と決めつけない。
- 投稿反応がないことをGoal不達や投稿品質不良と断定しない。
- AI研修のBarrier定義をSOCIALへ混在させない。
- 新しい教育システム、Provider、外部KPI連携を追加しない。

## 8. 次の最小タスク

`EFFECT / RESPONSE / LEAD / UNKNOWN`について、Goal別Mission成果だけで判断できる範囲と、未帰属Insightのため判断できない範囲をpolicyとして固定する。その後、完全帰属した単一Goalだけへ限定して支援文面差を追加する。現時点ではGoal別Barrier判定・文面を実装しない。

## 9. 未確認事項

- 本番で28日以内にGoalを変更した利用者数。
- 各Goal × Barrierの本人確認件数と無料支援完了率。
- SNS側で取得可能な指標と利用規約。
- 採用ページ、予約、販売システムとの接続可否。
- OEMごとの支援文面差し替え要件。

## 10. 変更範囲

本変更は、Mission単位のGoal別成果集計、未帰属アカウント指標、Evidence JSON、支援安全ゲート、回帰テスト、本監査文書のみ。DB schema、migration、API、Provider、LINE送信、本番設定、依存関係、lockfileは変更しない。
