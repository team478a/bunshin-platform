# SOCIAL Decision Context Phase 1

## Decision / scope

2026-10-04 JST、ユーザーによるPR #1108監査承認後。基準main：`e935172ceeba740b180ae1ee22843393668e2033`。

既存DailyMissionPlannerInput、SocialAccountStrategyGoal、SocialGoalPlanningProfile、WeeklyPlan、MissionDecision/Activity/Feedback/PostRecord、WeeklyPlannerInput.recentPerformanceを再利用するpure contract/normalizerをSOCIALに追加する。本番呼出しは追加しない。

この文書をPhase 1のADR・設計判断記録とする。新Agent、Memory、Analytics、Decisionテーブル、migration、UI、Media、課金変更は対象外。

## Contract decisions

- scopeはworkspace/group/owner/Bunshinを必須にする。Customer固有sourceは同じscopeのenvelopeに包む。既存rowに存在するworkspace/Bunshin/actorも照合し、scope混在はFORBIDDENで全体を拒否する。owner情報を持たないrowのenvelopeは認可済みloaderの責務であり、公開入力を信頼して作らない。
- boundary checksはtrusted callerが認可・Capability・所有権・安全条件を確認した結果。pure関数自身はDB認可を実行できない。PASSED以外はBLOCKED、未知を成功扱いしない。
- priorityは1 boundary、2 current Goal/approved Strategy、3 confirmed Weekly/business facts/campaign/today、4 history/preference、5 same-Goal observation、6 season/trend。数値による成果最適化や投稿候補の自動採用はしない。
- 他Goal／Goal不明のPerformanceは保持するが判断用orderedSignalsから除外し、ignored理由を残す。現在GoalとStrategy/Weeklyの矛盾はREVIEW_REQUIREDとして勝手に修正しない。
- NO_DATA/UNAVAILABLE outcomeと全metric不明のPerformanceもNO_OBSERVATIONとして除外する。BLOCKED/REVIEW_REQUIREDはorderedSignalsを空にし、次PRのcallerは生成を開始しない。
- ACCEPTED/COPIED/POSTED/GOODは元の種類を保持し、感想や準備から投稿・Goal成果を合成しない。
- metricはMEASURED(value)とUNKNOWNで表す。measured 0を維持する。OutcomeのNO_DATA/UNAVAILABLE/SELF_REPORTEDから確定成果数を作らない。
- evidenceCompletenessは必要入力・履歴の充足度のみ。成功確率ではない。
- 必要な会社情報・profile・承認Strategy・確定WeeklyとGoal対応がそろい、履歴／有効な同Goal観測があればHIGH、履歴なしはMEDIUM、不足／不整合／boundary未確定はLOW。この閾値は品質や統計的確度の評価ではない。
- priority表はfreezeする。入力は変更せず、出力はcloneし、同一priorityの順序はIDで固定する。engagementScoreで順位を入れ替えない。

## 次PRの接続点（今回未接続）

1. `apps/web/src/services/daily-mission-generation.ts` の `buildDailyMissionPersonalizationBase` 後、`runDailyMissionBriefGeneration` 前でContextを作る。
2. `daily-mission-planning-context.ts` と `service-generation-knowledge-loader.ts` で実row→scope付きsourceを組む。既存RequireActiveBunshinCapability／owner認可を済ませてboundaryを確定する。summaryだけではGoal/ownerを復元できないため、Goal付き観測refsを限定取得する。
3. `daily-mission-brief-runtime.ts` → `GenerateDailyMissionBrief` → planner provider inputへorderedSignals・goalPlanning・limitationsを明示的に渡す別PR。旧personalizationを二重投入しない。BLOCKED/REVIEW_REQUIREDの扱いを合意してから接続する。
4. selectedMemoriesは現在Brief後。今回は新Memory検索を入れない。次PRで判断前の限定取得を検討し、現在のpersonalMaterialsを二重計上しない。
5. Snapshot保存、修正後reason整合、Photo First接続、無料別案の料金はPhase 1に含めない。

次PRの対象Service判定は既存runtime config／service境界を使い、他のSOCIALサービスへ会社情報必須を一律適用しない。

next adapterはContext全体をJSONでPromptへdumpしない。必要なfact／要約／参照だけをwhitelistする。既存Campaign期限・参加認可、Trend safety/freshness/rank、入力長・所有権検査を置き換えない。原データのnullを、既存engagement集計の0から逆算して復元しない。Goal不明の旧データはUNKNOWN_GOALとし、現在Goalを推測で付けない。

## 検証・残課題

今回のfake/pureテストはscope、優先順位、欠損、観測の意味を検査する。実AIのGoal差・品質、実DB認可、本番E2Eの証明ではない。未接続なので利用者向け生成挙動は変わらない。

## 実行結果

環境：Windows / PowerShell、Node 24.21.0、pnpm 10.10.0、2026-10-04 JST。

| コマンド                                                                                                                                                                                                                                                                                                                            | 結果                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm --filter @bunshin/capability-social exec vitest run test/social-decision-context.test.ts`                                                                                                                                                                                                                                     | 新規39件成功                                                                                |
| `pnpm --filter @bunshin/capability-social test`                                                                                                                                                                                                                                                                                     | 25ファイル249件成功（上記39件を含む）                                                       |
| `pnpm --filter @bunshin/capability-social typecheck` / `lint` / `build`                                                                                                                                                                                                                                                             | 全て成功                                                                                    |
| `pnpm --filter web exec vitest run test/daily-mission-personalization.test.ts test/daily-mission-learning-history.test.ts test/hassy-sns-goal-propagation-characterization.test.ts test/weekly-plan-generation.test.ts test/daily-mission-planning-context-boundary.test.ts test/daily-mission-result-persistence-boundary.test.ts` | 6ファイル28件成功                                                                           |
| `pnpm typecheck`                                                                                                                                                                                                                                                                                                                    | 全体25 tasks成功（15 cached）。依存buildのPrisma Client generateあり、migration／DB接続なし |
| `pnpm architecture:check` / `pnpm test:architecture`                                                                                                                                                                                                                                                                                | 成功／10件成功                                                                              |
| `pnpm format:check`                                                                                                                                                                                                                                                                                                                 | 初回は編集中の追加テストの整形で失敗、整形後再実行で成功                                    |

全体lintは成功（25 tasks、20 cached）。未変更の `apps/web/app/consent/page.tsx:61` に既存のeslint-disable未使用warningが1件あり、修正対象外。全体build／全体test／実DB／実Provider／本番E2Eはローカル未実行。対象package buildと関連回帰に限定した。GitHub通常CIの結果は別に報告する。

## 変更ファイル・切り戻し

`packages/capability-social/src/social-decision-context.ts`、同`src/index.ts`の公開export、同`test/social-decision-context.test.ts`、本報告書のみ。本番web呼出しを追加していないため、revertで旧生成経路へ影響を与えず取り消せる。料金／Media／DB／UI／依存／設定は差分なし。
