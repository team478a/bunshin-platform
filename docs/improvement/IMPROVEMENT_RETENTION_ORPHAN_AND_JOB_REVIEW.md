# Feedback期限処理 — 孤立scopeとJob本人参照の監査

## 結論・範囲

2026-10-03 Asia/Tokyo、基準main `f135b2e73ce7292d19aeeef0edde6fbe87598c32`（PR #1093 merge確認）、ブランチ `codex/improvement-retention-orphan-audit`。Windows / Node24.21.0 / pnpm10.10.0。別checkoutの未コミット変更に触れていない。

**期限超過データがあっても新Jobを作れないscopeが存在する。現在の退会計画はUserのsoft DELETED・Generic Jobのpseudonymous本人参照保持であり、Job参照消去/180日削除を既に保証する仕様ではない。** Feedback原本90日/候補週終了90日/最小操作監査180日の承認を、全Job履歴へ拡大しない。

今回の変更は内部Cronの孤立presence検出、未確認とfalseの区別、現行Repository/FKの再現テスト、後続設計。Job/schema/migration/保持日数/退会規則は変更しない。不可逆履歴削除、System Account、別Userの権限借用、新Worker/queue、管理UI書込を追加しない。

## 現行の正本と証拠

| 項目              | コード/文書                                                                                                                        | 現行契約と差分                                                                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Job requester必須 | `packages/application/src/job-runtime.ts:JobContext/Job`、`packages/database/prisma/schema.prisma:Job`                             | `requestedBy: string`、NOT NULL、User `onDelete: Restrict`。maintenance専用主体の型はない                                                                                                                                  |
| 登録不能scope     | `PrismaImprovementFeedbackRetentionJobRepository.schedule`                                                                         | WorkspaceMembershipが0ならLATERAL取得で候補から除外。ACTIVE所属でなくても残存行があれば登録可能。「所属失効」と「所属行消失」を区別する                                                                                    |
| 通常Job認可       | `packages/database/src/automation-jobs.ts:PrismaJobRepository.enqueue`                                                             | ACTIVE Workspace/所属の通常認可を維持。期限処理の内部経路を公開enqueueへ拡張しない                                                                                                                                         |
| 退会開始          | `packages/database/src/account-deletion.ts:PrismaAccountDeletionExecutionRepository.claimAndSuspendNext`                           | 本人をrequestedByとするPENDING/LEASED/RETRY_SCHEDULEDを、Job種類を問わずCANCELLEDへ。maintenanceも取消対象                                                                                                                 |
| 退会完了          | `packages/database/src/account-deletion-purge.ts:completeAfterAuthDeletion`                                                        | 本人Feedback消去/最小audit actor NULL、Membership REVOKED、User DELETED。Generic JobのrequestedByは消さず、Membership行も削除しない                                                                                        |
| 翌日の内部登録    | 期限処理scheduler                                                                                                                  | 本人参照が残るREVOKED所属も候補。退会で取消された当日keyは再作成しないが、期限切れ候補等が残れば翌UTC日にDELETED UserをrequestedByとして再登録できる。ログイン権限復活ではないが、保守作業の帰属と本人操作が同じ列に混ざる |
| 180日超のJob      | `schedule` / `purgeExpiredImprovementFeedbackInTransaction`                                                                        | purge対象はFeedback/Candidate/auditであってjobsではない。Job専用expiresAt/固定終端時刻の規約はない                                                                                                                         |
| Job逆参照         | schemaの`LineDeliveryRetryRequest`、`BadgeLineDeliveryRetryRequest`、`VideoRenderRetryRequest`、`VideoSceneGenerationRetryRequest` | JobへRestrict参照。一括Job削除は再試行証跡を壊す/拒否され得る。今回はこの4種の実Provider処理へ横展開しない                                                                                                                 |
| 既存退会方針      | `docs/ACCOUNT_DELETION_EXECUTION_PLAN.md` §1/§3.5/§8                                                                               | Userを物理削除せず監査参照を保持。User/監査/AI usage等の期間は人間確認事項。新しいFeedback限定auditの方針で全基盤を自動変更しない                                                                                          |

`DELETED`参照を「完全匿名」とは呼ばない。本人IDとJob時刻/Workspace/Serviceへの参照が残り、他の記録と関連付け得る。本監査は実コードのデータ保持差分であり、法的適合性の判断ではない。

## 今回の検出経路

- scheduler選択と同じRepeatableRead txで、期限超過Feedback/Candidate/auditをWorkspace/Service単位に束ね、既存Groupに属しWorkspaceMembershipが1行もないscopeの存在を検出する。SQL断片を共通化し、期限境界の別実装を作らない。
- 出力は `orphanedScopesDetected: boolean` だけ。原本/人数/件数/User/Service/Workspace IDを公開しない。特定のServiceの状態を一般利用者へ表示しない。
- 既存Cron認証後だけHTTP結果・固定分類logへ接続。`feedbackRetentionOrphanedScopesDetected=true` は「読取snapshotに登録不能scopeがある」。既に登録されたJobがそのscopeを処理できる場合もあり、すべての削除が不能と断定しない。
- `false` はそのsnapshot/DBでその条件がなかった意味。全scopeの期限内削除、queue drain、バックアップ消滅を証明しない。環境ごとのDB分離/本番件数は未確認。
- query・選択・登録が失敗した場合は `feedbackRetentionSchedulingFailed=true`、presenceは`null`（未確認）。登録数も`null`とし、途中まで登録されていた可能性を0件で隠さない。通常Missionのworkerは継続する。
- 正常なpresence検出は固定分類 `FEEDBACK_RETENTION_ORPHANED_SCOPE` で報告する。自動修復/別User選択/対象削除は実行しない。Operatorは一般ログから個人原本を探索せず、別途承認済みscope限定の確認手順が必要。
- statement timeout 2秒/tx3秒・最大20登録候補・既存lease/日次keyを維持。二つのqueryによる実本番負荷/監視先への通知は未確認。今回外部通知は送らない。

## 現行挙動を確定する試験

| 試験                 | 実行層・観測対象                                | 安全性の扱い                                                                                                                                                                    |
| -------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| presence true/false  | 実scheduler＋注入DB responseの単体テスト        | summaryの最小projection、RepeatableRead、境界不明をfalseにしない契約。SQL実挙動は隔離DBで別検証                                                                                 |
| query失敗/結果欠落   | 実scheduler単体                                 | 例外を隠さずHTTPで未確認。外部通信なし                                                                                                                                          |
| HTTP認証/最小投影    | 実HTTP境界＋fake scheduling port                | 認証前未実行、queryで環境変更不可、private ID/countを転送しない。通常worker継続                                                                                                 |
| 期限超過・所属行消失 | 隔離DBの既存ownerlessケースを強化               | 原本が残りJob登録できない現行制約をtrueで検出。削除保証未達を合格扱いしない                                                                                                     |
| 退会開始→完了→翌日   | 実Request/Execution/Purge Repository、scheduler | leased maintenance Job取消、別Workspace Job不変、Generic requester保持、DELETED所属からの翌日登録。`characterization`として記録し、参照消去完了とは扱わない                     |
| 古い終端Job・User FK | 実DB/実scheduler                                | 181日前に終端した合成Jobが残り、User物理DELETEをP2003で拒否。そのfixture Jobだけを除去後にDELETE可能。Job FKを他のFKと切り分けるテストであり、本番User物理削除を推奨/実装しない |

退会完了試験は「外部Auth削除が確認済み」というRepository前提を合成fixtureで置き、Auth API/Storageを呼ばない。実退会E2E、組織移管、任意の個人素材削除まで検証済みとはしない。すべて合成User/素材なし、fetch guardと既存localhost/non-production DB guard。失敗assertion/skipで現行リスクを隠さない。

```text
pnpm --filter @bunshin/database exec vitest run test/improvement-retention-orphan.test.ts test/improvement-feedback-retention.test.ts test/improvement-feedback.test.ts test/improvement-feedback-observation-adapter.test.ts
pnpm --filter web exec vitest run test/job-worker.test.ts
pnpm --filter @bunshin/application exec vitest run test/improvement-feedback-retention-job.test.ts test/job-worker.test.ts
pnpm --filter @bunshin/database exec tsc --noEmit
pnpm --filter web typecheck
pnpm architecture:check
git diff --check
```

隔離DBの再実行は既存 `pnpm test:integration`。最新headの全体format/typecheck/lint/test/buildとDB件数はPR検証欄へ固定する。旧PRの成功を流用しない。ローカルDocker daemon未起動のため実DBローカル成功とは報告しない。

## 後続の最小案（未実装・方針承認前）

推奨は**本人を実行主体にしない、Feedback purge限定maintenance Job契約**。新しいWorker/キュー/ログイン可能なSystem Userを作らず、既存Jobのclaim/leaseを再利用する。

1. 通常User JobのrequestedBy必須・認可を維持し、maintenanceだけ主体なしをDB CHECKとApplication型で明示する。単なるnullable化や型castで既存actor認可を迂回しない。`fortune-generation-job`、`mission-automation-jobs`、Web handlers等のrequestedBy消費箇所も型/否定テストを伴って確認する。
2. 対象Job種・payload版・Bunshin/Capability無し・trusted登録口を固定し、通常User enqueueからmaintenance種を拒否する。退会取消はUser Jobを停止し、Userを持たないmaintenanceはその本人取消に巻き込まない。Workspace/Service消失は保存済みJob照合と既存削除保護を維持する。
3. 新規maintenance Jobに本人参照を付けない。既存purge Jobの参照は、同scope/種/版を検証した対象だけの移行案をレビューする。既存Job全体のactorやretry auditをNULL化しない。既存退会User物理削除を開始しない。
4. Job履歴期間は別承認。候補は**Feedback purge終端Jobのみ終端後180日**（提案で未承認）。SUCCEEDEDはcompletedAt、CANCELLEDはcancelledAt、DEADは固定terminalAt等を設計する。可変updatedAt/再読込を起算日として延長せず、未開始/leased/retryを期限だけで削除しない。原本/候補の保持は現行90日を維持。
5. 期間経過後は逆参照・実行状態・重複keyの保証期間を検証して限定削除。過去key削除が同日再送や旧配送の扱いへ与える影響、日次keyの日付検証、終端後復帰、キャンセルをテストする。通常LINE/動画/請求/利用量の証跡へ期限を横展開しない。

| 比較案                             | 判断                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| 別WorkspaceのUser/本部Userを借りる | 所有境界・操作帰属が不正確。採用しない                                          |
| WorkspaceごとのSystem User         | アカウント作成/権限/保持の新運用が増える。初手にしない                          |
| 全Jobを一律180日で消す             | 既存保持未承認、retry FK/課金証跡/重複keyを壊す可能性。採用しない               |
| Cronから直接全scope purge          | 保持対象限定は可能だが既存Job lease/再開を迂回。代替検討には別の責務/検証が必要 |
| purge限定maintenance主体           | 推奨。Core型/schema/移行/保持条件を先にレビューし、小PRへ分割する               |

次に必要な承認は、purge限定maintenance主体・既存purge requesterの限定移行・終端履歴180日・稼働中Jobの非削除・通常Jobへの非横展開の方針。承認後もschema/lease/退会/保持削除は切り戻せる単位に分け、不可逆cleanupは最後にする。今回この承認を推測して実装しない。

## 本番条件と切り戻し

実Cron周期・本番SHA/migration・孤立scope実数・大量query負荷・保存先/backup/復元時削除再適用・実Auth/退会は未確認。本番DB/資格情報・実ユーザー素材、実生成/配信/課金、merge/deployを使用しない。今回のpresence/HTTP投影だけはrevert可能で、JobやFeedbackを消すrollbackは不要。保持/削除trigger・RLSは戻さない。
