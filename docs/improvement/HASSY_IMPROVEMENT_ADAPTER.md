# Hassy Improvement Adapter Phase 0監査

基準SHA: `cda2bf87bb741fa510e5f655569e3790a3af03ea`。調査日: 2026-10-02 JST。Adapter実装は未着手。

## 既存記録のmapping

| Signal                     | 既存sourceと実経路                                                                                               | 改善目的・限界                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 登録/再訪/通知同意         | `ServiceMembershipEvent`                                                                                         | 共通会員イベント。初期設定の全step記録は未確認                          |
| 閲覧/採用/別案/コピー/投稿 | `MissionActivity`、`MissionDecision`、`PostRecord`。`serviceOperationsReportExportResponse`がService scopeで集計 | UX候補。件数はユニーク人数やフロー完了率と異なる                        |
| SNS Goal                   | `GenerationContextSnapshot`、承認済みStrategy、Barrier EvidenceのgoalAttribution/goalMetrics                     | 現在Goalで過去記録を補完しない                                          |
| Photo First品質            | `MissionContentVariantGeneration`、`listQualityAudits`                                                           | issue code、最終verdict、repairCountあり。元写真/回答/本文は渡さない    |
| Provider失敗/原価          | `AiUsageEvent`、`Job`                                                                                            | 推定原価と未確定原価を区別。失敗件数から二重請求を推定しない            |
| LINE                       | Delivery/Attempt/DeepLinkと既存運用集計                                                                          | 通知失敗とユーザー未実行を分離。LINE ID・通知本文は除外                 |
| 障壁確認・無料支援         | Barrier Case/Evidence/Confirmation/SupportInterventionと確認Repository                                           | User Success。Goal別代表3組がmainへマージ済み                           |
| 支援完了/見送り/再発       | `definitionSnapshot.selection`、status/timestamps、Case.recurrenceCount                                          | 現行summaryはGoalと期間を選択しない。再発回数が各支援の効果とは限らない |
| 投稿結果                   | `PostRecord.manualMetrics.businessOutcomes`、MissionFeedback                                                     | 自己申告。実予約/売上/応募の外部照合ではない                            |
| OEM支援候補                | `SocialActivityOemSupportCandidate`とAudit                                                                       | 利用者支援候補。製品改善Candidateとは別resource                         |

## 直近残タスクの取り込み

PR #1080はマージ済み。認知×UNKNOWN、問い合わせ×LEAD、採用×RESPONSEの支援定義とSnapshot保存は実装済み。共通Engine側へその文面を移動せず、Hassy側のsignalとして読む。

次の読取作業で、支援提供時GoalをSnapshotから復元し、Goal未設定・COMMON・旧Snapshot・混在を別bucketへ残す。完了率は同じ提供期間cohortの「提供件数」を分母とし、accepted/completed/skippedは状態と実時刻の定義を明示する。現行stateからACCEPTの全履歴を再現できるかは未確認であり、過去時点の状態を推測しない。

再発評価は支援完了後の観測期間・障害日除外・Goal変更を扱う。Caseの`recurrenceCount`だけで「支援で改善しなかった」と断定しない。既存resolutionは14日後の非再検出を使うが、Goal別の改善効果はまだ評価できない。

Photo First品質は品質issue発生、修正後PASS、最終不合格、品質検査未実行を分ける。listQualityAuditsの100件上限を完全な母集団とみなさず、Service権限で読む集計Portの必要性を次PRで判断する。本人用認可を管理者用へ単に緩めない。

## 最初の検知候補

- `AI_QUALITY / PHOTO_FIRST`: 同品質codeの急増。最小母数・時間窓・rule/prompt版・検査未実行の欠損を確認する。
- `INTEGRATION / LINE`: 送信失敗率の増加。外部障害、同意、契約停止等の意図した拒否を区別する。
- `UX / PERSONALIZATION`: 同一Serviceで別案/拒否の偏り。選択理由がない場合は仮説として提示する。
- `SERVICE_SPECIFIC / BARRIER`: 確認済みBarrierと支援完了率。User Success候補として分類する。

閾値は未確定。10〜20社モニターでは影響人数の小ささとOEM再識別を考慮し、自動検知のみで重大バグや事業効果を断定しない。

## 次PRのテスト観点

Hassy読取Adapterでは、架空の2Workspace/2Service/2User/2Bunshinを使い、別scopeの記録混入を拒否する。旧Evidence、Goal変更、COMMON fallback、未帰属Insight、quality前失敗、repair後PASS、100件打切り、Provider障害日を固定ケースにする。元データに秘密値や自由文があってもallowlist外を落とす。

既存テストの根拠:

- `packages/database/test/mission-content-variant-quality-audit-query.test.ts`
- `packages/database/test/social-activity-barrier-summary.test.ts`
- `packages/database/test/social-activity-barrier-confirmation-repository.test.ts`
- `packages/database/test/social-activity-barrier-resolution.test.ts`
- `packages/database/test/ai-training-barrier-boundary.test.ts`

これらの成功は既存fake DB契約の証拠であり、新しいEngine、Adapter、本番データ、モニター効果の検証ではない。今回の実行結果は共通文書の検証記録を参照する。
