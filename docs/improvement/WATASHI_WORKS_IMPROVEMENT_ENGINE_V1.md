# ワタシワークス Improvement Engine V1

## Phase 0の結論

既存の行動・AI利用・品質・Barrier・LINE記録を読み取る方式で開始する。原本を複製する汎用ログ基盤や外部監視サービスは先行追加しない。共通Engineは分類・Evidence・Candidate・承認・検証契約を担当し、SNS GoalやPhoto Firstの解釈はHassy Adapterへ置く。

現時点で共通Improvement Issue、Candidate、承認からCodex指示案への接続、修正前後比較は調査範囲のコードから確認できない。既存のSupportCaseやOEM支援候補は異なる目的のため、そのまま共通改善Issueとは扱わない。

本PRはPhase 0監査と設計案の3文書のみ。Phase 1以降の契約・コード・永続化・管理画面は未実装である。

## 調査基準と制約

- 日時: 2026-10-02、Asia/Tokyo。
- repository: `team478a/bunshin-platform`。
- 最新main / 基準SHA: `cda2bf87bb741fa510e5f655569e3790a3af03ea`（PR #1080 merge）。
- ブランチ: `codex/improvement-engine-phase0-audit`。
- 環境: Windows、PowerShell、既存pnpm/Vitest環境。
- 根拠: 添付Improvement Engine指示書全34項目、AGENTS、仕様のAI/Job/Privacy規定、Architecture Principles、Decision Log、Roadmap、下記の実コード・既存テスト。
- 主checkoutに既存の競合・未コミット変更があるため、cleanな既存worktreeで最新mainから専用ブランチを作成した。
- 本番DB、顧客素材、秘密情報、実Provider、LINE送信、デプロイ状況は未調査。本番反映SHA、記録件数、欠損率は未確認。

## 既存実装との差分

| 要件                  | 現行実装・根拠                                                                                                            | 接続と限界                                                                                                                          | 方針                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| AI失敗・原価          | `AiUsageEvent`、`PrismaAiUsageEventRepository.record` (`packages/database/src/ai-usage.ts`)                               | workspace/actor/Bunshin照合と冪等upsertあり。task/model/prompt/cost/errorを記録。Service ID、release、共通correlationは直接持たない | 原本参照。null原価は未確定として保持                        |
| 非同期障害            | `Job` (`packages/database/prisma/schema.prisma`)                                                                          | correlationId、環境、lease、attempt、errorあり。全操作がJob経由とは限らない                                                         | Job単位と論理操作単位を区別                                 |
| 利用者行動            | `MissionActivity`、`MissionDecision`、`PostRecord`                                                                        | service operations reportが本人のServiceに属すBunshinから集計                                                                       | 行動を再利用。閲覧がないことだけで離脱確定しない            |
| 共通会員イベント      | `ServiceMembershipEvent`、`ServiceUsageEvent` (schema)                                                                    | workspace/group/membership/user、日時、冪等性あり。後者はOEM請求台帳                                                                | 読取のみ。分析イベントを請求台帳へ書き込まない              |
| 投稿Feedback          | `MissionFeedback`、`PostRecord.manualMetrics`                                                                             | 本人らしさ評価・自己申告成果。困ったFeedbackとは異なる                                                                              | Hassy側で意味を解釈                                         |
| Photo First品質       | `PrismaMissionContentVariantRepository.listQualityAudits` (`packages/database/src/mission-content-variant-repository.ts`) | 本人Mission認可後、品質code/verdict/repairを最大100件照会。本文・回答は非返却                                                       | 戻り件数100では完全性不明。集計用途のPortが必要             |
| Barrier本人確認・支援 | `SocialActivityBarrierCase/Evidence/Confirmation/SupportIntervention`、confirmation repository                            | 本人確認、Goal別代表3組、完了/見送りSnapshotあり                                                                                    | User Successとして再利用                                    |
| 支援結果集計          | `getSocialActivityBarrierServiceSummary` (`packages/database/src/social-activity-barrier-summary.ts`)                     | workspace/group/ACTIVE membership限定。category/statusのみ、全Goal合算、期間条件なし                                                | Goal帰属と提供期間別の分母を追加候補とする                  |
| 支援後の解決          | `resolveImprovedSocialActivityBarriers` (`packages/database/src/social-activity-barrier-resolution.ts`)                   | 完了後14日以上、障害日なしで再観測。全Goal分類の非再検出を解決として記録                                                            | 共通IssueのFIXED/VERIFYINGとは別。因果効果を断定しない      |
| LINE・管理集計        | `createAdminOperationsSnapshot`、`serviceOperationsReportExportResponse`、`PrismaAdminAuditLogRepository.list`            | 全体管理とService管理は別経路。Service reportはmanaged context認可あり                                                              | 改善専用集計の権限を明示し、全体管理QueryをOEMへ流用しない  |
| 問い合わせ管理        | `packages/database/src/admin-support-cases.ts`                                                                            | 管理者SupportCaseと履歴あり                                                                                                         | 利用者起点の共通「困った」経路は未確認。改善Candidateと分離 |
| 研修の拡張根拠        | `PrismaTrainingBarrierRepository.record` (`packages/database/src/training-barrier.ts`)                                    | enrollment lock、本人参加・期間確認、ProgramActionEventへ記録                                                                       | 第2Adapterの設計検証に使用。SNS定義を共有しない             |
| 共通Issue・Candidate  | 対象packages/webの名称・概念検索                                                                                          | 共通一連の実行経路は確認できない                                                                                                    | 段階的な新規契約と永続化が必要                              |
| 修正後比較・Reopen    | 共通経路は未確認                                                                                                          | 比較母数・期間・release版の契約が必要                                                                                               | Phase 8で実装。FIXEDのみで完了にしない                      |

Adapterの存在、schemaの存在、過去報告だけで本番利用可能とは判定しない。この表はコード確認であり、本番E2E証跡ではない。

## データフローと境界

```text
既存業務記録（Service / Workspace / User / Bunshinの認可）
  -> Databaseの許可済み読取Port
  -> Hassy Adapter（Goal / Photo First / Barrierの分類と匿名化）
  -> 共通Engine（重複排除 / 時間窓 / Evidence / Candidate）
  -> 管理者TRIAGE / APPROVE / REJECT
  -> 承認済みCandidateのCodex指示案をコピー
  -> 人間が開発を開始 / CI / 修正SHAを記録
  -> 同じ定義の指標でVERIFY / CLOSE / REOPEN
```

`groupId`をServiceの内部識別として使用する既存経路がある。tenantをブランド名から推測しない。operatorは運営主体、actorは実行者、userは観測対象として分ける。Workspaceとtenantの対応は権限・契約の正本から明示解決する。

OEM管理者には自Workspace/Serviceのみ。本部向け横断表示は個票を先に集めず、各scopeで作った非識別集計を統合する。小母数セルの表示抑止、目的・保存期間・削除時の追従は運用方針の確定が必要。PlatformAdminであるだけで全素材の送信を許可しない。

本文、写真、確認回答、会話、Memory、Token、署名URL、Provider raw responseをEvidenceへ複製しない。イベントmetadataは分類code等のallowlistだけ。共有画面・Codex指示案では直接User IDを除き、匿名化しても再識別リスクが残ることを扱う。

## Issue taxonomyと状態

共通分類: `BUG / UX / USER_ERROR / AI_QUALITY / PERFORMANCE / DATA_ANALYTICS / INTEGRATION / SECURITY_PRIVACY / SERVICE_SPECIFIC / UNKNOWN`。

目的: `PRODUCT_IMPROVEMENT / USER_SUCCESS / BUSINESS_IMPROVEMENT`。TIME一件をBUGへ変換しない。品質code急増は母数・外部障害・ルール変更を確認してProduct候補にする。相関だけの継続率差はBusiness仮説とする。

状態案: `DETECTED -> TRIAGED -> APPROVED -> IN_DEVELOPMENT -> FIXED -> VERIFYING -> CLOSED`。`TRIAGED -> REJECTED`、`VERIFYING/CLOSED -> REOPENED`を許可する。権限・Evidence revision・actor・理由を含む遷移履歴を保存する。観測不足はINCONCLUSIVEとしてVERIFYINGを維持し、改善なしを確認した場合にREOPENEDとする。

## 残タスクと実装順

| 順序 | 小さな作業単位                 | 完了条件                                                                                    | schema                       |
| ---- | ------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------- |
| 0    | 本監査・Adapter設計            | 実コードの差分、Privacy、未確認事項、テストを記録                                           | 不要                         |
| 1    | 共通domain / Adapter Contract  | 純粋型・validation・分類・Evidence完全性。Hassyと研修の架空入力で固有型漏れと越境拒否を検証 | 不要                         |
| 2    | Hassy読取AdapterとGoal支援結果 | 既存SnapshotからGoalを復元、期間/母数/未帰属/欠損/取得打切りを出す                          | まず不要として検証           |
| 3    | correlation不足の最小補完      | 明示FKで結べない工程を一覧化し、必要箇所だけ相関情報を設計                                  | 不足が実証された場合のみ     |
| 4    | 共通「困った」Feedback         | 本人scope、限定選択肢、サイズ制限、Origin/入力検証、二重送信防止                            | 保存先の比較が必要           |
| 5    | 決定的Detection / Evidence     | ルール版・時間窓・distinct影響人数・外部障害除外・少数母数で保留                            | 永続化案レビュー後           |
| 6    | Candidate・承認・Center        | 自tenant RBAC、Evidence revision、監査、推定と事実を別表示                                  | migration/rollback設計が必要 |
| 7    | Codex指示案コピー              | APPROVEDのみ、禁止範囲/再現/検証/完了条件を包含、外部自動実行なし                           | 既存Candidate保存案による    |
| 8    | 修正前後比較 / Reopen          | 同指標・同母数条件・SHA・rule版・比較不能理由を記録                                         | 比較snapshot設計による       |
| 9    | 10〜20社モニター               | 閾値の誤検出、管理負担、Candidate有用性を測定                                               | 運用作業                     |
| 10   | 第2Adapter                     | 研修固有Barrier・成功条件を追加して共通Engine変更量を確認                                   | 必要性を再評価               |

次の最小タスクは順序1の非永続・非Providerの契約実装。既存のGoal支援評価とPhoto First品質観測は順序2へ統合し、別の監視基盤を並行新設しない。本番E2E、複数業種のGoal品質、Secondary Goals、外部KPI照合は継続課題であり、本Engine実装で完了扱いにしない。

大規模schema変更・新規外部サービスが必要と判明した時点で停止し、選択肢・影響・rollbackを報告する。Phase 0でmigration/rollbackは不要。文書PRの取り消しだけで戻せる。

## 検証と未確認

2026-10-02 JSTに、既存の品質照会・Barrier集計/確認/解決・研修境界テストをfake Prisma、外部APIなしで実行した。

```text
cd packages/database
pnpm exec vitest run test/mission-content-variant-quality-audit-query.test.ts
  test/social-activity-barrier-summary.test.ts
  test/social-activity-barrier-confirmation-repository.test.ts
  test/social-activity-barrier-resolution.test.ts
  test/ai-training-barrier-boundary.test.ts
結果: Test Files 5 passed / Tests 13 passed
```

上のコマンドは1行で実行する。docsのPrettierと`git diff --check`も成功。文書のみの変更のため、新規型検査/lint/buildのローカル再実行は行わず、通常PR CIで全体検証する。新規Engine/Adapterのテスト、本番DB、本番E2E、実Provider、LINE送信は未実行。既存fake契約の成功を共通Engineの完成とは扱わない。

未確認: 全主要操作のイベント記録率、直接FKによる相関充足率、原価欠損率、release SHA取得、研修/占い全経路、共通Feedback UIの全画面網羅、保持期限、本部集計の少数セル方針、本番記録と本番E2E。

## モニター開始前チェックリスト

- [ ] 本番SHA・migration状況と各収集経路を確認。
- [ ] 対象10〜20社、利用目的、同意、権限、保持期間を確定。
- [ ] 時間窓、分母、最低母数、除外日、欠損/打切り表示を確認。
- [ ] Workspace/Service/User/Bunshin/OEM越境の拒否テストを確認。
- [ ] 元素材・本文・秘密情報がEvidence/ログ/指示案へ出ないことを確認。
- [ ] Candidateの承認/却下、操作監査、取消時の指示案無効化を確認。
- [ ] 修正前後比較と観測不足時の保留、再発時のREOPEN手順を確認。
- [ ] 人間の開発開始・merge・本番反映の運用を確認。
