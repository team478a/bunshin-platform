# HASSY Decision Engine — Implementation Plan（未承認）

基準：2026-10-04 JST、main `abddae07a5fd7e0afbaf9c7669ba62e302832e1f`。今回は監査文書のみ。以下のPRは人間レビュー後の候補であり、実装開始・課金・実生成・実送信・migration・deployの許可ではない。

## 1. ゴールと順序

第一優先は「今日何を投稿するか迷わない」、第二は会社に合った判断、第三は操作量。画像・動画はその後。既存Brief PlannerをDecision Engineとして拡張し、新Agent基盤を作らない。

| Phase                               | 現状／扱い           | 目的・再利用                                                                |
| ----------------------------------- | -------------------- | --------------------------------------------------------------------------- |
| 0 Current State Audit               | 今回完了             | 実コード監査、132既存テスト成功、4文書。実AI品質／本番は未確認              |
| 1 Decision Context統合              | 最優先、既存拡張     | profile/goal/strategy/weekly/history/knowledgeの入力契約と優先順位          |
| 2 Decision Reason / Explainability  | Phase1の契約後       | 既存reason/Snapshotのstage分離、品質修正後の整合                            |
| 3 Today HASSY UX                    | 既存UI拡張           | daily card/drawerを再利用、1提案と4操作へ整理                               |
| 4 Simple Feedback Loop              | 既存、Phase2/3へ統合 | GOOD/NEUTRAL/BAD、rejection、POSTEDとcopyの区別。毎日詳細数値を必須化しない |
| 5 Performance-informed Decision     | 既存の修正・拡張     | 非因果、同Goalと他Goalの区別、単純反復を抑制                                |
| 6 Photo First統合                   | 既存を接続           | analyst/planning/variant再利用、当日判断と履歴を整合                        |
| 7 Multi-platform Adaptation         | 既存を検証・拡張     | profile/format/generator再利用、Goal/CTAの一貫性                            |
| 8 Paid Image Generation             | 新基盤不要、後順位   | payment/quota/Job/Providerを再利用、有料境界の回帰検証                      |
| 9 Paid Video Generation             | 新基盤不要、後順位   | 既存Project/Revision/fal/Kling/Creatomate、課金認可の限定監査               |
| 10 Publishing / Metrics Integration | DEFER                | 将来Provider境界のみ維持。OAuth／auto post／高度分析を今回追加しない        |

## 2. 推奨する最初の1 PR

仮題：`test/feat: SOCIAL Decision Contextの契約と判断材料の優先順位を固定`

目的：生成やUIを変える前に、現在使える材料と使えない材料、Goalとengagementが衝突する場合の優先順位を再現可能にする。

範囲候補：`packages/capability-social` のpure Context型／normalizer／priority policyと、合成会社・履歴fixtureの単体テスト。必要なpublic exportのみ。web本番経路への接続、DB、Provider、料金変更を同PRへ入れない。

再利用：DailyMissionPlannerInput、SocialGoal planning policy、既存Strategy／Weekly型。共通Coreにハッシー固有定数を追加しない。

依存条件：人間が本監査のCONDITIONAL GOと優先順位／例外をレビュー。Goalだけ変えた代表ケース、履歴だけ変えた代表ケースを合意する。

DB：変更不要。rollback：本番未接続の契約／exportだけをrevert可能。完了条件：型・単体テスト・認可scope必須・入力不足と観測0／未取得の区別・source stageの検査。**これだけで実AIの目的差やV1 LEVEL4達成とは判定しない。**

## 3. 後続の小PR候補

| PR                         | 依存条件                         | 変更候補・再利用                                                 | DB / migration                        | テスト・完了条件                                                                                        | rollback                                      |
| -------------------------- | -------------------------------- | ---------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| P1-B Context接続           | 最初の契約承認                   | E01/E04/E05/E06の組立てにpure Contextを接続。owner scope維持     | 原則なし                              | missing/source stage、Group/owner/Bunshin越境拒否、一般/service経路差、既存生成fail-closed維持          | mapper接続を戻す。旧生成を維持                |
| P2-A Decision metadata保存 | JSON契約と旧Snapshot互換レビュー | E14/E15/E16のJSONにdecision block、planner/content versionを分離 | 既存JSONで可能か検証、初手新tableなし | 旧payload読込、atomic保存、selected/ignored整合、材料充足度、秘密情報非保存                             | 追加metadata読込任意化、旧payloadを削除しない |
| P2-B repair理由整合        | semantic repair方針の合意        | E13の企画変更検出／reBriefまたはrevision、既存variant再利用      | 原則なし、参照設計を先に確認          | 別企画になった最終本文に旧reasonを流用しない。修正失敗は公開しない                                      | 新整合経路をrevert、安全な失敗状態は維持      |
| P3 Today画面               | reason contract、料金表示合意    | E20/E21 drawer/card、通常用語へ、1提案4操作                      | なし                                  | smartphone、採用/非採用/写真/別案、表示理由、上級設定アクセス、他serviceフロー非混入                    | 既存viewへ戻す                                |
| P4 Feedback意味・導線      | POSTED定義と任意outcome合意      | E07/E21、GOODは好み、Goal成果は別                                | 既存manualMetricsを優先               | copy≠posted、GOOD≠売上、未入力で利用停止しない、履歴不削除                                              | UI/summaryの変更を戻す                        |
| P5 Goal別Performance       | 観測・仮説・制約policy承認       | E08/E11/E22、rankingと反復文言を見直す                           | 原則なし                              | one-shot好反応で目的変更しない、他Goalの強topicに支配されない、all-zero/unknown、曜日等未観測の限界表示 | 新summary/policyを戻す                        |
| P6 Photo First接続         | decision revisionと利用上限合意  | E18/E19のplanning JSON・owner素材・variant                       | 既存metadata優先                      | 写真fact訂正、他Customer参照拒否、Weeklyなし入口の仕様、同decision再試行／別案区別                      | 既存Photo First経路へ戻す                     |
| P7 Platform比較            | Contextとreason整合              | E02と既存content generator                                       | なし                                  | 正式profile対応format、Goal/CTA、スマートフォン文章・指示。実LLM品質は別承認                            | platform policyを戻す                         |
| P8 支払境界検証            | FREE別案の価格／quota合意        | E23/E27。文章別案と有料画像は別PRに分ける                        | 既存台帳再利用                        | 複数支払指定拒否、予約確定解放、無料判断からmedia暗黙発注なし                                           | 価格変更を独立revert。台帳は消さない          |
| P9 Video有料認可監査       | P8境界と契約条件合意             | E24/E25、既存Video/Scene/Render/Job                              | まず不要、監査後判断                  | commercial settingなし／上限null／契約停止／利用枠と外部原価、実APIは別承認                             | 新Provider追加なし、監査結果から限定修正      |

各PRは目的・変更・検証・残課題を明示し、無関係な修正を混ぜない。既存有料APIテスト／本番deployを監査のために起動しない。schema変更が本当に必要になった場合は独立設計レビューとmigrationを含む別PRとする。

## 4. 代表テスト設計

実ユーザーではなく合成データを使う。Goal差だけでなく履歴・当日材料・目的との衝突をテストする。

| ケース                        | 条件                                               | 期待する判断（将来合格条件）                                                                            |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| G1 美容室・認知 / 来店 / 採用 | 会社情報・履歴を固定、Goalのみ変更                 | 採用は働く人/職場、来店は初回来店の不安、認知は専門性等、テーマとangleが変わる。末尾CTA変更だけは不合格 |
| G2 士業・問い合わせ           | スタッフ紹介だけlike多数                           | FAQ/相談障壁等をGoalに沿って選び、likeだけでスタッフ紹介へ固定しない                                    |
| G3 小売・リピーター           | 商品紹介が直近で連続                               | 再利用/アフターケア等の別価値。名称の言い換えだけで重複回避と呼ばない                                   |
| G4 初期ユーザー               | Strategyあり、結果なし                             | evidence MEDIUM/LOW、観測を捏造せず実行可能な低負担案                                                   |
| G5 Goal変更                   | 採用→問い合わせ、旧Weekly/好反応あり               | 旧strategyとの不整合を明示、勝手に既存計画を変えず次回反映。過去履歴保持                                |
| G6 Feedback区別               | COPIED、ACCEPTED、POSTED、GOOD、measured0、unknown | 異なるsignalsとして保持、成功/投稿に暗黙変換しない                                                      |
| G7 Quality repair             | 初期BriefはFAQ、修正本文は求人                     | reason整合失敗を検出またはdecision revision。旧reasonで公開しない                                       |
| G8 Photo First                | 同じGoalで異なる写真／訂正facts                    | visiblefactsと会社Goalを統合、写真から勝手な職種／商品／予約状況を作らない                              |
| G9 OEM A/B                    | 同Group、異owner/Bunshin                           | 共通知識だけ共有、Memory/反応/素材/decisionは漏らさない                                                 |
| G10 Platform                  | Instagram/X/TikTok等の現行profile対応format        | unsupported format拒否、同Goalのactionは一貫し表現／撮影指示だけ適応                                    |

Unit/fakeテストはcontract、状態、scope、priorityを検証する。実LLMのtheme/angle/content/CTA/reason比較は別承認後の品質評価であり、mockに理想結果を返させたことを実品質証明にしない。試行数、固定入力、モデル、Prompt version、予算、送信素材、停止条件を承認してから実行する。

## 5. 実装前の承認・停止条件

- FREE別案のpoint-funded現行仕様を変更してよいか。無料でもAI上限／原価記録は維持する。
- approved GoalとBusiness Goalの衝突、Weeklyの再承認時期。
- 最終生成で企画変更した場合のreason／decision revisionの正本。
- confidenceは材料充足であり成果確率ではないというUX。
- 顧客固有情報をOperator共通知識へ暗黙昇格しない権限条件。
- JSON metadata拡張と旧Snapshot互換、削除要求への対応。

越境参照、課金迂回、reason不整合、架空outcome、単純engagement反復が見つかった場合は公開切替えを止める。監査後、ここで停止し人間レビューを待つ。
