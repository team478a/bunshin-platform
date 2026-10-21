# ハッシー / マナベルスタイル 機能強化Roadmap案

2026-10-09 / 基準main `5b4957f1f2a983aa571ebd72d73ec4d67c3bbe84`。本書の順序は提案であり、実装・本番操作の承認ではない。

## 1. 両サービスのOutcome

ハッシーは「企業・店舗がSNSを継続できるよう考える部分を支援する」。投稿案の数やAIの機能数だけでなく、本人が案を採用し実行を続けられることを見る。自動SNS投稿・運用代行を今回追加しない。

マナベルスタイルは「受講者本人がAIを使って自分でできるようになる」。ワタシワークス=Platform、マナベルスタイル=Service、運営会社とOEM=提供主体。内部AI_TRAINING/Personal Learningをブランド変更でrenameしない。AIが作った完成品数で能力向上を測らない。

## 2. 共通整備を先に小さく

| 順序 | 共通改善                           | 両サービスへの価値                                  | 開始条件                              |
| ---- | ---------------------------------- | --------------------------------------------------- | ------------------------------------- |
| 1    | task別品質baseline/比較Gate        | 新modelで価値や禁止境界が悪化していないと判断できる | この監査PRの人間review・次PR承認      |
| 2    | 小さい互換policy/timeoutの統一     | 全機能を一斉改修せず必要taskだけ安全に更新          | baseline・既存Port互換・停止/予算回帰 |
| 3    | 原価coverage/二重計測排除/帰属設計 | 品質を保ったまま費用と不明を把握できる              | attempt/価格版/scopeの正本合意        |
| 4    | 匿名化改善draftの手動運用          | 現場の問題から小PRへつなげる                        | export審査、APPROVEDとREVIEWEDの分離  |

順序2と3は範囲が独立する小PRで並行可能。ただし品質baselineなしのモデル変更や、実測原価なしの「コスト最適化済み」は不可。

## 3. ハッシー

| 段階                  | KEEP / 再利用                                                        | 変更候補                                                      | 確認するOutcome                                 | 後回し                        |
| --------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------- | ----------------------------- |
| H1 履歴反映の回帰     | Service business profile、history要約、Daily/Weekly/Decision Context | 入力に渡った理由・元Goal・未測定状態を合成fixtureで固定       | 不採用理由を無視/過剰一般化しない、次提案へ反映 | 全履歴LLM投入、統合Memory     |
| H2 継続支援の効果観測 | 採否、Post record、Barrier/再開支援、OEM候補                         | 同期間/母数で採用/実行/再開を評価。本人本文を管理者へ広げない | 投稿を続けられたか、支援後に再開したか          | 高度SNS分析API、因果自動判定  |
| H3 model限定更新      | planner/content/quality PortとPrompt version                         | G01の比較後に1taskずつ設定切替案                              | 品質/採用/原価/latencyの悪化なし                | 自動投稿、画像/動画の新規実装 |

根拠: `daily-mission-generation.ts`、`daily-mission-learning-history.ts`、`weekly-plan-generation.ts`、`social-activity-oem-support-candidates.ts`。履歴投入の完成と効果実証を区別する。

## 4. マナベルスタイル

| 段階                         | KEEP / 再利用                                                      | 変更候補                                                                  | 確認するOutcome                                                | 後回し                          |
| ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------- |
| M1 3Definitionの縦フロー確認 | Scope/Consultation/Goal/Plan/Persistence/Router/Mission/Assessment | 合成の失敗/UNKNOWN/再挑戦ケースと人間review                               | Goal→本人実践→評価→NEXT/REVIEW/RETRY、Plan完了と契約終了を分離 | Definition増設・万能Chat        |
| M2 本人能力の証拠            | Guided Practice、Support Level、First Success、Capability Evidence | 何を本人ができたかと自己申告の限界を表示/評価。別題材の再現確認を最小設計 | First Success、自力依頼/確認/修正、同題材以外でも再現できるか  | 5段階Level Engine、自動習得確定 |
| M3 支援量の改善              | Barrier、Skill evidence、既存Hint                                  | 実証後に決定的な支援量候補を審査                                          | 支援を減らしても本人が進めるか、Fit                            | Teaching LLM、全職種Discovery   |
| M4 評価model更新             | 既存Evaluator/Skill Rule/Provider前Gate                            | 固定Rubricで旧/候補model比較。承認後限定切替                              | 誤PASS/能力誤確定が増えない、費用を把握                        | 新Provider/Model Router一括導入 |

個別化する学習経路は既にある。自由生成教材・全テーマ対応・本人の外部AI操作の直接検証・Level完全判定は未完成。完成品代行モードへ戻さない。旧V1 Toolkit/Work ResultはそのままPilotへ復活させずLearning Evidenceとして再審査する。

## 5. OEMと運営

- HassyはFREE/PAID両方。FREEは実測利用、PAIDは登録。ManaberuはPAID登録のみ。AI原価とOEM請求単価/人数は別指標。
- #1176はmain実装であり、現在のproduction refへ未反映。期間履歴・cutover・料金承認・backup/Migration/RLS・rollbackを別release審査で確認する。今回deployしない。
- OEM別機能設定や管理権限をmodel policyで迂回しない。企業/利用者/Serviceの情報を横断集計する場合も許可scope内のみ。
- Improvement候補の分類と重要度は人間が確定。Codexは承認済み小PRの実装支援候補で、Dotsの製品/権限/費用未確定を開始の前提にしない。

## 6. Production Closed Pilotとの関係

Pilot flag/allowlist/seat/100人Hard Cap/Wave/Call Admission/Provider前再認可/Kill Switchを維持する。LINEは現行の明示的隔離・導線Gateを維持し、過去runbookの「Webだけ」と最新mainのLINE対応を混同しない。既存V1への影響を切り分ける。

Wave 0を今回開始しない。実認証/実スマホ/状態復元、approved Definition、Production schema/RLS、Provider/価格/原価coverage、stop/in-flight risk、V1/LINE安全性は既存Launch Runbookで別審査。テストのPASSをPilot GOへ置換しない。

## 7. 次工程への条件

監査PR承認後、[実装計画](IMPLEMENTATION_PLAN.md) のEVO-01から別指示で着手することを推奨。機能追加や本番操作ではなく、モデル更新の比較基準を最初のゴールにする。
