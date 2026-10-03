# HASSY Decision Engine — Gap Analysis

調査基準：`abddae07a5fd7e0afbaf9c7669ba62e302832e1f`、2026-10-04 JST。Evidence IDは [Current State Audit](HASSY_DECISION_ENGINE_CURRENT_STATE_AUDIT.md#3-evidence-index) に定義した実ファイル／シンボルを参照する。これは実装指示の承認ではない。

## 1. 最大の差分

不足は生成能力ではなく **会社ごとの判断を説明・追跡・制約する契約**。現在も判断が先にあるため、全体置換は不要。Weekly Planに沿いながら、履歴・当日制約・Goalをどう優先したか、何を採用せず、生成後も理由が一致するかを明確にする。

| Gap / 優先度                           | Status      | Action        | 現行根拠                        | 最小変更候補／合格条件                                                                          |
| -------------------------------------- | ----------- | ------------- | ------------------------------- | ----------------------------------------------------------------------------------------------- |
| P0 判断入力の共通契約                  | PARTIAL     | EXTEND        | E02–07、E18                     | stage付きtyped Context。会社・Goal・Strategy・Weekly・履歴・写真入力の有無と出所をfixtureで確認 |
| P0 判断理由と最終内容の一致            | PARTIAL     | EXTEND        | E13–16                          | semantic repairで企画変更なら再Briefまたは明示的decision revision。旧reasonを黙って維持しない   |
| P0 Business Goal優先と成果の非因果扱い | PARTIAL     | EXTEND        | E08–11、E22                     | approved current SNS goal優先、反応は参考。1件GOOD／like多数だけでpillarを切替えない            |
| P0 別案のFREE価格方針                  | PARTIAL     | EXTEND        | E27                             | POINTSを使う現行経路とFREE要件を合意。quota維持、mediaには波及させない                          |
| P1 Goal外の過去反応                    | PARTIAL     | EXTEND        | E08                             | 同Goal成果と他Goalの一般嗜好を分離。変更前履歴は削除せず低確度の参考として表示                  |
| P1 Memoryの判断前利用                  | PARTIAL     | CONNECT       | E04–05                          | 最近材料は再利用。関連選択のqueryを企業／Weekly／Goalにして判断前に限定取得する案を比較         |
| P1 evidence completeness               | MISSING     | EXTEND        | E14–17                          | HIGH/MEDIUM/LOWは入力充足のみ。成果成功確率や学習精度と表示しない                               |
| P1 topic/angle/CTA/商品のsemantic偏り  | PARTIAL     | EXTEND        | E02、E09、E12                   | Brief候補段階で履歴比較。新形式にするためGoalを犠牲にしない。不可避反復には理由を残す           |
| P1 Tomorrow/Todayの状況                | PARTIAL     | EXTEND        | E02、E19                        | 任意の当日制約を取り込む。休業・空き枠・キャンペーンを推測で捏造しない                          |
| P1 Today HASSY表示                     | PARTIAL     | EXTEND        | E20–21                          | 1提案＋短い理由＋1行動＋基本4操作。高度設定は補助drawerへ                                       |
| P1 結果の意味                          | PARTIAL     | EXTEND        | E07–11                          | GOODは感想、Goal outcomeは任意の別値、未観測はUNKNOWN。コピーを投稿扱いしない                   |
| P2 Photo Firstの独立判断入口           | PARTIAL     | CONNECT       | E18–19                          | 現行のWeekly/Mission前提を明記。写真からの新decisionと既存variantの履歴を同一正本に結ぶ         |
| P2 同一判断の再現                      | PARTIAL     | EXTEND        | E18                             | mutable Memory／企業情報の再読込を明示。再試行と新判断を区別し、変更時はsilent drift禁止        |
| P2 Context assemblyの重複              | DUPLICATED  | CONNECT       | E05、E18                        | pure mapper共有。サービスowner認可と一般管理認可は統合して弱めない                              |
| P2 有料動画の価格・認可保証            | PARTIAL     | REUSE / DEFER | E24–25                          | quotaだけを課金認可と呼ばず、入口→契約→予約→Jobの限定監査を別途行う                             |
| P3 新Agent Framework                   | MISSING     | DEFER         | E01–03の既存Plannerで判断を分離 | 新Frameworkは不要。現在の構造を維持する                                                         |
| P3 Memory/Analytics/Media基盤          | IMPLEMENTED | REUSE / DEFER | E06、E11、E24–26に既存資産      | 別基盤の追加は不要。既存部品を拡張する                                                          |

新Agentがなくても既存Plannerの判断→生成の順序を利用できる。

## 2. Learning Engineへ寄せないための条件

現在のE11の固定engagement重みと上位topic選定、E22の「一言／写真を変えて同じテーマ」ガイダンスは、単純反復へ寄る余地がある。既存Promptには別の問い／場面を使い、単一結果から断定しない指示があるが、衝突を機械判定する契約はない。

後続の安全条件：

- 投稿結果を「観測」と「仮説」に分ける。曜日、素材、CTA、キャンペーン等の交絡を列挙し、因果と呼ばない。
- absent metricsと測定0を区別。E11のranking時null→0、all-zero除外の現行仕様を成果失敗判定へ転用しない。
- 反応のよいテーマは一候補にすぎない。SNS Goal、approved Strategy、pillar配分、重複回避が先。
- 同Goal outcomeの計測／自己申告／未観測を区別。異なるGoalの記録は削除せず参考signalとして明示。
- recommendation reasonの「なぜ今日」は実際のsignalに限定。好調、季節、予約可能性、求人状況を架空の事実として使わない。
- Feedback回数が増えただけでconfidenceを成果確率へ変換しない。

## 3. FREE / PAID差分

| 領域                                          | 現行                                               | 判定・計画                                                      |
| --------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| Strategy / Weekly / Daily / 本文 / CTA / 指示 | 既存AI runtime・Usage・quota                       | FREEの顧客体験と両立可能。ただしFREEは運営原価0／無制限ではない |
| 別案 / 再生成                                 | E27がポイント予約・確定・失敗解放                  | 今回FREE方針と未整合。料金合意前に予約を削除しない              |
| Photo First                                   | 写真分析・variant・quota既存                       | 撮影指示／企画と、Providerの画像生成を区別。価格最終承認未確認  |
| AI画像 / carousel                             | E23にSERVICE_PLAN、PILOT、SERVICE_CREDIT、POINTS等 | REUSE。有料境界をDecision Context更新で迂回しない               |
| short video / reel                            | E24–25に既存Provider／Revision／quota              | REUSE。quota設定なし等の条件があり全経路の有料性は未確認        |
| 投稿・自動計測・高度分析                      | 今回正式接続を未検証                               | DEFER。FREE SOCIALへ先回りして追加しない                        |

支払種別が複数あること自体はDUPLICATEDではない。支払責務／契約が異なる。支払予約とAIUsage原価を同一会計として扱わない。

## 4. UIから隠す候補（削除しない）

E20には既に「その他のメニュー」と詳細設定がある。これを再利用し、Content Pillar、Account Strategyの詳細編集、Weekly Planの内部分類、詳細数値Analyticsを日次中心画面から外す。operator/adminには残す。Goalの選択・Strategy承認・通知設定・投稿内容確認は必要操作として残す。

ミッション／Capability／Provider等の用語を利用者へ要求せず「今日の提案」「写真から考える」「違う案」「今日は使わない」で包む。設定UIを隠すことと認可を外すことは別。

## 5. OEM影響と二重実装防止

再利用する正本：Business Profile、SocialAccountStrategy、ContentPillar、WeeklyPlan、DailyMission、MissionDecision/Activity/Feedback、PostRecord、GenerationContextSnapshot、BunshinMemory、Group Knowledge、既存Job／支払台帳／Media Storage。

二重実装リスク：新HassyDecisionにtopic/reason/strategy/履歴を再コピー、新Memory store、別performance ranking DB、別Photo First企画経路、新画像／動画Worker。いずれも初手では不要。

Operator共通知識は承認済みgroup範囲の教材／方針のみ。顧客固有memory・decision・performanceはworkspace/groupに加えてowner/Bunshinで制限する。Workspace内のcustomer間でも暗黙共有しない。顧客素材・反応を共通知識へ昇格するには別の権限・同意・確認が必要であり、今回は設計しない。

## 6. GO判断とレビュー条件

CONDITIONAL GO：pure Context契約とfixtureによる代表判断テストの小PR。既存Briefと生成を維持する。

GOに必要なレビュー：Goal優先順位、意味的重複の例外、FREE別案の利用上限・価格、理由の変更履歴、operator/customer権限、snapshot後方互換。

NO-GO：現状を「因果学習で売上最適化済み」と公開すること、未確認の結果を成功確率にすること、新Agent／新Media基盤、無人SNS投稿、本番への一括切替え。

未確認：実AIの目的別戦略差と理由整合、実DB全認可経路、全有料動画経路、承認戦略変更後のvariant挙動の意図、顧客Goal変更と確定Weekly更新のUX、入力・Prompt同一時の実LLM再現性。これらは132件の既存テスト成功と区別する。
