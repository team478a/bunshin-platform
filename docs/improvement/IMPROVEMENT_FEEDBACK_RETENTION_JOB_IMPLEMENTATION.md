# Feedback保持期限 — 既存Job接続 V1

## 結論・基準

2026-10-03 Asia/Tokyo、基準main `38a04b86e5e468f85ab4249ede469542390fce8c`（PR #1092 merge確認）、ブランチ `codex/improvement-feedback-retention-jobs`。Windows / Node24.21.0 / pnpm10.10.0。原本受付90日、候補週終了90日、最小操作監査180日の承認済み方針を変更しない。

既存Cron認証・Job claim/lease・有限backoff・Workerへscope限定purgeを接続する。新Worker/キュー/Provider/公開削除口、管理UI書込、実装承認、自動修正は追加しない。schema/migration/依存/CI/本番設定は変更しない。コードの接続と、本番で期限内に物理削除される運用保証は分ける。

## 経路と責務

```text
既存 /api/internal/jobs/run のCron認証
  → DB内部scheduler（期限切れのWorkspace/Serviceだけ）
  → 既存Jobへ日次登録
  → 既存ClaimJob / RunJobWorkerBatch
  → ExecuteImprovementFeedbackRetentionJob
  → DB: Job lock → Service lock → bounded purge → Job完了/継続
```

- runtime environmentはサーバー設定だけ。HTTP queryでscope/日付/limit/環境を変更できない。scheduler失敗は固定error codeで記録・レスポンスの `feedbackRetentionSchedulingFailed` で報告し、通常Mission Jobを止めない。例外本文・本人ID・Feedback内容をログへ出さない。
- schedulerは原本/Candidate/auditの期限切れだけをunionし、最古期限から最大20scopeを選ぶ。選択SQLはstatement timeout 2秒、tx 3秒。登録ループは5秒を超えたら次回へ残す（進行中txは待機2秒/tx3秒上限）。大量履歴での本番query plan/実測は未確認。
- `feedback-purge:feedback-retention-v1:<service UUID>:<UTC日>` と既存environment/key uniqueを使用。同Service lock下で同scope未完Jobを再確認し、日付を跨ぐ並行schedulerでも二つの未完Jobを作らない。今日の完了/DEAD/CANCELLEDを同日中に再登録しない。DEAD/CANCELLEDで残データがある場合は翌UTC日のschedulerで新しいJobにできる。毎日成功したJobが存在しても次回期限到達分は翌日登録対象。
- 通常 `PrismaJobRepository.enqueue` のACTIVE所属条件は変更しない。専用のtrusted登録ではService/Workspace停止・所属失効を削除延期の理由にしない。Jobの必須requestedByには既存WorkspaceMembershipのUser参照を使う。本人が削除を依頼したという意味ではなく、権限委譲にも使わない。
- 原本にはenvironment列がない。削除単位は物理DBのWorkspace/Service、全環境に同じ保持方針を適用する。Candidateの環境別権限を別環境へ移す/読取許可することはしない。環境ごとのDB分離は本番確認が必要。

## 原子性・再開

- 保存済みJobが正本。Job ID、Workspace、environment、type、payload、Bunshin/Capability無し、LEASED状態、worker、lease時刻、attempt番号を照合。入力はawait前に固定し、古いleaseや同じworker IDの旧配送でも削除しない。
- Job行lockを先に取得。既存purgeをpackage内部tx関数へ抽出し、同txでService lockと各表最大100件を削除する。原本削除triggerの候補STALE化/根拠hash消去、候補削除時のaudit参照NULL化をそのまま再利用。原本・素材・Memoryを別Serviceへ移さない。
- 原本 `createdAt <= now - 90日`、候補/audit `expiresAt <= now` の境界を固定。最大件数に達した場合は保守的に `RETRY_SCHEDULED`、60秒後に再読込。正確な残件数を取得したとはしない。最後の空batchもあり得る。
- 正常な継続でattemptCountを0へ戻すのは「処理が進んだbatchは障害ではない」ため。失敗は既存FailJob（30秒から指数backoff、最大5回）を使いDEADへ進む。無限に障害再試行しない。ただしプロセスがfail処理にも到達せず死ぬ場合のlease再claimは既存共通Jobの契約であり、今回有限上限を新しく保証しない。
- purge後とJob更新後にも現在のlease期限を確認する。期限到達なら全rollback。処理の途中失敗・Job更新失敗でも削除と状態遷移を別々に確定しない。失敗記録のDBまで失敗すると既存WorkerがinfrastructureFailuresを報告し、lease expiry後に回復する。
- commit応答が失われても新実行は保存済みJobを読む。SUCCEEDEDへの古い配送はCONFLICT、継続は保存済み次回時刻から再claim。削除のために動画生成や通知再送を行わない。

## 検証・再実行

```text
pnpm --filter @bunshin/application exec vitest run test/improvement-feedback-retention-job.test.ts test/job-worker.test.ts test/improvement-feedback-triage.test.ts test/improvement-feedback-review-evidence.test.ts
pnpm --filter @bunshin/database exec vitest run test/improvement-feedback-retention.test.ts test/improvement-feedback.test.ts test/improvement-feedback-observation-adapter.test.ts
pnpm --filter web exec vitest run test/job-worker.test.ts
pnpm --filter @bunshin/database exec tsc --noEmit
pnpm --filter @bunshin/application typecheck
pnpm --filter web typecheck
pnpm architecture:check
git diff --check
```

追加実DBケースは既存 `database.integration.test.ts` へ登録。正常/停止scope・並行scheduler・未完Jobの日跨ぎ抑止、90日期限と100件継続、新インスタンス再claim、scope/environment/payload/lease/配送番号拒否、削除中/Job更新後のlease切れrollback、重複配送1commit、CANCELLED拒否、Job更新故障rollbackと既存FailJob回復、5回上限/翌日再登録、候補90日・audit180日と残存参照NULLを確認する。

合成User/素材なし、fetch guard付き、既存localhost/non-production DB guardを維持。テスト専用故障triggerはfinallyで除去。skip/期待失敗・制約緩和を追加しない。ローカルDocker daemon未起動のため実DBをローカル成功とは報告せず、通常CIの隔離PostgreSQL16で検証する。最新headの対象テスト/全体format/typecheck/lint/test/build/隔離DB結果はPRの検証欄に固定する。前PRのCI成功を今回の証拠に使わない。

## 残条件・運用・切り戻し

1. WorkspaceMembershipが一つも残らない孤立scopeは必須requestedByを作れず登録しない。テストはこの制約も明示する。別WorkspaceのUserを借りたりSystem Userを勝手に作ったりしない。**孤立scopeの削除保証は未達**で、次の最小タスクはこの検出/安全な処理主体とGeneric Jobの保持条件を設計すること。
2. JobのrequestedBy/Workspace/payloadには最小でもUser/Service参照が残る。監査actor消去だけで新しいGeneric Job履歴を匿名化したとは言わない。既存Job履歴の保存期限/削除・本人退会とのFK制約を運用前に確認する。
3. 今回はpurge回数・削除件数の新しい永続台帳を作らない。既存Jobの状態/error code/時刻、Worker summary、scheduler failureを観測に使う。削除遅延上限、期限切れ残存件数の監視/alert、全scope公平性・高負荷でのqueue starvationは未測定。固定20scope/5Jobと通常Cronの稼働だけで90日ちょうどの物理削除を保証しない。
4. 前PR migrationの本番適用、実Cron周期・本番SHA、バックアップ保持と復元時の削除再適用、実Supabase権限/E2Eは未確認。ユーザーの実データ・本番資格情報・有料API・Storage・LINE・生成・merge/deployは使用しない。
5. 切り戻しはscheduler登録と専用dispatchの接続を戻す。ただし既に登録されたJobは別途trusted手順で停止/処理する必要があり、本PRのコードrevertだけで登録済みJobは消えない。保持・退会削除trigger/RLSを戻すmigrationは作らない。

読み取り専用管理UI、Candidate確認と実装承認の分離を維持する。このPRの完了はJob接続と指定範囲の検証であり、本番の全保持・削除保証や自動修正の開始ではない。
