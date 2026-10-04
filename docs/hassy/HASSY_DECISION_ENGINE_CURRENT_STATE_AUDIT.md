# HASSY Decision Engine — Current State Audit

## 1. Executive Summary

判定は **CONDITIONAL GO（人間レビュー後の小さな既存構造拡張）**。新しいAgent、Memory、Analytics、動画基盤を作る理由はない。ハッシーは既に「Briefでテーマ・切り口・理由を決め、その後に投稿を生成する」構造を持つ。会社・SNS目的・承認戦略・確定Weekly Plan・履歴・簡易Feedback・手入力反応の接続も存在する。

最大の不足は、判断時点の入力、優先順位、選択理由と無視した材料を、一貫した契約として保持すること。品質修正やPhoto Firstで内容が変わった後の理由整合、Goalに沿った成果の扱い、意味的なテーマ／商品／CTAの偏り抑制は部分的である。「学習して成果を最大化できる」「実AIで目的別品質が保証された」とは判定しない。

Decision Recordは **B：既存構造拡張**を推奨する。DailyMissionのtopic/angle/reasonとGenerationContextSnapshot.payloadを正本にし、別HassyDecisionテーブルを初手で追加しない。

## 2. 調査の固定点・範囲

- 調査日：2026-10-04、Asia/Tokyo（UTC+09:00）。下記テスト開始は01:30–01:31 JST。
- 開始時にfetchしたorigin/main／調査基準SHA：`abddae07a5fd7e0afbaf9c7669ba62e302832e1f`。
- 文書ブランチ：`codex/hassy-decision-engine-audit`。上記mainを起点とし、アプリ変更はない。
- 作業ディレクトリ：`C:/Users/Owner/.codex/worktrees/hassy-photo-first-differential/分身プロジェクト`。元の作業ディレクトリの未コミット／競合変更は触っていない。
- 環境：Windows / PowerShell、Node 24.21.0、pnpm 10.10.0、Vitest 4.1.11。
- AGENTS.md、正本仕様の関連箇所、Architecture Principles、Roadmap、Decision Log、package定義を参照した。過去文書は探索の補助であり、以下の実装判定は実コードを根拠とする。
- 外部Provider、本番DB、Storage、LINE、実ユーザー情報、SNS APIは検証していない。main取得後の追加マージもこの基準には含めない。

## 3. Evidence Index

以下の略号は実ファイルを指す。シンボルを併記し、基準SHA上で検索・再確認できるようにする。

| ID  | 実ファイル・主要シンボル                                                                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E01 | `apps/web/src/services/daily-mission-generation.ts` — DailyMissionGenerationService.execute（Brief→Memory選択→Content→品質→保存）                                                                                                                                                                                                         |
| E02 | `packages/capability-social/src/mission-generation.ts` — GenerateDailyMissionBrief、DailyMissionPlannerInput、selectDailyMissionFormat                                                                                                                                                                                                    |
| E03 | `apps/web/src/providers/openai-daily-mission-planner.ts` — OpenAIDailyMissionPlanner、daily-mission-planner-v11-goal-planning                                                                                                                                                                                                             |
| E04 | `apps/web/src/services/daily-mission-planning-context.ts` — Weekly Plan／Strategy／personalMaterialsのロード                                                                                                                                                                                                                              |
| E05 | `apps/web/src/services/daily-mission-personalization.ts` — buildDailyMissionPersonalizationBase、buildMissionPersonalizationContext、selectDailyMissionMemories                                                                                                                                                                           |
| E06 | `apps/web/src/services/service-generation-knowledge-loader.ts` — ServiceGenerationKnowledgeLoader、owner/groupで絞った履歴取得                                                                                                                                                                                                            |
| E07 | `apps/web/src/services/daily-mission-learning-history.ts` — behaviorSummary／feedbackSummary／performanceSummary                                                                                                                                                                                                                          |
| E08 | `apps/web/src/services/weekly-plan-generation.ts` — loadRecentPerformance、buildGoalOutcomePlanningContext                                                                                                                                                                                                                                |
| E09 | `apps/web/src/providers/openai-weekly-planner.ts` — OpenAIWeeklyPlanner、weekly-planner-v8-goal-outcomes                                                                                                                                                                                                                                  |
| E10 | `packages/capability-social/src/weekly-plan.ts` — WeeklyPlannerInput、campaign比率／cooldown検証                                                                                                                                                                                                                                          |
| E11 | `apps/web/src/services/post-performance.ts` — buildPostPerformancePlanningContext、buildPostPerformanceInsight                                                                                                                                                                                                                            |
| E12 | `apps/web/src/services/daily-mission-content-quality.ts` — fingerprint／shingle／simhash重複検査                                                                                                                                                                                                                                          |
| E13 | `apps/web/src/services/daily-mission-quality-pipeline.ts` — generateDailyMissionContentWithQuality                                                                                                                                                                                                                                        |
| E14 | `apps/web/src/services/daily-mission-result-persistence.ts`、`daily-mission-persistence.ts` — Snapshot構成                                                                                                                                                                                                                                |
| E15 | `packages/application/src/generation-context.ts` — GenerationContextSnapshotPayload                                                                                                                                                                                                                                                       |
| E16 | `packages/database/src/daily-mission-creation-repository.ts` — mission.reason、Snapshotの同一transaction保存                                                                                                                                                                                                                              |
| E17 | `packages/database/prisma/schema.prisma` — SocialProfile(6478付近)、SocialAccountStrategy(6542)、ContentPillar(6672)、WeeklyPlan(6693)、DailyMission(6760)、GenerationContextSnapshot(6872)、MissionContentVariant(6911)、PhotoFirstMetadata(6940)、MissionDecision(7034)、MissionActivity(7054)、PostRecord(7096)、MissionFeedback(7123) |
| E18 | `apps/web/src/services/mission-content-variant-generation.ts`、`mission-content-variant-context.ts` — variant／写真所有権／Snapshot再利用                                                                                                                                                                                                 |
| E19 | `apps/web/src/http/service-daily-actions.ts`、`providers/openai-photo-first-analyzer.ts`、`services/photo-first-variant-instructions.ts` — Photo First入口・分析・企画                                                                                                                                                                    |
| E20 | `apps/web/app/s/[serviceSlug]/bunshins/[bunshinId]/service-bunshin-detail-view.tsx` — MemberHomeDrawer、日次／詳細設定                                                                                                                                                                                                                    |
| E21 | 同ディレクトリの `service-daily-mission-card.tsx`、`service-daily-mission-accepted.tsx` — reason、採用後Feedback                                                                                                                                                                                                                          |
| E22 | `apps/web/app/s/[serviceSlug]/weekly-report/page.tsx` — 次の投稿に生かすポイント                                                                                                                                                                                                                                                          |
| E23 | `apps/web/src/services/social-image-payment.ts`、`jobs/social-image-generation-access.ts`、`http/social-image-generation.ts` — 支払種別／予約／権限／Job                                                                                                                                                                                  |
| E24 | `apps/web/src/http/social-image-carousel-video.ts`、`providers/fal-kling-video.ts`、`providers/creatomate-video-render.ts` — 既存Media経路                                                                                                                                                                                                |
| E25 | `packages/database/src/video-media-quota.ts`、`organization-ai-generation-quota.ts` — Media利用枠とAI推論利用枠                                                                                                                                                                                                                           |
| E26 | `packages/database/src/bunshin-memory.ts`、`group-knowledge.ts` — PrismaOwnerBunshinMemoryRepository、listApprovedChunksForGeneration                                                                                                                                                                                                     |
| E27 | `apps/web/src/http/service-daily-mission-variants.ts`、`services/point-funded-mission-content-variant.ts` — ALTERNATIVE_PLAN_GENERATIONのポイント予約                                                                                                                                                                                     |

## 4. Capability分類

IMPLEMENTEDは対象コードと接続があることを表し、本番品質保証を意味しない。PARTIALは接続／仕様の不足。DUPLICATEDは実際に重複する組立てに限る。複数Actionは先に再利用、次に必要拡張の順。

| Capability                                    | Status      | Action                      | Evidence／制限                                                                                       |
| --------------------------------------------- | ----------- | --------------------------- | ---------------------------------------------------------------------------------------------------- |
| Business Profile                              | IMPLEMENTED | REUSE                       | E04–06、owner/groupに絞った入力                                                                      |
| Business Goalと現在SNS Goalの独立した判断契約 | PARTIAL     | EXTEND                      | E02–03、企業情報とSNS Goalはあるが衝突解決がPrompt依存                                               |
| SocialProfile / SNS Goal                      | IMPLEMENTED | REUSE                       | E02、E17、Plannerへtyped goalを伝播                                                                  |
| SocialAccountStrategy / Wizard                | IMPLEMENTED | REUSE / REMOVE_FROM_USER_UI | E02、E04、E20、承認戦略を利用。詳細用語を日次必須操作にしない                                        |
| ContentPillar                                 | IMPLEMENTED | REUSE / REMOVE_FROM_USER_UI | E02、E10、E17、Weeklyのpillar選択を継承                                                              |
| WeeklyPlan                                    | IMPLEMENTED | REUSE                       | E08–10、CONFIRMED／Strategy対応の検証                                                                |
| DailyMissionGenerationService                 | IMPLEMENTED | REUSE                       | E01、Capability／claim／quota／品質／保存の経路                                                      |
| 判断→Contentの順序                            | IMPLEMENTED | REUSE                       | E01–03、BriefがContentより先                                                                         |
| Decision Contextの統一・優先順位              | PARTIAL     | EXTEND                      | E02–07、材料はあるがstage／競合／不足の共通契約なし                                                  |
| Today’s Context（当日の制約・変更）           | PARTIAL     | EXTEND                      | E02、E19、日付／timezone／所要時間／写真はある。営業状況等の統一入力なし                             |
| 今日のテーマ・理由                            | IMPLEMENTED | REUSE                       | E02–03、topic/angle/reason。品質修正との整合は別項目                                                 |
| MissionContent / platform別生成               | IMPLEMENTED | REUSE                       | E01、E02、E13、型・対応formatに制約                                                                  |
| Decisionと生成後CTAの一致証跡                 | PARTIAL     | EXTEND                      | E02、E14–17、Briefに独立selectedCTAがない                                                            |
| 写真／動画撮影案・AI Prompt                   | IMPLEMENTED | REUSE                       | E02、E13、E19。実生成とは分ける                                                                      |
| Mission variants                              | IMPLEMENTED | REUSE                       | E18、E27。通常の別案はpoint-funded                                                                   |
| Photo First                                   | IMPLEMENTED | REUSE / CONNECT             | E18–19、写真分析と企画あり。日次未作成時は先に通常Missionが必要                                      |
| MissionDecision / rejectionReason             | IMPLEMENTED | REUSE                       | E06–07、採用／不採用と理由を保存                                                                     |
| ACCEPTEDの積極的嗜好としての活用              | PARTIAL     | CONNECT                     | E06は取得するがE07のdecisions要約は主に不採用。採用≠投稿成功                                         |
| MissionActivity / COPIED / POSTED             | IMPLEMENTED | REUSE                       | E06–07、actorとBunshinを絞る。copy≠実投稿                                                            |
| MissionFeedback GOOD/NEUTRAL/BAD              | IMPLEMENTED | REUSE                       | E07、E21、簡易評価。Goal成果とは別                                                                   |
| PostRecord / manualMetrics                    | IMPLEMENTED | REUSE                       | E08、E11、E17、任意の手入力／画像入力経路                                                            |
| PostPerformance                               | IMPLEMENTED | REUSE                       | E11、独立DBモデルではなくmanualMetrics.socialPerformanceのview                                       |
| SocialInsights                                | IMPLEMENTED | REUSE                       | 実DB名はSocialInsightSnapshot（E17）、E06の要約接続                                                  |
| Performance→次回判断                          | PARTIAL     | EXTEND                      | E08–11、接続済みだがengagementスコアとGoalの整合不足                                                 |
| performance-feedback-summary                  | IMPLEMENTED | REUSE                       | `apps/web/src/services/performance-feedback-summary.ts`、入力coverage／attention用。因果推定ではない |
| OwnerKnowledge / Official Knowledge           | IMPLEMENTED | REUSE                       | E06、E26、承認公開操作・ACTIVE group限定。名称だけでCustomer Memory共用不可                          |
| relevance-ranked selectedMemories→判断        | PARTIAL     | CONNECT                     | E01、E05、Brief後に選ぶ。daily-actionの最近3件は既にBrief前へ渡る                                    |
| 型付きsignalsUsed/ignored・材料充足度         | MISSING     | EXTEND                      | E14–17、sourceTypes／refsはあるがignoredやstage別根拠なし                                            |
| 言語上の本文重複抑止                          | IMPLEMENTED | REUSE                       | E12、exact／shingle／simhash、品質fail-closed                                                        |
| 意味上のtopic/angle/CTA/商品偏り抑止          | PARTIAL     | EXTEND                      | E03、E09、E12。語面検査とPromptのみでは保証しない                                                    |
| 投稿形式偏り抑止                              | PARTIAL     | REUSE / EXTEND              | E02、直近2format回避。制約上のfallbackは同形式を許す                                                 |
| Campaign / Season / Trend                     | PARTIAL     | REUSE / EXTEND              | E02、E04、E10、campaign認可・trend候補あり。統一season根拠／鮮度契約なし                             |
| Snapshotからの同一入力再現                    | PARTIAL     | EXTEND                      | E18、現在Memory／企業情報を再読込。完全な入力固定ではない                                            |
| 個別化Contextの組立て                         | DUPLICATED  | CONNECT                     | E05とE18のstrategy／profile等組立て。intent別の認可は維持して共通化候補                              |
| 今日のハッシーUX                              | PARTIAL     | EXTEND                      | E20–21、理由・日次・写真入口・設定drawerあり。4操作と判断説明の統一余地                              |
| Paid Image Generation                         | IMPLEMENTED | REUSE / DEFER               | E23、既存支払・利用枠・Jobを再利用                                                                   |
| Paid Video Generation                         | PARTIAL     | REUSE / DEFER               | E24–25、実Providerあり。ただしquotaだけで全経路の有料認可保証不可                                    |
| 自動投稿・自動MetricsのDecision Engine拡張    | MISSING     | DEFER                       | 今回は正式運用接続を検証しない。Provider／Channel境界を保つ                                          |

## 5. Goal Propagation / Decision Map

```text
Owner/Group scope + Company Profile + SNS Goal
  └─ Approved Strategy / Content Pillars
      └─ Confirmed Weekly Plan（strategy/version/goalとの対応）
          └─ Daily planning context
              ├─ recent missions（28日）/ activity / rejection / feedback
              ├─ manual performance / weekly outcomes / campaign / trend
              ├─ approved shared knowledge / personal daily-action材料
              └─ GenerateDailyMissionBrief + OpenAIDailyMissionPlanner
                  ├─ topic / angle / reason / format / time
                  └─ relevance-ranked selectedMemories（ここで選択）
                      └─ Content Generator → Quality / repair
                          └─ DailyMission + MissionContent + ContextSnapshot
                              ├─ 今日のカード / 理由 / 写真 / 別案
                              └─ ACCEPTED/REJECTED → COPIED/POSTED
                                  └─ Feedback / PostRecord / Insights
                                      └─ 次のWeekly / Dailyの入力
```

一般経路とserviceSafeMode経路は同一入力ではない。E06のサービス履歴要約はservice経路に限定される。共有Operator知識と顧客固有Memory／履歴は別経路である。

## 6. Q1–Q6

### Q1：今日のテーマを誰が決めるか

E02が確定Weekly itemのpillarとformat制約を選び、E03がcompany/goal/strategy/weekly/history等からtopic/angle/reasonを決める。E01の171行付近でBrief、204行付近で関連Memory選択、以後Content生成。生成してから後付け理由を作るだけの構造ではない。ただし品質修正時に「別の企画」をContent Generatorへ要求してもBriefを再決定しない（E13）。その後の説明整合は不足する。

### Q2：材料の実利用

| 材料                                                     | 判断入力としての状態                           | 限界                                                                            |
| -------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| Business Profile / SNS Goal / Strategy / Pillar / Weekly | 接続済み：E02–06                               | Prompt入力の存在≠出力品質の実証                                                 |
| 最近の投稿                                               | 接続済み：E01、E08                             | Daily recentMissionsは28日、Prompt説明は7日で不一致                             |
| ACCEPTED                                                 | 取得済み：E06                                  | positive preferenceの独立要約は弱い                                             |
| REJECTED / rejectionReason                               | 接続済み：E06–07                               | 理由を制約へ変換する一部はheuristic                                             |
| GOOD/BAD                                                 | 接続済み：E07–09                               | 利用者の感想であり事業成果ではない                                              |
| PostRecord / Performance                                 | 接続済み：E06、E08、E11                        | arbitrary weighted engagement、未取得と0の扱いに注意                            |
| Memory                                                   | 一部判断前、関連選択は判断後：E04–05           | plannerにUSER_MEMORY signalなし。写真等最近3件のpersonalMaterialsは別に既に入力 |
| Campaign                                                 | 期間・group・entitlement確認して接続：E04、E10 | campaignが現場状況を代表するとは限らない                                        |
| Season                                                   | 日付／企画文脈で部分的                         | 型付き根拠・鮮度・地域条件を固定した契約なし                                    |
| Trend                                                    | scoped候補のrank／usedTrend：E02               | 鮮度や実在の本番外部情報は未確認                                                |

### Q3：反応のよい投稿を繰り返す危険

ある。E07／E09は単一結果から断定しない指示を持つが、E11は `likes + comments*2 + saves*3 + shares*3 + follows*2` で上位topicを選ぶ。E22の改善案には「同じテーマを、最初の一言や写真を変えて次の投稿でも試します」という表現が接続される。これは今回の思想と緊張する。模擬テスト成功を因果推論の安全性と呼ばない。2回GOODという要約閾値も因果を証明しない。

### Q4：重複抑止

本文の同一／近似重複はE12が検査。formatは直近2件回避、campaignには比率とcooldownの検査がある。semantic topic/angle、CTA、特定商品への偏り、通常投稿全体の形式配分は包括的に構造検証されていない。CTAの共通定型だけで本文重複と扱わない設計もあり、CTA反復検査の代替にはならない。

### Q5：EngagementとBusiness Goalの衝突

明示的な優先順位の実装は確認できない。Company／SNS Goalを重視するPromptはある。Goal別outcomeは同Goalへ絞る一方、format feedback／strongTopicsは異なるGoalの過去投稿も含み得る（E08）。目標達成をlike最大化より優先する機械検証可能な契約が必要。

### Q6：判断と生成の分離

初回は分離済み。Briefは本文を返さない。しかし品質修正・variant・Photo Firstでの新たな判断、既存理由の保持、Snapshotの段階区分は不十分。分離を捨てず、既存経路を整える。

## 7. Decision Record調査

DailyMissionはtopic/angle/reason/format/missionDate、Snapshotはstrategy/version/goal、weekly/pillar、選択Memory、knowledge、Prompt/model/provider、品質情報、personalization sourceTypes/refsを持つ（E15–17）。保存は同一transaction。

不足：selectedCTA／action、判断専用Prompt/engine version、入力のstage、signalsIgnored、材料充足度、品質変更後の理由整合。E14のsourceTypesはBrief由来、availableSourceTypesはContent段階由来で混ざる。personalizationReasonは型にあるがSnapshot保存項目にはない。ContentのPrompt/modelをDecision Engineのversionと呼ばない。

**B推奨**：既存JSON契約に版付きdecision blockを追加する案。最初の契約・テストPRにはmigration不要。JSON validation／旧snapshot互換／再生成契約を調べてから保存接続する。既存BunshinMemory.confidenceは別用途であり流用しない。

## 8. UX・料金・OEM

日次カードと理由、採用／不採用、写真、簡易GOOD/NEUTRAL/BAD、設定drawerは再利用。通常ユーザーにAccount Strategy／Pillar／Analytics入力を毎日要求しない。目標設定・承認・必要な変更機能は残す。

FREE/PAIDの完全一致は **PARTIAL**。画像はSERVICE_PLAN/PILOT/SERVICE_CREDIT/POINTS等がある。動画は既存利用枠とProviderを持つが、commercial settingなし／上限nullで枠処理を通過する条件もある。さらに通常の別案はE27でALTERNATIVE_PLAN_GENERATIONのpoint reservationを通る。今回のFREE「考える／違う案」と現行課金との差分は価格ポリシー決定が必要。FREEでも運営側のAI推論原価・quota・Usage記録は必要であり、無制限生成を意味しない。

OEMはWorkspace/Group/Service/User/Bunshinの既存境界を再利用可能。Operator共通知識は承認済みGroup Knowledge、Customer固有入力はowner Memory／履歴として分離。E26のowner repository、E06のactor/group/ownerフィルタが根拠。全OEM経路の実DB認可E2E、漏えい不存在の保証は今回未確認。

## 9. 今回の検証

注入fetch／fixture、pure function、source boundaryを使う既存テストだけを実行した。実APIや本番資格情報は使っていない。Goal differentialのfixture／rubric合格は実LLMの投稿戦略差を証明しない。

実行ディレクトリはリポジトリルート。webパスは `apps/web/test/`、capabilityパスは `packages/capability-social/test/`。

```powershell
pnpm --filter web exec vitest run test/daily-mission-personalization.test.ts test/daily-mission-learning-history.test.ts test/daily-mission-persistence.test.ts test/daily-mission-content-quality.test.ts test/post-performance.test.ts test/performance-feedback-summary.test.ts test/social-image-payment.test.ts test/hassy-sns-goal-propagation-characterization.test.ts test/hassy-goal-differential-rubric.test.ts test/weekly-plan-generation.test.ts test/service-generation-knowledge.test.ts test/photo-first-variant-instructions.test.ts test/photo-first-entry-states.test.tsx test/mission-content-variant-context-boundary.test.ts test/daily-mission-planning-context-boundary.test.ts test/daily-mission-result-persistence-boundary.test.ts
pnpm --filter @bunshin/capability-social exec vitest run test/daily-mission-planner.test.ts test/weekly-planner.test.ts test/social-account-strategy.test.ts
pnpm --filter web exec vitest run test/daily-mission-quality-pipeline.test.ts test/openai-daily-mission-planner.test.ts test/openai-weekly-planner.test.ts test/openai-photo-first-analyzer.test.ts
```

結果：順に16 files / 78 passed、3 files / 34 passed、4 files / 20 passed。**合計23 files / 132 passed、失敗0**。既存テストは変更していない。

追加検査：`pnpm architecture:check` 成功。対象4文書のPrettier整形／checkと `git diff --cached --check` を実施する。変更ファイルは指定4文書のみで、本番ソース／DB／依存関係／設定には変更しない。

未実行：実AI Goal Differential／日本語品質比較、実DB isolation integration、全体lint/typecheck/build、実Provider／課金／保存／通知／本番E2E。運用実績・成功率・品質向上・原価低下は未測定。

## 10. 次の判断

新しいDecision Engine基盤ではなく、既存Brief周辺のContext契約・説明整合・Goal別結果の扱いを補強する。最初のPRはpure SOCIAL Decision Context契約と代表fixtureテストに限定する。保存／UI／料金／Provider変更は人間レビューと別の小PRに分ける。
