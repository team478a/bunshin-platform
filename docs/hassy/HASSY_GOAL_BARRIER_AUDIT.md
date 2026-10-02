# ハッシー Goal × Barrier 監査

更新日: 2026-10-02（Asia/Tokyo）
対象基準: `b9f9f52d`（PR #1074 merge後の`origin/main`）

## 1. Executive Summary

現在の障壁発見は、Workspace / Service / Membership / User / Bunshinを含むscopeで分離され、行動集計からは`SUSPECTED`だけを作り、利用者の回答があるまで`CONFIRMED`にしない。障壁の推測、本人確認、無料支援、完了・見送り、再発検出、OEM支援候補まで実コードが接続されている。

一方で、SNS Goalは障壁の観測入力・証拠・Case・支援Snapshotに含まれない。28日間にGoalが変わった場合も全Missionを合算し、`EFFECT / LEAD / UNKNOWN`等の意味と支援文面は全Goal共通である。そのため、現時点で「問い合わせ目的に合った障壁支援」「採用目的に合った応募導線支援」まで対応済みとは判定しない。

また監査時点では、投稿後成果の現行保存形式`manualMetrics.businessOutcomes`を障壁観測が参照していなかった。本変更では、この形式の`inquiries / reservations / visits / repeatReservations / repeatVisits / orders`を読み取れるようにする。これは既存成果の観測漏れ修正であり、Goal別の因果関係判定ではない。

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
  ↓ socialActivitySupportFor(category)
共通の無料支援をSnapshot保存
  ↓ ACCEPT / COMPLETE / SKIP
再観測・解決判定・条件付きOEM支援候補
```

## 3. 実装状態

| 項目                          | 状態         | 根拠                                                     |
| ----------------------------- | ------------ | -------------------------------------------------------- |
| テナント・利用者・Bunshin分離 | 実装済み     | `SocialActivityBarrierScope`、各Repositoryのscope照合    |
| 障害日除外                    | 実装済み     | 生成失敗日・LINE失敗日を観測対象から除外                 |
| 行動だけで障壁を確定しない    | 実装済み     | 推測結果は`SUSPECTED`のみ、本人回答で`CONFIRMED`         |
| 冪等な証拠・回答              | 実装済み     | Evidence key、confirmation idempotency key               |
| 無料支援のSnapshot            | 実装済み     | `definitionSnapshot`へ支援内容を保存                     |
| Goalの観測入力                | 実装済み     | Barrier rule v2の`goalAttribution`                       |
| Mission生成時Goalの参照       | 実装済み     | Generation Contextの許可済みGoalだけを読取               |
| Goal別Mission件数             | 実装済み     | Goal別件数、未帰属件数、混在フラグをEvidence JSONへ保存  |
| Goal別行動指標                | 未実装       | 行動集計値自体は28日間の全Goal合算                       |
| Goal別の質問・支援            | 未実装       | categoryだけで共通ラベル・支援を選択                     |
| Goal変更履歴の保持            | 一部実装済み | Strategy履歴とEvidence件数は保持、Support Snapshotは共通 |
| 現行の手入力成果読取          | 本変更で修正 | `manualMetrics.businessOutcomes`を観測対象へ追加         |

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

Barrier rule v2では、障害日を除外した各Missionについて生成時Snapshotの`strategy.goal`を読み、次をEvidenceのJSONへ保存する。

- Goal別Mission件数
- 観測Mission総数
- Goal帰属済み件数
- `UNATTRIBUTED`件数
- 観測期間内の異なるGoal数
- 複数Goal混在フラグ

許可済みenum以外、Snapshot欠落、旧Missionは`UNATTRIBUTED`とし、現在Goalから推測補完しない。既存v1 EvidenceはGoal帰属なしとして引き続き読める。Evidenceの冪等キーをv2へ更新し、同じ観測期間でも旧形式と混同しない。

## 7. 採用しない変更

- 現在の承認Strategyだけを28日全体へ後付けしない。
- Goal変更前のMissionを新Goalの成果として再解釈しない。
- `LEAD`を全Goalで予約・購入導線と決めつけない。
- 投稿反応がないことをGoal不達や投稿品質不良と断定しない。
- AI研修のBarrier定義をSOCIALへ混在させない。
- 新しい教育システム、Provider、外部KPI連携を追加しない。

## 8. 次の最小タスク

Goal別支援へ進める安全条件を固定する。少なくとも`UNATTRIBUTED > 0`または`mixedAttributedGoals = true`の場合は単一Goal向け文面を選ばず、既存の共通支援を維持する。

その後、Goal別に集計すべき行動指標を定義し、`EFFECT / RESPONSE / LEAD / UNKNOWN`の代表fixtureだけで支援差を検証する。現時点ではGoal別文面を実装しない。

## 9. 未確認事項

- 本番で28日以内にGoalを変更した利用者数。
- 各Goal × Barrierの本人確認件数と無料支援完了率。
- SNS側で取得可能な指標と利用規約。
- 採用ページ、予約、販売システムとの接続可否。
- OEMごとの支援文面差し替え要件。

## 10. 変更範囲

本変更は、既存JSON成果の読取、Generation ContextからのGoal帰属、Evidence JSON、回帰テスト、本監査文書のみ。DB schema、migration、API、Provider、LINE送信、本番設定、依存関係、lockfileは変更しない。
