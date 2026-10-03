# Feedback期限処理Job — 本人参照なし・終端180日保持

## 結論と承認範囲

2026-10-03 Asia/Tokyo。基準main `f1bb8f9b2d5c4d606fd7cae4f2ec9fbcf635917e`（PR #1094 merge）。ブランチ `codex/feedback-maintenance-job-contract`。Windows、Node24.21.0、pnpm10.10.0。ユーザーの「はい」はpurge限定maintenance主体、既存対象の限定移行、終端後180日保持、稼働中非削除、通常Jobへの非横展開の承認。

既存Job/claim/lease/workerだけを使い、期限処理JobのrequestedByをNULLにする。通常Jobの本人必須・ACTIVE所属認可・退会取消・履歴保持は維持。System Account、新Worker/queue、Provider、公開削除口を作らない。実装/隔離テストと本番適用を区別する。

## 契約と経路

- `job-runtime.ts` の `Job = UserJob | FeedbackMaintenanceJob` はrequestedByのstring/nullで主体を分ける。maintenanceは固定Job種、Bunshin/Capabilityなし。`EnqueueJob`と`PrismaJobRepository.enqueue`の両方が予約種と空の本人を拒否する。
- DB `jobs_actor_contract` は通常JobのrequestedBy NOT NULL相当を維持。NULLを認めるのは `IMPROVEMENT_FEEDBACK_PURGE`、固定v1 correlation/payload、正規Service UUID、scheduledAtのUTC日と一致するkeyだけ。INSERT triggerで同WorkspaceのGroupを照合。通常Jobからmaintenanceへの付替えを拒否する。
- DB mapperは保存された主体を検証する。通常Mission/Fortune/LINE executorとWebの本人消費handlerは、直接呼び出された場合も `assertUserJob` で拒否する。通常Jobの生成/投稿/配信仕様を変えない。
- schedulerは従来の期限超過scope抽出・Service lock・日次key・未完除外を再利用し、WorkspaceMembershipを実行主体として借りない。停止/退会/所属行消失でも期限処理Jobの登録が可能。
- `orphanedScopesDetected` は互換上維持するが、現在は「期限超過scopeに所属行がない」というメタデータ検出であり、登録不能を意味しない。HTTPはpresenceのみ、失敗はnull、raw/個人/件数は出さない。falseを全削除完了とは扱わない。
- executeは保存済みNULL主体・scope/environment/payload/日次key/初期scheduledAt・lease epoch/attemptを照合する。未来のscheduledAtや旧配送を拒否。源データpurgeとJob遷移を同txで確定する既存のfenceを維持する。
- 退会処理の本人requestedBy条件は変更しない。通常User Jobは取り消されるが、NULL主体のmaintenanceは巻き込まれない。退会Userの物理削除を新たに開始しない。

## migrationと保持条件

`20261003050000_feedback_maintenance_job/migration.sql` はtransaction、lock timeout 5秒、statement timeout 30秒。

1. 新フィールド `maintenance_terminal_at` とnullable requesterを追加する。
2. 既存purge行のGroup所有・版・payload・日次key・Capability無し・4種retry逆参照なしを事前確認。想定外が1件でもあれば固定例外で全rollback。行内容/個人情報を表示・補正しない。
3. 合致するpurge行だけ本人参照をNULLへ移行。通常Jobには触れない。
4. 旧SUCCEEDEDはcompletedAt、旧CANCELLEDはcancelledAt。旧DEAD/時刻欠落は移行時刻を起点に保守的に180日保持。updatedAtから古さを推定しない。
5. CHECK/trigger/indexを追加。maintenanceのidentityと終端status/時刻を固定し、終端から再開・期限延長・他scope移動を拒否する。

内部Cronのschedule冒頭で環境限定・最大100行のhistory cleanupを行う。対象はNULL主体のpurge Job、SUCCEEDED/CANCELLED/DEAD、固定終端日時がnow−180日以下、日次keyが今日より前、4種retry逆参照なし。`FOR UPDATE SKIP LOCKED`と既存FKで競合を防ぎ、参照があるものは残す。稼働中PENDING/LEASED/RETRY_SCHEDULEDは古くても消さない。複数回実行で残りを処理する。原本90日/候補週終了90日/限定操作監査180日は変更しない。

history cleanup後の別工程失敗は、それ以前の削除を取り消さない。HTTPのscheduling failed/nullは「全体の登録結果未確認」であり「副作用なし」ではない。履歴削除数やIDを一般レスポンスへ加えない。バックアップ/復元後の再適用と実負荷は未確認。

## 検証と現行リスクからの移行

PR #1094のcharacterization結果は `IMPROVEMENT_RETENTION_ORPHAN_AND_JOB_REVIEW.md` に保存。次の同名領域の試験を安全条件の回帰へ置き換える（skip/期待失敗・assertion緩和ではない）。

| 条件                                | 今回の確認                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| public enqueue/直接Repository呼出し | 予約種・空actorをDB操作前に拒否、通常actor維持                                            |
| DB actor/所有契約                   | actorful purge、actorless通常、別Workspace Service、Bunshin/Capability/版/key不一致を拒否 |
| 所属なし                            | presence=trueでもNULL主体で登録・claim・purge、CANCELLED旧配送は拒否                      |
| 退会開始/完了                       | 通常Job取消、maintenance lease維持、完了後の翌日登録も本人参照なし                        |
| 終端保持                            | SUCCEEDED/CANCELLED/DEADの180日境界、1ms手前を保持、終端復帰/時刻変更拒否                 |
| 通常/環境/稼働中                    | 通常Job・他環境・古いpending/leased/retryの保持、User FKは通常Jobだけで維持               |
| 旧データ移行                        | actual migrationのpreflight/UPDATEをrollback-only隔離txで実行、正常だけNULL、想定外停止   |
| bounded cleanup/FK                  | 102行から最大100ずつ削除、実retry FKの証跡保持、参照解放後だけcleanup                     |
| 既存lease/二重配送/途中故障         | 既存のrollback・scope・競合・継続回帰を維持                                               |

テストは架空User/素材なし、fetch guard、既存localhost/non-production DB guard。migration試験内のconstraint/trigger一時解除はrollback-only隔離txで、productionへは実行しない。実Auth/LINE/Storage/Providerは呼ばない。retry FK試験はDB保存のみで配信検証ではない。

```text
pnpm --filter @bunshin/database db:generate
pnpm --filter @bunshin/application exec tsc --noEmit
pnpm --filter @bunshin/database exec tsc --noEmit
pnpm --filter web exec tsc --noEmit
pnpm --filter @bunshin/application exec vitest run test/feedback-maintenance-job-contract.test.ts test/mission-automation-jobs.test.ts test/fortune-generation-job.test.ts test/line-delivery-job.test.ts test/badge-line-delivery-job.test.ts test/improvement-feedback-retention-job.test.ts
pnpm --filter @bunshin/database exec vitest run test/feedback-maintenance-job-contract.test.ts test/improvement-retention-orphan.test.ts
pnpm test:integration
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
git diff --check
```

実行結果/最新head CIはPR検証欄へ固定。ローカルDocker daemon未起動で隔離DBのローカル実行は未確認、通常CIの隔離PostgreSQLで検証する。初回型チェックでbadgeのfixtureがPartial<Job>（maintenanceまで混ぜる型）で失敗し、UserJob専用fixtureへ修正。正常な通常Jobのassertionは維持する。

初回head `466306c604c684dd8b0fdd73423982e917985667` のCI `37098230643` ではmigration/readiness成功、隔離DB85件成功・1件失敗。翌日に進めたownerless試験のglobal claimが、先行ケースで意図的に残した期限切れleaseを取得した。suite-localの合成Workspaceを終了時に清掃し、同じJob ID/完了/削除のassertionを維持して再実行する。通常Jobや他試験scopeを一括削除しない。対象lintの不要な型cast2箇所も除去した。古いheadの成功や途中成功を最終証拠へ流用しない。

## リリース・切り戻し・残条件

旧アプリはNULL主体を扱えない。schema readinessだけで並行稼働が安全とはしない。責任者承認の運用でCron/worker停止・稼働中lease drain→既存purge行の限定preflight→migration→新アプリ→再開が必要。migration失敗時は旧schemaのままrollbackし、scope別の確認後に再計画する。今回本番操作はしない。

不可逆cleanupをrollbackで復元できるとは言わない。最初の切り戻しはCron/worker停止で追加cleanupを止め、新契約を扱える版を維持する。旧アプリだけへ戻す/全NULLを推測したUserへ補完/NOT NULLへ戻す操作は禁止。履歴復元は承認済みbackup手順と期限超過データ再削除が必要。

次の最小タスクはリリース前の停止/drain・限定preflight・backup/復元時削除再適用の運用手順レビュー。production SHA、Cron周期、件数、負荷、実退会E2E、保存媒体の削除保証は未確認。本番DB/資格情報探索、課金・実生成/実送信、merge/deployは実施しない。
