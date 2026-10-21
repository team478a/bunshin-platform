# AI進化対応 Capability Gap Analysis

基準: 2026-10-09 / main `5b4957f1f2a983aa571ebd72d73ec4d67c3bbe84`。判定・テスト・根拠は [現状監査](CURRENT_STATE_AUDIT.md)。本書は未承認の変更候補で、実装指示や本番GOではない。

## Gapと優先度

P0はモデル切替前、P1はサービス改善、P2は運用実証後。NEWは「直ちに新基盤を作る」という意味ではない。

| ID / 項目                      | 現状判定                          | 再利用                                                                   | 最小変更候補 / Scope                                                                                                      | 優先度・受入条件                                                                        | リスク                                             |
| ------------------------------ | --------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------- |
| G01 モデル変更品質比較         | 一部実装                          | Daily品質、training Rubric/Skill評価、strict schema、既存回帰            | 合成の固定datasetと旧/候補model比較report、taskごとの合格条件 / AI Package + test                                         | P0。学習境界/事実/tenant/JSONは必須、品質/latency/costは別集計、人間承認なし切替不可    | schemaが通るだけで品質向上と誤認                   |
| G02 task別model互換policy      | 一部実装                          | runtime resolver、Provider Configuration version                         | text planning/assessmentの必要機能とparameter/limitを小さいtyped契約で表現。まず静的allowlist / Application + web Adapter | P0。未検証model/schema/toolは拒否、pause/budget/Pilot Gate維持、既存global fallback互換 | 共通model変更が他用途へ波及。巨大動的Registry化    |
| G03 transport・timeout不統一   | 一部実装                          | mission response helper、fetch DI、Job retry                             | Hassy Weekly/Strategyからtimeout・失敗分類の最小共通helperを段階適用 / web Adapter                                        | P0。timeout/429/5xx/未完了を試験、再試行を重ねない、Domain Promptを移動しない           | 二重retry・二重費用、in-flightはSTOP後も完了し得る |
| G04 原価の欠損・二重集計       | 一部実装                          | AiUsageEvent、Pilot ai-call/pricing、attempt/idempotency                 | 同attemptの正本選択、coverage/UNKNOWN率、task別token/価格版の対応一覧 / Observability                                     | P0。欠損0円化なし、成功/失敗/再試行を区別、token集計二重なし                            | best-effort保存失敗、設定概算を実費扱い            |
| G05 OEM/Serviceへの原価帰属    | 一部実装                          | workspace scope、Enrollment/Service/OEM期間、usage                       | 呼出し時scopeと所属履歴の確定関係を設計し、合成fixtureで検証。保存不足なら別schema審査 / OEM + Observability              | P1。複数Service参加/所属変更で誤配賦なし、推定と不明を区別                              | 現actor所属だけで過去原価を付替え・越境            |
| G06 Hassy履歴改善の効果検証    | 一部実装                          | history要約→Daily input、Weekly元Goal/Performance、adopt/reject          | 同期間/母数/Prompt/Modelで履歴反映と採用率を比較。小標本は結論保留 / SOCIAL + Service                                     | P1。反映経路回帰、拒否理由漏えいなし、未測定≠低成果                                     | 因果誤認・単発理由で永久好み化                     |
| G07 Manaberu自力再現           | 一部実装                          | Guided Practice/First Success/Capability Evidence、既存Assessment/Router | 3Definition内で別題材の再現確認候補、評価証拠の十分性と本人申告の区別 / AI_TRAINING                                       | P1。Level自動断定なし、本文をCore/Eventへ複製しない、既存unknown保持                    | 高品質成果物を本人能力と混同                       |
| G08 支援量適応                 | 未実装（自動適応部分）            | Support Level、Barrier、Skill Evidence                                   | まず手動/決定的候補と必要証拠を検証、Teaching生成は後 / AI_TRAINING                                                       | P2。難易度と支援量を分離、証拠不足なら維持/確認                                         | 早い支援削減で学習失敗                             |
| G09 改善候補→承認指示案        | 一部実装                          | Observation/Triage/Feedback Review、eligible純粋条件                     | 最小匿名化reportと人間承認済み指示draft。source revision/禁止範囲/検証を固定 / Improvement + operations                   | P1。REVIEWED≠APPROVED、顧客本文/secret外部送信なし                                      | ログを命令として扱うPrompt injection、自動本番変更 |
| G10 Dots/Codex接続             | 未実装 / Dots製品・権限は確認不能 | AGENTS、GitHub PR/CI、人間review、公開Codex SDK                          | 手動指示handoffから実証。Dotsは製品/仕様/料金特定後に再監査 / Operations                                                  | P2。repo最小権限・隔離branch・実行/PR/merge/deployを別承認                              | APIの存在を仮定、承認省略、運用費増                |
| G11 main/production差・OEM適用 | 実装済み・動作未確認（本番適用）  | #1176報告・Migration監査、production guard                               | 別release審査でbackup/schema/RLS/差分を確認。今回deployしない / Release + OEM                                             | P0（OEM本番導入前）。登録RとFREE利用A、AI_TRAINING FREE禁止、history/cutover承認        | main全体deployでMigration巻込み・請求変更          |
| G12 万能共通Memory/Agent基盤   | 未実装                            | Knowledge Grant/Bunshin Memory/Program Runtime                           | 今回不要。Service/Packageごとのprojectionを維持 / Core                                                                    | 実装しない。明示Grant/tenant境界を維持                                                  | 資産の暗黙共有・過剰抽象化                         |

## モデル追加時の実際の変更範囲

1. 同一API/同parameter/schemaのmodel: 設定versionだけで切替可能な入口はあるが、G01の品質比較とG02互換確認が先。文字列更新のみで安全とは言えない。
2. 推論/parameter差のあるtext model: `missionReasoningOptions`、training strict schema/出力上限、各Adapter optionsとparserの確認が必要。
3. 新modality: 画像/音声専用Adapterとmodel設定を対象にする。text global modelを変更して代用しない。
4. 新Provider: Portは再利用可能。認可・secret・timeout・usage・validation・費用・停止・回帰をProvider Adapter単位で追加する。Core/Packageにvendor名を持ち込まない。
5. 開発用Codex/Dots: 学習/投稿Runtimeに入れず運用経路として審査。使用目的を教材/改善draftに限定しても、それだけで書込・merge・deploy権限は生じない。

## 最優先3項目

1. **モデル更新の品質比較Gate（G01）**: 新AIを使う前に、両サービスの価値と禁止境界が保たれることを測る。
2. **小さいtask互換policyと呼出し安全性（G02/G03）**: 全サービスへ一斉波及せず、必要な処理から切替可能にする。
3. **原価計測の信頼性・帰属（G04/G05）**: 安いmodelを選べたか、不明が残るか、OEMごとの負担が分かる状態にする。

現在「高額modelを不要に使っている」と断定できる比較実測はない。価格だけの自動選択・高品質とみなした自動昇格は提案しない。
